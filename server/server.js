require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3001;

// Configurazione modalità sviluppo
const DEV_MODE = process.env.NODE_ENV === 'development';

// Struttura per memorizzare temporaneamente i token
let userTokens = {};

// Middleware
app.use(cors());
app.use(express.json());

// Configurazione log per debugging
const DEBUG = process.env.NODE_ENV !== 'production';

function logDebug(...args) {
  if (DEBUG) console.log('[DEBUG]', ...args);
}

function logError(...args) {
  console.error('[ERROR]', ...args);
}

// Google OAuth setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.REDIRECT_URI
);

// Funzione per assicurare che il token sia valido
async function ensureValidToken() {
  if (userTokens.access_token) {
    const expiryDate = userTokens.expiry_date;
    const now = new Date().getTime();
    
    if (!expiryDate || expiryDate - now < 300000) {
      try {
        logDebug('Token in scadenza, tentativo di refresh');
        oauth2Client.setCredentials(userTokens);
        const { credentials } = await oauth2Client.refreshToken(userTokens.refresh_token);
        userTokens = credentials;
        oauth2Client.setCredentials(credentials);
      } catch (error) {
        logError('Errore nel refresh del token:', error);
        throw new Error('Sessione scaduta, effettua nuovamente il login');
      }
    }
  }
}

// Endpoint per generare l'URL di autenticazione
app.get('/api/auth/url', (req, res) => {
  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events'
  ];

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });

  res.json({ url });
});

// Endpoint per gestire il callback di OAuth
app.get('/api/auth/callback', async (req, res) => {
  const { code } = req.query;
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    // Salva i token per uso futuro
    userTokens = tokens;
    oauth2Client.setCredentials(tokens);
    
    // Redirect al frontend
    res.redirect(`${process.env.CLIENT_URL}?auth=success`);
  } catch (error) {
    logError('Errore di autenticazione:', error);
    res.redirect(`${process.env.CLIENT_URL}?auth=error`);
  }
});

// Endpoint per recuperare il token
app.get('/api/auth/token', (req, res) => {
  if (userTokens.access_token) {
    res.json({ 
      accessToken: userTokens.access_token,
      expiryDate: userTokens.expiry_date 
    });
  } else if (DEV_MODE) {
    // Solo in sviluppo: crea un token di prova che funziona davvero
    console.log('[DEV] Generando un token di sviluppo temporaneo');
    
    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events'
      ]
    });
    
    auth.getClient().then(client => {
      client.getAccessToken().then(token => {
        userTokens.access_token = token.token;
        userTokens.expiry_date = new Date().getTime() + 3600000; // 1 ora
        
        res.json({
          accessToken: userTokens.access_token,
          expiryDate: userTokens.expiry_date,
          dev: true
        });
      }).catch(err => {
        console.error('[DEV] Errore nel generare token:', err);
        res.status(401).json({ error: 'Nessun token disponibile' });
      });
    }).catch(err => {
      console.error('[DEV] Errore nel creare client:', err);
      res.status(401).json({ error: 'Nessun token disponibile' });
    });
  } else {
    res.status(401).json({ error: 'Nessun token disponibile' });
  }
});

// Endpoint per elaborare comandi tramite Gemini
app.post('/api/process-command', async (req, res) => {
  const { command, accessToken } = req.body;
  
  if (!command) {
    return res.status(400).json({ error: 'Comando mancante' });
  }
  
  try {
    // Log dello stato dei token
    logDebug('Stato token server:', userTokens.access_token ? 
      `Presente (scade in ${Math.floor((userTokens.expiry_date - Date.now())/1000/60)} minuti)` : 
      'Assente');
    logDebug('Token client:', accessToken ? 'Presente' : 'Assente');
    
    // Log specifici per il formato del token client
    if (accessToken) {
      logDebug('Token client (primi 10 caratteri):', accessToken.substring(0, 10) + '...');
      // Verifica se sembra un token JWT (formato tipico)
      const isJWT = accessToken.split('.').length === 3;
      logDebug('Il token sembra un JWT?', isJWT ? 'Sì' : 'No');
    }
    
    // Usa prima i token salvati sul server
    if (userTokens.access_token) {
      await ensureValidToken();
      oauth2Client.setCredentials(userTokens);
    } else if (accessToken) {
      // Fallback al token dal client con formato corretto
      oauth2Client.setCredentials({ 
        access_token: accessToken,
        token_type: 'Bearer'
      });
    } else {
      throw new Error('Nessun token di accesso disponibile');
    }
    
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    // Test di validità dell'autenticazione
    try {
      const testCall = await calendar.calendarList.list({ maxResults: 1 });
      logDebug('Test Calendar API riuscito');
    } catch (calError) {
      logError('Test Calendar API fallito:', calError.response?.data || calError.message);
      throw new Error('Autenticazione Calendar fallita: ' + calError.message);
    }

    // Invia il comando a Gemini per l'interpretazione
    const geminiResponse = await processWithGemini(command, calendar);
    
    res.json({ result: geminiResponse });
  } catch (error) {
    logError('Errore nell\'elaborazione del comando:', error);
    res.status(500).json({ 
      error: 'Errore nell\'elaborazione del comando',
      details: error.message 
    });
  }
});

// Funzione per elaborare comandi con Gemini
async function processWithGemini(command, calendarClient) {
  // Endpoint corretto verificato
  const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
  
  // Prompt di sistema per Gemini
  const systemPrompt = `Sei un assistente che aiuta a gestire il calendario Google. 
  Interpreta il comando dell'utente per determinare quale operazione eseguire:
  1. Crea evento
  2. Modifica evento
  3. Visualizza eventi
  4. Elimina evento
  5. Altro (specificare)
  
  Per ogni comando, estrai i dettagli pertinenti come data, ora, titolo, descrizione, partecipanti, ecc.
  Rispondi in formato JSON con i campi "action" e "parameters".`;

  try {
    logDebug('Invio richiesta a Gemini API:', GEMINI_ENDPOINT);
    logDebug('Comando:', command);
    
    // Chiamata all'API Gemini
    const response = await axios.post(
      GEMINI_ENDPOINT,
      {
        contents: [{
          parts: [
            { text: systemPrompt },
            { text: command }
          ]
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1024,
          topP: 0.8
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY
        }
      }
    );

    logDebug('Risposta ricevuta da Gemini API');
    
    // Estrai il testo dalla risposta
    if (!response.data.candidates || !response.data.candidates[0] || 
        !response.data.candidates[0].content || !response.data.candidates[0].content.parts) {
      throw new Error('Formato risposta Gemini non valido');
    }
    
    const geminiResult = response.data.candidates[0].content.parts[0].text;
    
    // Pulisci il testo della risposta (rimuovi backtick se presenti)
    const cleanedResult = geminiResult.replace(/```json/g, '').replace(/```/g, '').trim();
    
    try {
      // Parsing della risposta JSON
      const parsedResult = JSON.parse(cleanedResult);
      logDebug('Interpretazione comando:', parsedResult);
      
      // Esegui l'azione appropriata sul calendario
      return await executeCalendarAction(parsedResult, calendarClient);
    } catch (parseError) {
      logError('Errore nel parsing JSON della risposta:', cleanedResult);
      logError('Dettaglio errore:', parseError);
      
      // Fallback a un parser locale semplice
      logDebug('Utilizzo parser locale di fallback');
      const fallbackResult = basicCommandParser(command);
      return await executeCalendarAction(fallbackResult, calendarClient);
    }
  } catch (error) {
    logError('Errore nella comunicazione con Gemini:', error.message);
    
    if (error.response) {
      logError('Dettagli risposta errore:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    }
    
    // Fallback a un parser locale semplice se l'API fallisce
    logDebug('Utilizzo parser locale di fallback');
    const fallbackResult = basicCommandParser(command);
    return await executeCalendarAction(fallbackResult, calendarClient);
  }
}

// Parser locale di base come fallback
function basicCommandParser(command) {
  logDebug('Parsing locale del comando:', command);
  const lowerCommand = command.toLowerCase();
  let action = null;
  let parameters = {};
  
  // Estrazione del titolo
  const titleMatch = command.match(/chiamat[oa]\s+([^,\.]+)/i) || 
                     command.match(/intitolat[oa]\s+([^,\.]+)/i) ||
                     command.match(/\b(evento|riunione|appuntamento)\s+([^,\.]+)/i);
  
  const title = titleMatch ? (titleMatch[1] || titleMatch[2]).trim() : 'Nuovo evento';
  
  // Estrazione base della data e ora
  const timeMatch = command.match(/(\d{1,2})[:\.](\d{2})/);
  const hourMatch = command.match(/\b(\d{1,2})\s*(am|pm|del mattino|del pomeriggio|di sera)/i);
  
  // Calcola data/ora base per eventi
  const now = new Date();
  const startDateTime = new Date(now);
  
  if (timeMatch) {
    startDateTime.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]), 0);
  } else if (hourMatch) {
    let hour = parseInt(hourMatch[1]);
    const period = hourMatch[2].toLowerCase();
    if ((period === 'pm' || period.includes('pomeriggio') || period.includes('sera')) && hour < 12) {
      hour += 12;
    }
    startDateTime.setHours(hour, 0, 0);
  }
  
  const endDateTime = new Date(startDateTime);
  endDateTime.setHours(endDateTime.getHours() + 1);
  
  // Determina l'azione in base alle parole chiave
  if (lowerCommand.includes('crea') || lowerCommand.includes('nuovo') || 
      lowerCommand.includes('aggiungi') || lowerCommand.includes('fissa')) {
    action = 'CREATE_EVENT';
    parameters = {
      title: title,
      startDateTime: startDateTime.toISOString(),
      endDateTime: endDateTime.toISOString(),
      description: ''
    };
  } else if (lowerCommand.includes('mostra') || lowerCommand.includes('visualizza') || 
             lowerCommand.includes('elenco') || lowerCommand.includes('vedi')) {
    action = 'VIEW_EVENTS';
    parameters = {
      maxResults: 10
    };
  } else if (lowerCommand.includes('modifica') || lowerCommand.includes('sposta') || 
             lowerCommand.includes('cambia') || lowerCommand.includes('aggiorna')) {
    action = 'UPDATE_EVENT';
    parameters = {
      title: title,
      startDateTime: startDateTime.toISOString(),
      endDateTime: endDateTime.toISOString()
    };
  } else if (lowerCommand.includes('elimina') || lowerCommand.includes('cancella') || 
             lowerCommand.includes('rimuovi')) {
    action = 'DELETE_EVENT';
    parameters = {
      title: title
    };
  } else {
    // Default: visualizza eventi
    action = 'VIEW_EVENTS';
    parameters = {
      maxResults: 10
    };
  }
  
  logDebug('Risultato parsing locale:', { action, parameters });
  return { action, parameters };
}

// Funzione per eseguire azioni sul calendario
async function executeCalendarAction(parsedCommand, calendar) {
  const { action, parameters } = parsedCommand;
  
  switch (action) {
    case 'CREATE_EVENT':
      return await createEvent(calendar, parameters);
    case 'UPDATE_EVENT':
      return await updateEvent(calendar, parameters);
    case 'VIEW_EVENTS':
      return await listEvents(calendar, parameters);
    case 'DELETE_EVENT':
      return await deleteEvent(calendar, parameters);
    default:
      return { 
        success: false,
        message: 'Azione non supportata', 
        details: action 
      };
  }
}

// Funzioni per operazioni sul calendario
async function createEvent(calendar, params) {
  const event = {
    summary: params.title || 'Nuovo evento',
    description: params.description || '',
    start: {
      dateTime: params.startDateTime || new Date().toISOString(),
      timeZone: 'Europe/Rome',
    },
    end: {
      dateTime: params.endDateTime || new Date(new Date().getTime() + 3600000).toISOString(),
      timeZone: 'Europe/Rome',
    },
    attendees: params.attendees ? params.attendees.map(email => ({ email })) : [],
  };

  try {
    logDebug('Creazione evento:', event);
    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });
    
    return {
      success: true,
      message: 'Evento creato con successo',
      eventId: response.data.id,
      eventLink: response.data.htmlLink
    };
  } catch (error) {
    logError('Errore nella creazione dell\'evento:', error);
    throw new Error('Impossibile creare l\'evento: ' + error.message);
  }
}

async function updateEvent(calendar, params) {
  try {
    // Prima dobbiamo trovare l'evento da aggiornare
    let eventId = params.eventId;
    
    if (!eventId && params.title) {
      // Cerca per titolo se non abbiamo l'ID
      logDebug('Ricerca evento per titolo:', params.title);
      const searchResponse = await calendar.events.list({
        calendarId: 'primary',
        q: params.title,
        timeMin: new Date().toISOString(),
        maxResults: 1,
        singleEvents: true,
        orderBy: 'startTime',
      });
      
      if (searchResponse.data.items.length > 0) {
        eventId = searchResponse.data.items[0].id;
        logDebug('Evento trovato con ID:', eventId);
      } else {
        throw new Error('Evento non trovato');
      }
    }
    
    // Ottieni l'evento esistente
    const eventResponse = await calendar.events.get({
      calendarId: 'primary',
      eventId: eventId,
    });
    
    const existingEvent = eventResponse.data;
    
    // Prepara l'evento aggiornato
    const updatedEvent = {
      ...existingEvent,
      summary: params.title || existingEvent.summary,
      description: params.description !== undefined ? params.description : existingEvent.description,
    };
    
    // Aggiorna data/ora se forniti
    if (params.startDateTime) {
      updatedEvent.start = {
        dateTime: params.startDateTime,
        timeZone: 'Europe/Rome',
      };
    }
    
    if (params.endDateTime) {
      updatedEvent.end = {
        dateTime: params.endDateTime,
        timeZone: 'Europe/Rome',
      };
    }
    
    // Aggiorna partecipanti se forniti
    if (params.attendees) {
      updatedEvent.attendees = params.attendees.map(email => ({ email }));
    }
    
    logDebug('Aggiornamento evento:', updatedEvent);
    const response = await calendar.events.update({
      calendarId: 'primary',
      eventId: eventId,
      resource: updatedEvent,
    });
    
    return {
      success: true,
      message: 'Evento aggiornato con successo',
      eventId: response.data.id,
      eventLink: response.data.htmlLink
    };
  } catch (error) {
    logError('Errore nell\'aggiornamento dell\'evento:', error);
    throw new Error(`Impossibile aggiornare l'evento: ${error.message}`);
  }
}

async function listEvents(calendar, params) {
  try {
    const timeMin = params.startDate 
      ? new Date(params.startDate).toISOString() 
      : new Date().toISOString();
    
    const timeMax = params.endDate 
      ? new Date(params.endDate).toISOString() 
      : new Date(new Date().setDate(new Date().getDate() + 7)).toISOString();
    
    logDebug('Ricerca eventi dal', timeMin, 'al', timeMax);
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin,
      timeMax: timeMax,
      maxResults: params.maxResults || 10,
      singleEvents: true,
      orderBy: 'startTime',
      q: params.query || ''
    });
    
    const events = response.data.items;
    
    if (events.length === 0) {
      return {
        success: true,
        message: 'Nessun evento trovato nel periodo specificato',
        events: []
      };
    }
    
    const formattedEvents = events.map(event => {
      return {
        id: event.id,
        title: event.summary || 'Evento senza titolo',
        description: event.description || '',
        start: event.start.dateTime || event.start.date,
        end: event.end.dateTime || event.end.date,
        link: event.htmlLink,
        attendees: event.attendees ? event.attendees.map(a => a.email) : []
      };
    });
    
    logDebug('Eventi trovati:', formattedEvents.length);
    return {
      success: true,
      message: `Trovati ${events.length} eventi`,
      events: formattedEvents
    };
  } catch (error) {
    logError('Errore nel recupero degli eventi:', error);
    throw new Error('Impossibile recuperare gli eventi: ' + error.message);
  }
}

async function deleteEvent(calendar, params) {
  try {
    let eventId = params.eventId;
    
    if (!eventId && params.title) {
      // Cerca per titolo se non abbiamo l'ID
      logDebug('Ricerca evento da eliminare con titolo:', params.title);
      const searchResponse = await calendar.events.list({
        calendarId: 'primary',
        q: params.title,
        timeMin: new Date().toISOString(),
        maxResults: 1,
        singleEvents: true,
        orderBy: 'startTime',
      });
      
      if (searchResponse.data.items.length > 0) {
        eventId = searchResponse.data.items[0].id;
        logDebug('Evento trovato con ID:', eventId);
      } else {
        throw new Error('Evento non trovato');
      }
    }
    
    logDebug('Eliminazione evento con ID:', eventId);
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId,
    });
    
    return {
      success: true,
      message: 'Evento eliminato con successo'
    };
  } catch (error) {
    logError('Errore nell\'eliminazione dell\'evento:', error);
    throw new Error(`Impossibile eliminare l'evento: ${error.message}`);
  }
}

// Avvio server
app.listen(PORT, () => {
  console.log(`Server in esecuzione sulla porta ${PORT}`);
  logDebug('Ambiente:', process.env.NODE_ENV || 'development');
  logDebug('API Gemini configurata');
});