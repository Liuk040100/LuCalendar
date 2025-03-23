require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { google } = require('googleapis');
const session = require('express-session');
const FileStore = require('session-file-store')(session);

const app = express();
const PORT = process.env.PORT || 3001;

// Configurazione modalità sviluppo
const DEV_MODE = process.env.NODE_ENV === 'development';

// Middleware
app.use(cors());
app.use(express.json());

// Configurazione delle sessioni
app.use(session({
  store: new FileStore({
    path: './sessions',
    ttl: 86400 // 24 ore
  }),
  secret: process.env.SESSION_SECRET || 'lucalendar-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 ore
  }
}));

// Configurazione log per debugging
const DEBUG = process.env.NODE_ENV !== 'production';

function logDebug(...args) {
  if (DEBUG) console.log('[DEBUG]', ...args);
}

function logError(...args) {
  console.error('[ERROR]', ...args);
}

// Funzione migliorata per logging di oggetti
function debugObject(label, obj) {
  if (DEBUG) {
    console.log(`[DEBUG] ${label}:`);
    console.log(JSON.stringify(obj, null, 2));
  }
}

// Google OAuth setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.REDIRECT_URI
);

// Funzione migliorata per assicurare che il token sia valido
async function ensureValidToken(req) {
  // Verifica iniziale più robusta per la presenza dei token
  if (!req.session || !req.session.tokens) {
    throw new Error('Nessun token disponibile');
  }

  if (req.session.tokens && req.session.tokens.access_token) {
    const expiryDate = req.session.tokens.expiry_date;
    const now = new Date().getTime();
    
    if (!expiryDate || expiryDate - now < 300000) {
      try {
        console.log('Token in scadenza, tentativo di refresh');
        
        // Verifica che il refresh_token esista
        if (!req.session.tokens.refresh_token) {
          // Pulisci token non validi in modo sicuro
          req.session.tokens = null;
          await new Promise(resolve => req.session.save(resolve));
          throw new Error('Refresh token mancante, richiesta riautenticazione');
        }
        
        oauth2Client.setCredentials(req.session.tokens);
        const result = await oauth2Client.refreshToken(req.session.tokens.refresh_token);
        
        // Verifica più rigorosa dei dati di ritorno
        if (!result || !result.credentials || !result.credentials.access_token) {
          req.session.tokens = null;
          await new Promise(resolve => req.session.save(resolve));
          throw new Error('Token refresh non riuscito: dati incompleti');
        }
        
        req.session.tokens = result.credentials;
        
        // Salva immediatamente le modifiche alla sessione
        await new Promise((resolve, reject) => {
          req.session.save(err => {
            if (err) reject(err);
            else resolve();
          });
        });
        
        oauth2Client.setCredentials(req.session.tokens);
        console.log('Token refreshed successfully');
      } catch (error) {
        console.error('Errore nel refresh del token:', error.message);
        // Resetta i token in sessione in modo sicuro
        req.session.tokens = null;
        await new Promise(resolve => req.session.save(resolve));
        throw new Error('Sessione scaduta, effettua nuovamente il login');
      }
    } else {
      // Il token è ancora valido, imposta le credenziali
      oauth2Client.setCredentials(req.session.tokens);
    }
    return req.session.tokens;
  }
  throw new Error('Nessun token disponibile');
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
    
    // Salva i token nella sessione dell'utente
    req.session.tokens = tokens;
    console.log('Token OAuth ottenuti e salvati in sessione:', 
      tokens.access_token ? 'Token presente' : 'Token mancante');
    
    // Redirect al frontend
    res.redirect(`${process.env.CLIENT_URL}?auth=success`);
  } catch (error) {
    console.error('Errore di autenticazione:', error);
    res.redirect(`${process.env.CLIENT_URL}?auth=error&message=${encodeURIComponent(error.message)}`);
  }
});

// Endpoint per recuperare il token
app.get('/api/auth/token', (req, res) => {
  if (req.session.tokens && req.session.tokens.access_token) {
    res.json({ 
      accessToken: req.session.tokens.access_token,
      expiryDate: req.session.tokens.expiry_date 
    });
  } else {
    res.status(401).json({ error: 'Nessun token disponibile' });
  }
});

// Endpoint per elaborare comandi tramite Gemini
app.post('/api/process-command', async (req, res) => {
  const { command } = req.body;
  
  if (!command) {
    return res.status(400).json({ error: 'Comando mancante' });
  }
  
  try {
    // Utilizzo dei token dalla sessione utente
    const tokens = await ensureValidToken(req);
    oauth2Client.setCredentials(tokens);
    
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    // Test di validità dell'autenticazione
    try {
      const testCall = await calendar.calendarList.list({ maxResults: 1 });
      console.log('Test Calendar API riuscito');
    } catch (calError) {
      console.error('Test Calendar API fallito:', calError.response?.data || calError.message);
      throw new Error('Autenticazione Calendar fallita: ' + calError.message);
    }
    
    // Invia il comando a Gemini per l'interpretazione
    const geminiResponse = await processWithGemini(command, calendar);
    
    res.json({ result: geminiResponse });
  } catch (error) {
    console.error('Errore nell\'elaborazione del comando:', error);
    res.status(500).json({ 
      error: 'Errore nell\'elaborazione del comando',
      details: error.message 
    });
  }
});

// Funzione migliorata per elaborare comandi con Gemini
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

Per ogni comando, estrai i dettagli pertinenti come data, ora, titolo, descrizione, partecipanti, ecc.
Rispondi in formato JSON con i campi "action" e "parameters".

Il campo "action" deve essere uno tra:
- "Crea evento" (per creare un nuovo evento)
- "Modifica evento" (per modificare un evento esistente)
- "Visualizza eventi" (per visualizzare eventi esistenti)
- "Elimina evento" (per eliminare un evento)

Il campo "parameters" deve contenere i seguenti campi (solo quelli pertinenti):
- "titolo": il nome dell'evento
- "data": la data dell'evento (oggi, domani, un giorno specifico)
- "ora_inizio": l'ora di inizio dell'evento in formato HH:MM
- "ora_fine": l'ora di fine dell'evento in formato HH:MM
- "descrizione": descrizione dell'evento
- "partecipanti": elenco dei partecipanti

Esempio:
Comando: "Crea una riunione con Mario domani alle 15"
Risposta:
{
  "action": "Crea evento",
  "parameters": {
    "titolo": "Riunione con Mario",
    "data": "domani",
    "ora_inizio": "15:00",
    "ora_fine": "16:00",
    "partecipanti": ["mario@example.com"]
  }
}`;

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
    
    // Miglioramento validazione risposta
    if (!response.data.candidates || 
        !response.data.candidates[0] || 
        !response.data.candidates[0].content || 
        !response.data.candidates[0].content.parts ||
        !response.data.candidates[0].content.parts[0]) {
      throw new Error('Formato risposta Gemini non valido o vuoto');
    }
    
    const geminiResult = response.data.candidates[0].content.parts[0].text;
    
    // Verifica ulteriore che il testo non sia vuoto
    if (!geminiResult || typeof geminiResult !== 'string') {
      throw new Error('Risposta Gemini vuota o non valida');
    }
    
    try {
      // Miglioramento estrazione JSON
      let jsonText = geminiResult;
      
      // Rimuovi qualsiasi testo prima del primo '{'
      const jsonStartIndex = jsonText.indexOf('{');
      if (jsonStartIndex >= 0) {
        jsonText = jsonText.substring(jsonStartIndex);
      } else {
        throw new Error('Nessun oggetto JSON trovato nella risposta');
      }
      
      // Rimuovi qualsiasi testo dopo l'ultimo '}'
      const jsonEndIndex = jsonText.lastIndexOf('}');
      if (jsonEndIndex >= 0) {
        jsonText = jsonText.substring(0, jsonEndIndex + 1);
      } else {
        throw new Error('JSON non terminato correttamente');
      }
      
      // Rimuovi caratteri di escape o formattazione che potrebbero interferire
      jsonText = jsonText.replace(/\\n/g, ' ').replace(/\\"/g, '"');
      
      // Aggiungi un logging dettagliato del testo che stiamo per analizzare
      logDebug('Tentativo di parsing JSON:', jsonText);
      
      // Ora prova a fare il parsing
      const parsedResult = JSON.parse(jsonText);
      logDebug('Interpretazione comando:', parsedResult);
      
      // Verifica che l'oggetto parsato abbia la struttura attesa
      if (!parsedResult.action || !parsedResult.parameters) {
        throw new Error('Struttura JSON non valida: mancano campi obbligatori');
      }
      
      // Normalizza la risposta
      const normalizedResult = normalizeGeminiResponse(parsedResult);
      
      // Esegui l'azione appropriata sul calendario
      return await executeCalendarAction(normalizedResult, calendarClient);
    } catch (parseError) {
      logError('Errore nel parsing JSON della risposta:', geminiResult);
      logError('Dettaglio errore:', parseError);
      
      // Fallback migliorato - tenta di estrarre manualmente i dati chiave
      logDebug('Tentativo di estrazione manuale dei dati chiave');
      
      // Vedi se possiamo identificare l'azione
      let action = '';
      if (geminiResult.includes('crea') || geminiResult.includes('nuovo')) {
        action = 'CREATE_EVENT';
      } else if (geminiResult.includes('modifica') || geminiResult.includes('aggiorna')) {
        action = 'UPDATE_EVENT';
      } else if (geminiResult.includes('visualizza') || geminiResult.includes('mostra')) {
        action = 'VIEW_EVENTS';
      } else if (geminiResult.includes('elimina') || geminiResult.includes('cancella')) {
        action = 'DELETE_EVENT';
      } else {
        action = 'VIEW_EVENTS'; // Default fallback
      }
      
      // Fallback al parser locale
      logDebug('Utilizzo parser locale di fallback con azione:', action);
      const fallbackResult = basicCommandParser(command);
      fallbackResult.action = action; // Override con l'azione identificata
      
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
    
    // Fallback a un parser locale migliorato
    logDebug('Utilizzo parser locale di fallback');
    const fallbackResult = basicCommandParser(command);
    return await executeCalendarAction(fallbackResult, calendarClient);
  }
}

// Parser locale di base come fallback - MIGLIORATO
function basicCommandParser(command) {
  logDebug('Parsing locale del comando:', command);
  const lowerCommand = command.toLowerCase();
  let action = null;
  let parameters = {};
  
  // Estrazione del titolo - MIGLIORATA
  const titleMatch = command.match(/chiamat[oa]\s+([^,\.]+)/i) || 
                     command.match(/intitolat[oa]\s+([^,\.]+)/i) ||
                     command.match(/\b(evento|riunione|appuntamento)\s+([^,\.]+)/i) ||
                     // Pattern specifici per comandi di modifica/eliminazione
                     command.match(/(?:sposta|modifica|elimina|cancella)\s+(?:l[''])?(?:evento|appuntamento|riunione)?\s*(?:chiamato)?\s*["']?([^,\.\s"']+)["']?/i);
  
  const title = titleMatch ? (titleMatch[1] || titleMatch[2]).trim() : 'Nuovo evento';
  logDebug('Titolo estratto dal comando:', title);
  
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
  
  debugObject('Risultato parsing locale', { action, parameters });
  return { action, parameters };
}

// Funzione per normalizzare la risposta di Gemini
function normalizeGeminiResponse(parsedResult) {
  // Copia l'oggetto per non modificare l'originale
  const result = { ...parsedResult };
  
  // Normalizza l'azione
  const actionMapping = {
    'crea evento': 'CREATE_EVENT',
    'crea appuntamento': 'CREATE_EVENT',
    'nuovo evento': 'CREATE_EVENT',
    'aggiorna evento': 'UPDATE_EVENT',
    'modifica evento': 'UPDATE_EVENT',
    'sposta evento': 'UPDATE_EVENT',
    'cambia evento': 'UPDATE_EVENT',
    'visualizza eventi': 'VIEW_EVENTS',
    'mostra eventi': 'VIEW_EVENTS',
    'elenca eventi': 'VIEW_EVENTS',
    'elimina evento': 'DELETE_EVENT',
    'cancella evento': 'DELETE_EVENT',
    'rimuovi evento': 'DELETE_EVENT'
  };
  
  // Normalizza azione in minuscolo per il confronto
  const normalizedAction = result.action.toLowerCase();
  
  // Cerca corrispondenze esatte o parziali
  let standardAction = null;
  for (const [key, value] of Object.entries(actionMapping)) {
    if (normalizedAction === key || normalizedAction.includes(key)) {
      standardAction = value;
      break;
    }
  }
  
  // Se non abbiamo trovato una corrispondenza, tenta di semplificare ulteriormente
  if (!standardAction) {
    if (normalizedAction.includes('crea')) standardAction = 'CREATE_EVENT';
    else if (normalizedAction.includes('modifica') || normalizedAction.includes('sposta')) standardAction = 'UPDATE_EVENT';
    else if (normalizedAction.includes('mostra') || normalizedAction.includes('visualizza')) standardAction = 'VIEW_EVENTS';
    else if (normalizedAction.includes('elimina') || normalizedAction.includes('cancella')) standardAction = 'DELETE_EVENT';
    else standardAction = 'VIEW_EVENTS'; // default fallback
  }
  
  // Gestione comandi speciali (batch)
  if (normalizedAction === 'DELETE_EVENT' && 
      (result.parameters?.titolo?.toLowerCase().includes('tutti') || 
       result.parameters?.title?.toLowerCase().includes('tutti'))) {
    
    standardAction = 'DELETE_ALL_EVENTS';
    // Non serve titolo per questa operazione
    delete normalizedParams.title;
    
    // Se c'è data, la manteniamo
    if (result.parameters.data) {
      // Mantieni i parametri della data
    }
  }
  
  // Normalizza i parametri
  const normalizedParams = {};
  const params = result.parameters || {};
  
  // Mappatura dei nomi dei parametri
  if (params.titolo) normalizedParams.title = params.titolo;
  if (params.title) normalizedParams.title = params.title;
  
  if (params.descrizione) normalizedParams.description = params.descrizione;
  if (params.description) normalizedParams.description = params.description;
  
  // Gestione data e ora
  const today = new Date();
  let eventDate = today;
  
  // Interpreta la data se presente
  if (params.data) {
    if (params.data.toLowerCase() === 'oggi') {
      eventDate = today;
    } else if (params.data.toLowerCase() === 'domani') {
      eventDate = new Date(today);
      eventDate.setDate(eventDate.getDate() + 1);
    } else if (params.data.toLowerCase().includes('prossimo') || params.data.toLowerCase().includes('prossima')) {
      // Logica per "prossimo lunedì", ecc.
      const dayMapping = {
        'lunedì': 1, 'lunedi': 1, 
        'martedì': 2, 'martedi': 2,
        'mercoledì': 3, 'mercoledi': 3,
        'giovedì': 4, 'giovedi': 4,
        'venerdì': 5, 'venerdi': 5,
        'sabato': 6, 
        'domenica': 0
      };
      
      for (const [day, dayNum] of Object.entries(dayMapping)) {
        if (params.data.toLowerCase().includes(day)) {
          eventDate = new Date();
          const currentDay = eventDate.getDay();
          const daysToAdd = (dayNum + 7 - currentDay) % 7;
          eventDate.setDate(eventDate.getDate() + (daysToAdd === 0 ? 7 : daysToAdd));
          break;
        }
      }
    } else {
      // Tentativo di parsing diretto della data
      try {
        const parsedDate = new Date(params.data);
        if (!isNaN(parsedDate.getTime())) {
          eventDate = parsedDate;
        }
      } catch (e) {
        console.log('Errore parsing data:', e);
      }
    }
  }
  
  // Gestione ora inizio
  if (params.ora_inizio) {
    const [hours, minutes] = params.ora_inizio.split(':').map(Number);
    eventDate.setHours(hours || 0, minutes || 0, 0);
    normalizedParams.startDateTime = eventDate.toISOString();
    
    // Se c'è ora_fine, la imposta
    if (params.ora_fine) {
      const endDate = new Date(eventDate);
      const [endHours, endMinutes] = params.ora_fine.split(':').map(Number);
      endDate.setHours(endHours || 0, endMinutes || 0, 0);
      normalizedParams.endDateTime = endDate.toISOString();
    } else {
      // Altrimenti imposta la fine a un'ora dopo l'inizio
      const endDate = new Date(eventDate);
      endDate.setHours(endDate.getHours() + 1);
      normalizedParams.endDateTime = endDate.toISOString();
    }
  }
  
  // Passaggio diretto dei parametri per aggiornamenti
  normalizedParams.ora_inizio = params.ora_inizio;
  normalizedParams.ora_fine = params.ora_fine;
  normalizedParams.data = params.data;
  
  // Partecipanti
  if (params.partecipanti) {
    normalizedParams.attendees = Array.isArray(params.partecipanti) 
      ? params.partecipanti 
      : [params.partecipanti];
  }
  
  logDebug('Normalizzazione risposta Gemini:');
  logDebug('  Azione originale:', result.action, '→', standardAction);
  debugObject('  Parametri normalizzati', normalizedParams);
  
  return {
    action: standardAction,
    parameters: normalizedParams
  };
}

// Funzione per elaborare azioni sul calendario
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
    case 'DELETE_ALL_EVENTS':
      return await deleteAllEvents(calendar, parameters);
    default:
      return { 
        success: false,
        message: 'Azione non supportata', 
        details: action 
      };
  }
}

// Implementazione della nuova funzione per eliminare tutti gli eventi
async function deleteAllEvents(calendar, params) {
  try {
    // Imposta intervallo temporale (oggi, o parametro specificato)
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const timeMin = today.toISOString();
    const timeMax = tomorrow.toISOString();
    
    // Trova tutti gli eventi
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin,
      timeMax: timeMax,
      singleEvents: true
    });
    
    const events = response.data.items || [];
    
    if (events.length === 0) {
      return {
        success: true,
        message: 'Nessun evento trovato da eliminare'
      };
    }
    
    // Elimina tutti gli eventi trovati
    let deletedCount = 0;
    for (const event of events) {
      try {
        await calendar.events.delete({
          calendarId: 'primary',
          eventId: event.id
        });
        deletedCount++;
      } catch (error) {
        logError(`Errore nell'eliminazione evento ${event.id}:`, error.message);
      }
    }
    
    return {
      success: true,
      message: `Eliminati ${deletedCount} eventi`
    };
  } catch (error) {
    logError('Errore nell\'eliminazione multiple di eventi:', error);
    throw new Error(`Impossibile eliminare gli eventi: ${error.message}`);
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
    debugObject('Creazione evento', event);
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
    debugObject('Parametri evento originali', params);
    
    // Prima dobbiamo trovare l'evento da aggiornare
    let eventId = params.eventId;
    
    if (!eventId && params.title) {
      // Cerca per titolo se non abbiamo l'ID - PERIODO DI RICERCA ESTESO
      logDebug('Ricerca evento per titolo:', params.title);
      const searchResponse = await calendar.events.list({
        calendarId: 'primary',
        q: params.title,
        timeMin: new Date(new Date().setDate(new Date().getDate() - 7)).toISOString(), // Cerca anche eventi recenti
        maxResults: 10, // Aumentato per migliore ricerca
        singleEvents: true,
        orderBy: 'startTime',
      });
      
      if (searchResponse.data.items.length > 0) {
        // Prima cerca il titolo esatto (case-insensitive)
        let eventItem = searchResponse.data.items.find(item => 
          item.summary.toLowerCase() === params.title.toLowerCase()
        );
        
        // Se non trova, cerca corrispondenza parziale
        if (!eventItem) {
          // Estrai parole chiave dal titolo cercato
          const keywords = params.title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
          
          // Cerca eventi che contengono almeno una delle parole chiave
          for (const event of searchResponse.data.items) {
            const summary = event.summary.toLowerCase();
            if (keywords.some(keyword => summary.includes(keyword))) {
              eventItem = event;
              logDebug(`Evento trovato con corrispondenza parziale per parola chiave: ${event.summary}`);
              break;
            }
          }
        }
        
        if (eventItem) {
          eventId = eventItem.id;
        } else {
          throw new Error(`Evento "${params.title}" non trovato`);
        }
      } else {
        throw new Error(`Evento "${params.title}" non trovato`);
      }
    }
    
    // Ottieni l'evento esistente
    const eventResponse = await calendar.events.get({
      calendarId: 'primary',
      eventId: eventId,
    });
    
    const existingEvent = eventResponse.data;
    debugObject('Evento esistente', existingEvent);
    
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
    
    // Se abbiamo solo l'ora ma non la data esplicita, manteniamo la data originale
    if (params.ora_inizio && !params.data) {
      const originalDate = new Date(existingEvent.start.dateTime);
      const [hours, minutes] = params.ora_inizio.split(':').map(Number);
      originalDate.setHours(hours || 0, minutes || 0, 0);
      
      if (!updatedEvent.start) {
        updatedEvent.start = {
          dateTime: originalDate.toISOString(),
          timeZone: 'Europe/Rome',
        };
      } else {
        updatedEvent.start.dateTime = originalDate.toISOString();
      }
      
      // Imposta la fine a un'ora dopo se non specificata
      if (!params.ora_fine) {
        const endDate = new Date(originalDate);
        endDate.setHours(endDate.getHours() + 1);
        
        if (!updatedEvent.end) {
          updatedEvent.end = {
            dateTime: endDate.toISOString(),
            timeZone: 'Europe/Rome',
          };
        } else {
          updatedEvent.end.dateTime = endDate.toISOString();
        }
      }
    }
    
    // Aggiorna partecipanti se forniti
    if (params.attendees) {
      updatedEvent.attendees = params.attendees.map(email => ({ email }));
    }
    
    debugObject('Evento aggiornato', updatedEvent);
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
    debugObject('Parametri eliminazione evento', params);
    let eventId = params.eventId;
    
    if (!eventId && params.title) {
      // Cerca per titolo se non abbiamo l'ID - PERIODO DI RICERCA ESTESO
      logDebug('Ricerca evento da eliminare con titolo:', params.title);
      const searchResponse = await calendar.events.list({
        calendarId: 'primary',
        q: params.title,
        timeMin: new Date(new Date().setDate(new Date().getDate() - 7)).toISOString(), // Cerca anche eventi recenti
        maxResults: 10, // Aumentato per migliore ricerca
        singleEvents: true,
        orderBy: 'startTime',
      });
      
      if (searchResponse.data.items.length > 0) {
        // Prima cerca il titolo esatto (case-insensitive)
        let eventItem = searchResponse.data.items.find(item => 
          item.summary.toLowerCase() === params.title.toLowerCase()
        );
        
        // Se non trova, cerca corrispondenza parziale
        if (!eventItem) {
          // Estrai parole chiave dal titolo cercato
          const keywords = params.title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
          
          // Cerca eventi che contengono almeno una delle parole chiave
          for (const event of searchResponse.data.items) {
            const summary = event.summary.toLowerCase();
            if (keywords.some(keyword => summary.includes(keyword))) {
              eventItem = event;
              logDebug(`Evento trovato con corrispondenza parziale per parola chiave: ${event.summary}`);
              break;
            }
          }
        }
        
        if (eventItem) {
          eventId = eventItem.id;
        } else {
          throw new Error(`Evento "${params.title}" non trovato`);
        }
      } else {
        throw new Error(`Evento "${params.title}" non trovato`);
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