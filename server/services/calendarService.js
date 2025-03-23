/**
 * Servizio per le operazioni sul calendario Google
 */

const { google } = require('googleapis');
const { createLogger } = require('../utils/logger');
const dateUtils = require('../utils/dateUtils');

const logger = createLogger('calendar-service');

/**
 * Crea un evento nel calendario
 * @param {Object} auth - Client OAuth2 autenticato
 * @param {Object} params - Parametri dell'evento
 * @returns {Object} Risultato dell'operazione
 */
const createEvent = async (auth, params) => {
  logger.debug('Creazione evento con parametri:', params);
  
  try {
    const calendar = google.calendar({ version: 'v3', auth });
    
    // Prepara date e orari
    const startDateTime = prepareDateTime(params.date, params.startTime);
    const endDateTime = params.endTime 
      ? prepareDateTime(params.date, params.endTime)
      : new Date(startDateTime.getTime() + 60 * 60 * 1000); // +1 ora di default
      
    // Verifica se esiste già un evento con titolo simile nella stessa data/ora
    const existingEvents = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startDateTime.toISOString(),
      timeMax: new Date(startDateTime.getTime() + 5 * 60 * 1000).toISOString(), // Finestra di 5 minuti
      q: params.title
    });

    if (existingEvents.data.items && existingEvents.data.items.length > 0) {
      return {
        success: false,
        message: 'Sembra che esista già un evento simile in questo orario',
        potentialDuplicate: true,
        existingEventId: existingEvents.data.items[0].id
      };
    }
    
    // Prepara risorsa evento
    const event = {
      summary: params.title || 'Nuovo evento',
      description: params.description || '',
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: 'Europe/Rome',
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: 'Europe/Rome',
      },
      attendees: prepareAttendees(params.attendees)
    };

    logger.debug('Richiesta creazione evento:', event);
    
    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });
    
    logger.info('Evento creato con successo:', response.data.id);
    
    return {
      success: true,
      message: 'Evento creato con successo',
      eventId: response.data.id,
      eventLink: response.data.htmlLink
    };
  } catch (error) {
    logger.error('Errore nella creazione dell\'evento:', error);
    throw new Error(`Impossibile creare l'evento: ${error.message}`);
  }
};

/**
 * Aggiorna un evento esistente
 * @param {Object} auth - Client OAuth2 autenticato
 * @param {Object} params - Parametri dell'evento
 * @returns {Object} Risultato dell'operazione
 */
const updateEvent = async (auth, params) => {
  logger.debug('Aggiornamento evento con parametri:', params);
  
  try {
    const calendar = google.calendar({ version: 'v3', auth });
    
    // Prima dobbiamo trovare l'evento da aggiornare
    let eventId = params.eventId;
    
    if (!eventId && params.title) {
      eventId = await findEventByTitle(calendar, params.title);
    }
    
    // Ottieni l'evento esistente
    const eventResponse = await calendar.events.get({
      calendarId: 'primary',
      eventId: eventId,
    });
    
    const existingEvent = eventResponse.data;
    logger.debug('Evento esistente trovato:', existingEvent.id);
    
    // Prepara l'evento aggiornato
    const updatedEvent = {
      ...existingEvent,
      summary: params.title || existingEvent.summary,
      description: params.description !== undefined ? params.description : existingEvent.description,
    };
    
    // Gestione spostamento relativo (ore in avanti/indietro)
    if (params.hoursToShift) {
      const originalStartDate = new Date(existingEvent.start.dateTime || existingEvent.start.date);
      const originalEndDate = new Date(existingEvent.end.dateTime || existingEvent.end.date);
      
      // Calcola nuovi orari sommando/sottraendo ore
      const hoursToAdd = params.hoursToShift;
      const newStartDateTime = new Date(originalStartDate.getTime() + hoursToAdd * 60 * 60 * 1000);
      const newEndDateTime = new Date(originalEndDate.getTime() + hoursToAdd * 60 * 60 * 1000);
      
      updatedEvent.start = {
        dateTime: newStartDateTime.toISOString(),
        timeZone: 'Europe/Rome',
      };
      
      updatedEvent.end = {
        dateTime: newEndDateTime.toISOString(),
        timeZone: 'Europe/Rome',
      };
      
      logger.debug(`Spostamento relativo: ${hoursToAdd} ore. Nuovo orario: ${newStartDateTime.toLocaleTimeString()}`);
    }
    // Aggiornamento orario specifico
    else if (params.date || params.startTime) {
      const originalStartDate = new Date(existingEvent.start.dateTime || existingEvent.start.date);
      const startDateTime = prepareDateTime(
        params.date || originalStartDate,
        params.startTime || dateUtils.formatTime(originalStartDate)
      );
      
      updatedEvent.start = {
        dateTime: startDateTime.toISOString(),
        timeZone: 'Europe/Rome',
      };
      
      // Se abbiamo solo modificato l'ora di inizio ma non di fine, 
      // aggiorna l'ora di fine mantenendo la stessa durata
      if (params.startTime && !params.endTime) {
        const originalDuration = new Date(existingEvent.end.dateTime || existingEvent.end.date) - 
                                new Date(existingEvent.start.dateTime || existingEvent.start.date);
        
        const endDateTime = new Date(startDateTime.getTime() + originalDuration);
        
        updatedEvent.end = {
          dateTime: endDateTime.toISOString(),
          timeZone: 'Europe/Rome',
        };
      }
      
      // Aggiorna ora di fine se fornita
      if (params.endTime) {
        const startDate = new Date(updatedEvent.start.dateTime);
        const endDateTime = prepareDateTime(
          params.date || startDate,
          params.endTime
        );
        
        updatedEvent.end = {
          dateTime: endDateTime.toISOString(),
          timeZone: 'Europe/Rome',
        };
      }
    }
    
    // Aggiorna partecipanti se forniti
    if (params.attendees && params.attendees.length > 0) {
      updatedEvent.attendees = prepareAttendees(params.attendees);
    } else if (params.attendees && params.attendees.length === 0 && existingEvent.attendees) {
      // Mantieni i partecipanti esistenti se l'array è vuoto
      updatedEvent.attendees = existingEvent.attendees;
    }
    
    logger.debug('Richiesta aggiornamento evento:', updatedEvent);
    
    const response = await calendar.events.update({
      calendarId: 'primary',
      eventId: eventId,
      resource: updatedEvent,
    });
    
    logger.info('Evento aggiornato con successo:', response.data.id);
    
    return {
      success: true,
      message: 'Evento aggiornato con successo',
      eventId: response.data.id,
      eventLink: response.data.htmlLink
    };
  } catch (error) {
    logger.error('Errore nell\'aggiornamento dell\'evento:', error);
    throw new Error(`Impossibile aggiornare l'evento: ${error.message}`);
  }
};

/**
 * Elenca eventi nel calendario
 * @param {Object} auth - Client OAuth2 autenticato
 * @param {Object} params - Parametri di ricerca
 * @returns {Object} Risultato dell'operazione ed eventi trovati
 */
const listEvents = async (auth, params) => {
  logger.debug('Ricerca eventi con parametri:', params);
  
  try {
    const calendar = google.calendar({ version: 'v3', auth });
    
    // Imposta intervallo di date
    const now = new Date();
    
    // Date di inizio e fine predefinite (oggi -> +7 giorni)
    let timeMin = now.toISOString();
    let timeMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    
    // Override con le date specificate nei parametri
    if (params.date) {
      const specificDate = dateUtils.parseDateFromText(params.date);
      
      // Se è una data specifica, mostra solo gli eventi di quel giorno
      timeMin = new Date(specificDate.setHours(0, 0, 0, 0)).toISOString();
      timeMax = new Date(specificDate.setHours(23, 59, 59, 999)).toISOString();
    }
    
    logger.debug('Ricerca eventi dal', timeMin, 'al', timeMax);
    
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
    
    if (!events || events.length === 0) {
      return {
        success: true,
        message: 'Nessun evento trovato nel periodo specificato',
        events: []
      };
    }
    
    const formattedEvents = events.map(formatEventForResponse);
    
    logger.info('Eventi trovati:', formattedEvents.length);
    return {
      success: true,
      message: `Trovati ${events.length} eventi`,
      events: formattedEvents
    };
  } catch (error) {
    logger.error('Errore nel recupero degli eventi:', error);
    throw new Error(`Impossibile recuperare gli eventi: ${error.message}`);
  }
};

/**
 * Elimina un evento dal calendario
 * @param {Object} auth - Client OAuth2 autenticato
 * @param {Object} params - Parametri dell'evento da eliminare
 * @returns {Object} Risultato dell'operazione
 */
const deleteEvent = async (auth, params) => {
  logger.debug('Eliminazione evento con parametri:', params);
  
  try {
    const calendar = google.calendar({ version: 'v3', auth });
    
    // Se abbiamo una data ma non un ID o titolo specifico, o se è una richiesta di eliminazione completa
    if ((params.date && !params.eventId && !params.title) || params.deleteAll) {
      logger.debug('Eliminazione di tutti gli eventi per la data:', params.date);
      
      // Ottieni inizio e fine della data specificata
      const dateObj = dateUtils.parseDateFromText(params.date);
      const timeMin = new Date(dateObj.setHours(0, 0, 0, 0)).toISOString();
      const timeMax = new Date(dateObj.setHours(23, 59, 59, 999)).toISOString();
      
      // Cerca gli eventi per quella data
      const eventsResponse = await calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin,
        timeMax: timeMax,
        singleEvents: true
      });
      
      const events = eventsResponse.data.items;
      
      if (!events || events.length === 0) {
        return {
          success: true,
          message: 'Nessun evento trovato per la data specificata'
        };
      }
      
      // Elimina ogni evento trovato
      for (const event of events) {
        await calendar.events.delete({
          calendarId: 'primary',
          eventId: event.id,
        });
      }
      
      return {
        success: true,
        message: `Eliminati ${events.length} eventi per la data specificata`
      };
    }
    
    // Caso standard: eliminazione di un evento specifico
    let eventId = params.eventId;
    
    if (!eventId && params.title) {
      eventId = await findEventByTitle(calendar, params.title);
    }
    
    if (!eventId) {
      throw new Error('ID evento non specificato e impossibile trovare evento dal titolo');
    }
    
    logger.debug('Eliminazione evento con ID:', eventId);
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId,
    });
    
    logger.info('Evento eliminato con successo');
    return {
      success: true,
      message: 'Evento eliminato con successo'
    };
  } catch (error) {
    logger.error('Errore nell\'eliminazione dell\'evento:', error);
    throw new Error(`Impossibile eliminare l'evento: ${error.message}`);
  }
};

/**
 * Cerca un evento per titolo
 * @param {Object} calendar - Client Google Calendar
 * @param {String} title - Titolo da cercare
 * @returns {String} ID dell'evento trovato
 */
const findEventByTitle = async (calendar, title) => {
  logger.debug('Ricerca evento per titolo:', title);
  
  // Cerca eventi recenti
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneMonthAhead = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  
  const searchResponse = await calendar.events.list({
    calendarId: 'primary',
    timeMin: oneWeekAgo.toISOString(),
    timeMax: oneMonthAhead.toISOString(),
    maxResults: 20,
    singleEvents: true,
    orderBy: 'startTime',
  });
  
  if (!searchResponse.data.items || searchResponse.data.items.length === 0) {
    throw new Error(`Nessun evento trovato per il periodo ricercato`);
  }
  
  // Normalizza il titolo di ricerca e crea varianti
  const searchTitle = title.toLowerCase();
  const searchVariants = [
    searchTitle,
    searchTitle.replace('con', 'di'),
    searchTitle.replace('di', 'con'),
    searchTitle.split(' ').pop() // Solo l'ultima parola (es. nome persona)
  ];
  
  // Prima cerca corrispondenza esatta, poi parziale con varianti
  for (const event of searchResponse.data.items) {
    const eventTitle = event.summary.toLowerCase();
    
    // Corrispondenza esatta
    if (eventTitle === searchTitle) {
      return event.id;
    }
    
    // Prova con le varianti
    if (searchVariants.some(variant => eventTitle.includes(variant))) {
      logger.debug(`Evento trovato con corrispondenza parziale: ${event.summary}`);
      return event.id;
    }
    
    // Cerca evento con nome della persona
    const attendeeMatch = searchTitle.match(/(?:con|di)\s+([A-Za-z]+)/i);
    if (attendeeMatch && eventTitle.includes(attendeeMatch[1].toLowerCase())) {
      logger.debug(`Evento trovato con corrispondenza partecipante: ${event.summary}`);
      return event.id;
    }
  }
  
  throw new Error(`Evento "${title}" non trovato`);
};

/**
 * Prepara una data/ora combinando una data e un orario
 * @param {String|Date} date - Data in formato stringa o oggetto Date
 * @param {String} time - Orario in formato HH:MM
 * @returns {Date} Data combinata
 */
const prepareDateTime = (date, time) => {
  // Per la data, accettiamo sia un oggetto Date che una stringa
  let baseDate;
  
  if (date instanceof Date) {
    baseDate = new Date(date);
  } else if (typeof date === 'string') {
    baseDate = dateUtils.parseDateFromText(date);
  } else {
    baseDate = new Date();
  }
  
  // Per l'orario, se abbiamo un formato HH:MM
  if (time && typeof time === 'string') {
    const [hours, minutes] = time.split(':').map(Number);
    if (!isNaN(hours) && !isNaN(minutes)) {
      baseDate.setHours(hours, minutes, 0, 0);
    }
  }
  
  return baseDate;
};

/**
 * Prepara la lista di partecipanti per l'API Calendar
 * @param {Array|String} attendees - Lista di partecipanti
 * @returns {Array} Lista formattata per l'API
 */
const prepareAttendees = (attendees) => {
  if (!attendees) return [];
  
  // Converti in array se è una stringa
  const attendeesList = Array.isArray(attendees) ? attendees : [attendees];
  
  // Formatta ogni partecipante come richiesto dall'API
  return attendeesList.map(email => {
    // Aggiungi dominio predefinito se manca
    if (email && !email.includes('@')) {
      email = `${email}@example.com`;
    }
    
    return { email };
  });
};

/**
 * Formatta un evento per la risposta all'utente
 * @param {Object} event - Evento da formattare
 * @returns {Object} Evento formattato
 */
const formatEventForResponse = (event) => {
  return {
    id: event.id,
    title: event.summary || 'Evento senza titolo',
    description: event.description || '',
    start: event.start.dateTime || event.start.date,
    end: event.end.dateTime || event.end.date,
    link: event.htmlLink,
    attendees: event.attendees ? event.attendees.map(a => a.email) : []
  };
};

module.exports = {
  createEvent,
  updateEvent,
  listEvents,
  deleteEvent
};