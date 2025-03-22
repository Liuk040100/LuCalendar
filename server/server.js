require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Google OAuth setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.REDIRECT_URI
);

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
    oauth2Client.setCredentials(tokens);
    
    // In un'app reale, dovresti salvare i token in un database
    // e associarli all'utente corrente
    
    // Redirect al frontend
    res.redirect(`${process.env.CLIENT_URL}?auth=success`);
  } catch (error) {
    console.error('Errore di autenticazione:', error);
    res.redirect(`${process.env.CLIENT_URL}?auth=error`);
  }
});

// Endpoint per elaborare comandi tramite Gemini
app.post('/api/process-command', async (req, res) => {
  const { command, accessToken } = req.body;
  
  if (!command) {
    return res.status(400).json({ error: 'Comando mancante' });
  }
  
  try {
    // Configurazione client Calendar con token
    oauth2Client.setCredentials({ access_token: accessToken });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

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

// Funzione per elaborare comandi con Gemini
async function processWithGemini(command, calendarClient) {
  try {
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

    // Chiamata a Gemini API
    const response = await axios.post(
      'https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent',
      {
        contents: [
          { role: 'system', parts: [{ text: systemPrompt }] },
          { role: 'user', parts: [{ text: command }] }
        ],
        generationConfig: {
          temperature: 0.2
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY
        }
      }
    );

    const geminiResult = response.data.candidates[0].content.parts[0].text;
    const parsedResult = JSON.parse(geminiResult);
    
    // Esegui l'azione appropriata sul calendario in base all'interpretazione di Gemini
    return await executeCalendarAction(parsedResult, calendarClient);
  } catch (error) {
    console.error('Errore nella comunicazione con Gemini:', error);
    throw new Error('Impossibile interpretare il comando');
  }
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
      return { message: 'Azione non supportata', details: action };
  }
}

// Funzioni per operazioni sul calendario
async function createEvent(calendar, params) {
  const event = {
    summary: params.title,
    description: params.description || '',
    start: {
      dateTime: params.startDateTime,
      timeZone: 'Europe/Rome',
    },
    end: {
      dateTime: params.endDateTime,
      timeZone: 'Europe/Rome',
    },
    attendees: params.attendees ? params.attendees.map(email => ({ email })) : [],
  };

  try {
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
    console.error('Errore nella creazione dell\'evento:', error);
    throw new Error('Impossibile creare l\'evento');
  }
}

async function updateEvent(calendar, params) {
  try {
    // Prima dobbiamo trovare l'evento da aggiornare
    let eventId = params.eventId;
    
    if (!eventId && params.title) {
      // Cerca per titolo se non abbiamo l'ID
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
    console.error('Errore nell\'aggiornamento dell\'evento:', error);
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
        title: event.summary,
        description: event.description || '',
        start: event.start.dateTime || event.start.date,
        end: event.end.dateTime || event.end.date,
        link: event.htmlLink,
        attendees: event.attendees ? event.attendees.map(a => a.email) : []
      };
    });
    
    return {
      success: true,
      message: `Trovati ${events.length} eventi`,
      events: formattedEvents
    };
  } catch (error) {
    console.error('Errore nel recupero degli eventi:', error);
    throw new Error('Impossibile recuperare gli eventi');
  }
}

async function deleteEvent(calendar, params) {
  try {
    let eventId = params.eventId;
    
    if (!eventId && params.title) {
      // Cerca per titolo se non abbiamo l'ID
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
      } else {
        throw new Error('Evento non trovato');
      }
    }
    
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId,
    });
    
    return {
      success: true,
      message: 'Evento eliminato con successo'
    };
  } catch (error) {
    console.error('Errore nell\'eliminazione dell\'evento:', error);
    throw new Error(`Impossibile eliminare l'evento: ${error.message}`);
  }
}

// Avvio server
app.listen(PORT, () => {
  console.log(`Server in esecuzione sulla porta ${PORT}`);
});