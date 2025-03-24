/**
 * Servizio per le operazioni sul calendario Google
 */

const { google } = require('googleapis');
const { createLogger } = require('../utils/logger');
const dateUtils = require('../utils/dateUtils');

const logger = createLogger('calendar-service');

/**
 * Aggiunto: variabile per memorizzare l'ultimo evento gestito
 * Aggiungi questo all'inizio del file, dopo le importazioni
 */
let lastHandledEventContext = {
  id: null,
  title: null,
  timestamp: null
};

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
 * Aggiunto: Aggiorna il contesto dell'ultimo evento gestito
 * Aggiungi questa funzione nuova al file
 */
const updateEventContext = (eventId, eventTitle) => {
  if (eventId && eventTitle) {
    lastHandledEventContext = {
      id: eventId,
      title: eventTitle,
      timestamp: Date.now()
    };
    logger.debug('Contesto evento aggiornato:', lastHandledEventContext);
  }
};

/**
 * Aggiunto: Ottiene l'ID dell'ultimo evento dal contesto se è ancora valido
 * Aggiungi questa funzione nuova al file
 */
const getLastEventIdFromContext = () => {
  const contextTimeValid = 5 * 60 * 1000; // 5 minuti
  
  if (lastHandledEventContext.id && 
      lastHandledEventContext.timestamp && 
      (Date.now() - lastHandledEventContext.timestamp) < contextTimeValid) {
    logger.debug('Utilizzando contesto evento:', lastHandledEventContext);
    return lastHandledEventContext.id;
  }
  
  return null;
};

/**
 * Aggiunto: Trova l'evento più recente per tipo
 * Aggiungi questa funzione nuova al file
 */
const findMostRecentEventByType = async (calendar, eventType) => {
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const threeDaysAhead = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  
  logger.debug(`Ricerca eventi recenti di tipo "${eventType}"`);
  
  const searchResponse = await calendar.events.list({
    calendarId: 'primary',
    timeMin: threeDaysAgo.toISOString(),
    timeMax: threeDaysAhead.toISOString(),
    maxResults: 10,
    singleEvents: true,
    orderBy: 'startTime',
  });
  
  if (!searchResponse.data.items || searchResponse.data.items.length === 0) {
    throw new Error(`Nessun evento trovato nel periodo corrente`);
  }
  
  // Filtra per tipo e ordina per prossimità alla data corrente
  const filteredEvents = searchResponse.data.items.filter(event => 
    event.summary.toLowerCase().includes(eventType.toLowerCase())
  );
  
  if (filteredEvents.length === 0) {
    throw new Error(`Nessun evento di tipo "${eventType}" trovato`);
  }
  
  // Ordina per prossimità alla data corrente
  filteredEvents.sort((a, b) => {
    const dateA = new Date(a.start.dateTime || a.start.date);
    const dateB = new Date(b.start.dateTime || b.start.date);
    return Math.abs(dateA - now) - Math.abs(dateB - now);
  });
  
  logger.debug(`Trovato evento più recente di tipo "${eventType}": ${filteredEvents[0].summary}`);
  return filteredEvents[0].id;
};

/**
 * SOSTITUISCI COMPLETAMENTE questa funzione findEventByTitle esistente
 * con questa versione migliorata
 */
const findEventByTitle = async (calendar, title) => {
  logger.debug('Ricerca evento per titolo:', title);
  
  // Cerca eventi recenti in un intervallo più ampio
  const now = new Date();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const oneMonthAhead = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  
  // Aumenta il numero di risultati per una ricerca più ampia
  const searchResponse = await calendar.events.list({
    calendarId: 'primary',
    timeMin: twoWeeksAgo.toISOString(),
    timeMax: oneMonthAhead.toISOString(),
    maxResults: 50,  // Aumentato da 20 a 50
    singleEvents: true,
    orderBy: 'startTime',
  });
  
  logger.debug(`Trovati ${searchResponse.data.items?.length || 0} eventi da esaminare`);
  
  if (!searchResponse.data.items || searchResponse.data.items.length === 0) {
    throw new Error(`Nessun evento trovato per il periodo ricercato`);
  }
  
  // Normalizza il titolo di ricerca e crea varianti più ampie
  const searchTitle = title.toLowerCase();
  const searchWords = searchTitle.split(/\s+/);
  const searchVariants = [
    searchTitle,                                   // Titolo completo
    searchTitle.replace(/con\s+/, ''),            // Rimuovi "con"
    searchWords.length > 1 ? searchWords[0] : '', // Prima parola
    searchWords.length > 1 ? searchWords[searchWords.length-1] : '' // Ultima parola
  ].filter(v => v.length > 0);
  
  // Aggiungi nomi di persone come varianti di ricerca
  const personMatch = searchTitle.match(/\b([A-Za-z]+)\b/g);
  if (personMatch) {
    personMatch.forEach(name => {
      if (name.length > 2 && !['con', 'alle', 'del', 'di'].includes(name)) {
        searchVariants.push(name);
      }
    });
  }
  
  logger.debug('Varianti di ricerca:', searchVariants);

  // Prima tenta con corrispondenza esatta
  let bestMatch = null;
  let bestMatchScore = 0;
  
  // Implementa un sistema di punteggio per trovare la migliore corrispondenza
  for (const event of searchResponse.data.items) {
    const eventTitle = event.summary.toLowerCase();
    let score = 0;
    
    // Corrispondenza esatta
    if (eventTitle === searchTitle) {
      score = 100;
    } else {
      // Corrispondenza parziale con varianti
      for (const variant of searchVariants) {
        if (eventTitle.includes(variant)) {
          score += 20 + (variant.length / searchTitle.length) * 30;
        }
      }
      
      // Bonus per eventi più recenti
      const eventDate = new Date(event.start.dateTime || event.start.date);
      const daysAway = Math.abs(Math.floor((now - eventDate) / (24 * 60 * 60 * 1000)));
      if (daysAway < 3) {
        score += (3 - daysAway) * 10;
      }
    }
    
    logger.debug(`Punteggio per "${event.summary}": ${score}`);
    
    if (score > bestMatchScore) {
      bestMatchScore = score;
      bestMatch = event;
    }
  }
  
  // Utilizza una soglia minima per considerare una corrispondenza valida
  if (bestMatch && bestMatchScore > 20) {
    logger.debug(`Migliore corrispondenza: "${bestMatch.summary}" con punteggio ${bestMatchScore}`);
    return bestMatch.id;
  }
  
  // Fallback: se cerchiamo "la riunione" e c'è solo una riunione oggi/domani, usala
  if (searchTitle.includes('riunione') && !searchTitle.includes('con')) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
    
    const recentMeetings = searchResponse.data.items.filter(event => {
      const eventDate = new Date(event.start.dateTime || event.start.date);
      return eventDate >= today && eventDate < dayAfterTomorrow && 
             event.summary.toLowerCase().includes('riunione');
    });
    
    if (recentMeetings.length === 1) {
      logger.debug(`Utilizzando l'unica riunione trovata: ${recentMeetings[0].summary}`);
      return recentMeetings[0].id;
    }
  }
  
  throw new Error(`Evento "${title}" non trovato. Prova a specificare un titolo più preciso.`);
};

/**
 * SOSTITUISCI COMPLETAMENTE la funzione updateEvent esistente
 * con questa versione migliorata
 */
const updateEvent = async (auth, params) => {
  logger.debug('Aggiornamento evento con parametri:', params);
  
  try {
    const calendar = google.calendar({ version: 'v3', auth });
    
    // Prima dobbiamo trovare l'evento da aggiornare
    let eventId = params.eventId;
    
    // Se non abbiamo un ID, proviamo a utilizzare il contesto
    if (!eventId) {
      eventId = getLastEventIdFromContext();
      logger.debug('ID evento dal contesto:', eventId);
    }
    
    // Se ancora non abbiamo un ID e abbiamo un titolo, cerchiamo per titolo
    if (!eventId && params.title) {
      logger.debug('Tentativo di trovare evento per titolo:', params.title);
      try {
        eventId = await findEventByTitle(calendar, params.title);
        logger.debug('Evento trovato per titolo con ID:', eventId);
      } catch (searchError) {
        logger.warn('Errore nella ricerca per titolo:', searchError.message);
        // Fallback: cerchiamo qualsiasi evento recente che corrisponda al tipo
        if (params.title.includes('riunione') || params.title.toLowerCase().includes('meeting')) {
          logger.debug('Tentativo di trovare una riunione recente');
          try {
            eventId = await findMostRecentEventByType(calendar, 'riunione');
            logger.debug('Trovata riunione recente con ID:', eventId);
          } catch (fallbackError) {
            logger.error('Errore nel trovare evento recente:', fallbackError.message);
            throw new Error(`Impossibile trovare l'evento da modificare: ${searchError.message}`);
          }
        } else {
          throw searchError;
        }
      }
    }
    
    if (!eventId) {
      throw new Error('ID evento non specificato e impossibile trovare evento dal titolo');
    }
    
    // Ottieni l'evento esistente
    const eventResponse = await calendar.events.get({
      calendarId: 'primary',
      eventId: eventId,
    });
    
    const existingEvent = eventResponse.data;
    logger.debug('Evento esistente trovato:', existingEvent.id);
    
    // Calcoliamo la durata dell'evento originale (in millisecondi)
    const originalStartDate = new Date(existingEvent.start.dateTime || existingEvent.start.date);
    const originalEndDate = new Date(existingEvent.end.dateTime || existingEvent.end.date);
    const originalDuration = originalEndDate.getTime() - originalStartDate.getTime();
    
    logger.debug(`Durata originale dell'evento: ${originalDuration / 60000} minuti`);
    
    // Prepara l'evento aggiornato
    const updatedEvent = {
      ...existingEvent,
      summary: params.title || existingEvent.summary,
      description: params.description !== undefined ? params.description : existingEvent.description,
    };
    
    // Gestione modifiche temporali
    if (params.timeModification) {
      handleTimeModification(params.timeModification, originalStartDate, originalEndDate, updatedEvent, originalDuration);
    }
    // Gestione spostamento relativo (ore in avanti/indietro)
    else if (params.hoursToShift) {
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
    else if (params.startTime) {
      // Crea una nuova data di inizio con l'orario specificato
      const startTimeParts = params.startTime.split(':').map(Number);
      const newStartDateTime = new Date(originalStartDate);
      newStartDateTime.setHours(startTimeParts[0], startTimeParts[1], 0, 0);
      
      // Calcola la nuova data di fine mantenendo la durata originale
      const newEndDateTime = new Date(newStartDateTime.getTime() + originalDuration);
      
      logger.debug(`Nuovo orario: ${newStartDateTime.toLocaleTimeString()}, fine: ${newEndDateTime.toLocaleTimeString()}`);
      
      updatedEvent.start = {
        dateTime: newStartDateTime.toISOString(),
        timeZone: 'Europe/Rome',
      };
      
      updatedEvent.end = {
        dateTime: newEndDateTime.toISOString(),
        timeZone: 'Europe/Rome',
      };
      
      // Se è fornito anche un orario di fine specifico, usalo invece
      if (params.endTime) {
        const endTimeParts = params.endTime.split(':').map(Number);
        newEndDateTime.setHours(endTimeParts[0], endTimeParts[1], 0, 0);
        
        // Verifica che la nuova fine sia dopo l'inizio
        if (newEndDateTime <= newStartDateTime) {
          // Se la fine è prima dell'inizio, aggiungi un giorno
          newEndDateTime.setDate(newEndDateTime.getDate() + 1);
        }
        
        updatedEvent.end = {
          dateTime: newEndDateTime.toISOString(),
          timeZone: 'Europe/Rome',
        };
      }
    }
    // Aggiornamento data specifica
    else if (params.date) {
      // Calcola la differenza in giorni tra la data originale e quella richiesta
      const targetDate = dateUtils.parseDateFromText(params.date);
      
      // Mantieni gli stessi orari originali ma aggiorna la data
      const newStartDateTime = new Date(targetDate);
      newStartDateTime.setHours(
        originalStartDate.getHours(),
        originalStartDate.getMinutes(),
        originalStartDate.getSeconds()
      );
      
      // Calcola la differenza in giorni
      const daysDiff = Math.floor((newStartDateTime - originalStartDate) / (24 * 60 * 60 * 1000));
      
      // Aggiorna anche la data di fine con lo stesso numero di giorni
      const newEndDateTime = new Date(originalEndDate);
      newEndDateTime.setDate(newEndDateTime.getDate() + daysDiff);
      
      logger.debug(`Spostamento di ${daysDiff} giorni. Nuova data: ${newStartDateTime.toLocaleDateString()}`);
      
      updatedEvent.start = {
        dateTime: newStartDateTime.toISOString(),
        timeZone: 'Europe/Rome',
      };
      
      updatedEvent.end = {
        dateTime: newEndDateTime.toISOString(),
        timeZone: 'Europe/Rome',
      };
    }
    
    // Gestione partecipanti con supporto per aggiunta vs. sostituzione
    if (params.attendees && params.attendees.length > 0) {
      if (params.attendeesAction === 'ADD') {
        // Combina partecipanti esistenti e nuovi
        const existingEmails = existingEvent.attendees ? existingEvent.attendees.map(a => a.email) : [];
        const newAttendees = params.attendees.filter(email => !existingEmails.includes(email));
        
        updatedEvent.attendees = [
          ...(existingEvent.attendees || []),
          ...prepareAttendees(newAttendees)
        ];
        
        logger.debug('Aggiunti nuovi partecipanti:', newAttendees);
      } else {
        // Sostituisci partecipanti (comportamento predefinito)
        updatedEvent.attendees = prepareAttendees(params.attendees);
        logger.debug('Sostituiti partecipanti con:', params.attendees);
      }
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
    
    // Aggiorna il contesto dopo un'operazione riuscita
    updateEventContext(response.data.id, updatedEvent.summary);
    
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
 * Aggiunto: Gestisce modifiche temporali relative (anticipo/posticipo)
 * Aggiungi questa funzione nuova al file
 */
const handleTimeModification = (timeModification, originalStartDate, originalEndDate, updatedEvent, originalDuration) => {
  logger.debug('Applicazione modifica temporale:', timeModification);
  
  // Calcola lo spostamento in millisecondi
  let shiftMs = 0;
  
  if (timeModification.unit === 'HOUR') {
    shiftMs = timeModification.amount * 60 * 60 * 1000;
  } else if (timeModification.unit === 'MINUTE') {
    shiftMs = timeModification.amount * 60 * 1000;
  }
  
  // Se la direzione è all'indietro, inverti il segno
  if (timeModification.direction === 'BACKWARD') {
    shiftMs = -shiftMs;
    logger.debug('Applicando spostamento negativo:', -shiftMs/60000, 'minuti');
  } else {
    logger.debug('Applicando spostamento positivo:', shiftMs/60000, 'minuti');
  }
  
  // Calcola i nuovi orari
  const newStartDateTime = new Date(originalStartDate.getTime() + shiftMs);
  const newEndDateTime = new Date(originalEndDate.getTime() + shiftMs);
  
  logger.debug(`Spostamento di ${shiftMs/60000} minuti. Nuovo orario inizio: ${newStartDateTime.toLocaleTimeString()}`);
  
  updatedEvent.start = {
    dateTime: newStartDateTime.toISOString(),
    timeZone: 'Europe/Rome',
  };
  
  updatedEvent.end = {
    dateTime: newEndDateTime.toISOString(),
    timeZone: 'Europe/Rome',
  };
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
  deleteEvent,
  handleTimeModification, // Aggiungi questa
  findMostRecentEventByType, // Aggiungi questa
  updateEventContext, // Aggiungi questa
  getLastEventIdFromContext // Aggiungi questa
};