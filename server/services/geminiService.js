/**
 * Servizio per l'integrazione con l'API Gemini
 */

const axios = require('axios');
const { createLogger } = require('../utils/logger');

const logger = createLogger('gemini-service');

/**
 * Sistema prompt per l'interpretazione dei comandi del calendario
 */
const SYSTEM_PROMPT = `Sei un assistente specializzato nella gestione del calendario Google.
IMPORTANTE: RISPONDI ESCLUSIVAMENTE IN FORMATO JSON.

Interpreta il comando dell'utente e restituisci un JSON con questa struttura:
{
  "action": "[AZIONE]",
  "parameters": {
    // Parametri specifici per l'azione
  }
}

Dove [AZIONE] deve essere uno di questi valori esatti:
- "CREATE_EVENT" (per creare un nuovo evento)
- "UPDATE_EVENT" (per modificare un evento esistente)
- "VIEW_EVENTS" (per visualizzare eventi esistenti)
- "DELETE_EVENT" (per eliminare un evento)

ESEMPI SPECIFICI PER OGNI TIPO DI COMANDO:

1. CREAZIONE EVENTI:
Comando: "Crea una riunione con Mario domani alle 15"
Risposta:
{
  "action": "CREATE_EVENT",
  "parameters": {
    "title": "Riunione con Mario",
    "date": "domani",
    "startTime": "15:00",
    "endTime": "16:00",
    "attendees": ["Mario"]
  }
}

2. MODIFICA EVENTI:
Comando: "Sposta la riunione con Mario alle 16"
Risposta:
{
  "action": "UPDATE_EVENT",
  "parameters": {
    "title": "Riunione con Mario",
    "startTime": "16:00"
  }
}

3. VISUALIZZAZIONE EVENTI:
Comando: "Mostra tutti gli eventi di domani"
Risposta:
{
  "action": "VIEW_EVENTS",
  "parameters": {
    "date": "domani",
    "maxResults": 10
  }
}

4. ELIMINAZIONE EVENTI:
Comando: "Elimina la riunione con Mario"
Risposta:
{
  "action": "DELETE_EVENT",
  "parameters": {
    "title": "Riunione con Mario"
  }
}

5. CASI SPECIALI:
Comando: "Elimina tutti gli eventi"
Risposta:
{
  "action": "DELETE_EVENT",
  "parameters": {
    "deleteAll": true
  }
}

Comando: "Elimina tutto per oggi"
Risposta:
{
  "action": "DELETE_EVENT",
  "parameters": {
    "date": "oggi",
    "deleteAll": true
  }
}

Comando: "Anticipa la riunione di domani di 30 minuti"
Risposta:
{
  "action": "UPDATE_EVENT",
  "parameters": {
    "date": "domani",
    "timeModification": {
      "type": "SHIFT",
      "direction": "BACKWARD",
      "amount": 30,
      "unit": "MINUTE"
    }
  }
}`;

/**
 * Processa un comando in linguaggio naturale usando Gemini API
 * @param {String} command - Comando in linguaggio naturale
 * @returns {Object} Azione e parametri interpretati
 */
const processCommand = async (command) => {
  logger.debug('Elaborazione comando:', command);
  
  try {
    // Log configurazione API
    logger.debug('Configurazione API Gemini:', { 
      apiKeyConfigured: !!process.env.GEMINI_API_KEY,
      apiKeyLength: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0
    });
    
    logger.debug('Invio richiesta a Gemini API');
    const requestPayload = {
      contents: [{
        parts: [
          { text: SYSTEM_PROMPT },
          { text: command }
        ]
      }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1024,
        topP: 0.8
      }
    };
    
    // Log della richiesta (senza la chiave API)
    logger.debug('Payload richiesta Gemini:', JSON.stringify(requestPayload));
    
    const response = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      requestPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY
        },
        timeout: 10000 // Aggiunto timeout di 10 secondi
      }
    );

    logger.debug('Risposta ricevuta da Gemini API con status:', response.status);
    
    // Verifica della struttura della risposta
    if (!response.data) {
      throw new Error('Risposta Gemini vuota');
    }
    
    // Log strutturato della risposta
    logger.debug('Struttura risposta Gemini', {
      hasData: !!response.data,
      hasCandidates: !!response.data.candidates,
      candidatesLength: response.data.candidates ? response.data.candidates.length : 0,
      firstCandidateHasContent: response.data.candidates && response.data.candidates[0] ? 
                               !!response.data.candidates[0].content : false
    });
    
    if (!response.data.candidates || 
        !response.data.candidates[0] || 
        !response.data.candidates[0].content || 
        !response.data.candidates[0].content.parts ||
        !response.data.candidates[0].content.parts[0]) {
      throw new Error('Formato risposta Gemini non valido o vuoto');
    }
    
    const geminiResult = response.data.candidates[0].content.parts[0].text;
    logger.debug('Testo risposta Gemini:', geminiResult);
    
    // Tentativo di parsing
    try {
      return parseGeminiResponse(geminiResult, command);
    } catch (parseError) {
      logger.error('Errore nel parsing della risposta Gemini:', parseError);
      logger.debug('Utilizzo parser locale di fallback dopo errore parsing');
      return parseCommandLocally(command);
    }
  } catch (error) {
    logger.error('Errore nella comunicazione con Gemini:', error.message);
    
    if (error.response) {
      logger.error('Dettagli errore API:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    } else if (error.request) {
      logger.error('Nessuna risposta ricevuta, possibile timeout');
    }
    
    // Fallback a un parser locale con log specifico
    logger.debug('Utilizzo parser locale di fallback dopo errore comunicazione');
    return parseCommandLocally(command);
  }
};

/**
 * Analizza la risposta JSON di Gemini
 * @param {String} responseText - Testo della risposta da analizzare
 * @param {String} originalCommand - Comando originale dell'utente
 * @returns {Object} Oggetto risultante
 */
const parseGeminiResponse = (responseText, originalCommand) => {
  try {
    logger.debug('Inizio parsing risposta Gemini:', responseText.substring(0, 200) + '...');
    
    // Verifica se la risposta contiene JSON
    if (!responseText.includes('{') || !responseText.includes('}')) {
      logger.error('Risposta non contiene JSON valido:', responseText);
      throw new Error('Risposta Gemini non in formato JSON');
    }
    
    // Estrai il JSON dalla risposta (rimuovi backticks e tag json)
    let jsonText = responseText.replace(/```json|```/g, '').trim();
    
    // Trova l'inizio e la fine del JSON
    const startIndex = jsonText.indexOf('{');
    const endIndex = jsonText.lastIndexOf('}') + 1;
    
    if (startIndex >= 0 && endIndex > startIndex) {
      jsonText = jsonText.substring(startIndex, endIndex);
    }
    
    // Sanitizza il JSON prima del parsing
    // Corregge problemi come "15":00" -> "15:00"
    jsonText = jsonText.replace(/"(\d{1,2})":(\d{2})"/g, '"$1:$2"');
    
    logger.debug('JSON sanitizzato:', jsonText);
    
    // Parsing del JSON
    const parsedResult = JSON.parse(jsonText);
    logger.debug('Parsing JSON completato con successo');
    
    return normalizeResponse(parsedResult, originalCommand);
  } catch (error) {
    logger.error('Errore nel parsing della risposta:', error);
    throw error;
  }
};

/**
 * Estrae informazioni sulla modifica temporale da un comando
 * @param {String} command - Comando originale
 * @returns {Object|null} Informazioni sulla modifica temporale o null
 */
const extractTimeModification = (command) => {
  const lowerCommand = command.toLowerCase();
  
  // Gestione anticipo/posticipo
  if (lowerCommand.includes('posticipa') || lowerCommand.includes('ritarda') || 
      lowerCommand.includes('sposta') || lowerCommand.includes('ora in avanti') || 
      lowerCommand.includes('ore in avanti')) {
    
    // Estrai il numero di ore
    const hourMatch = lowerCommand.match(/(\d+)\s*or[ae]/i);
    const hours = hourMatch ? parseInt(hourMatch[1]) : 1; // Default a 1 ora
    
    return {
      type: "SHIFT",
      direction: "FORWARD",
      amount: hours,
      unit: "HOUR"
    };
  } 
  else if (lowerCommand.includes('anticipa') || lowerCommand.includes('ora prima') || 
           lowerCommand.includes('ore prima')) {
    
    const hourMatch = lowerCommand.match(/(\d+)\s*or[ae]/i);
    const hours = hourMatch ? parseInt(hourMatch[1]) : 1; // Default a 1 ora
    
    return {
      type: "SHIFT",
      direction: "BACKWARD",
      amount: hours,
      unit: "HOUR"
    };
  }
  
  // Gestione spostamento a ora specifica
  const specificTimeMatch = lowerCommand.match(/(sposta|posticipa|anticipa).+alle\s+(\d{1,2})[:\.]?(\d{2})?/i);
  if (specificTimeMatch) {
    const hours = parseInt(specificTimeMatch[2]);
    const minutes = specificTimeMatch[3] ? parseInt(specificTimeMatch[3]) : 0;
    
    return {
      type: "EXACT",
      time: `${hours}:${minutes < 10 ? '0' + minutes : minutes}`
    };
  }
  
  return null;
};

/**
 * Elabora un comando relativo temporale
 * @param {String} command - Comando originale
 * @param {Object} parameters - Parametri attuali
 * @returns {Object} Parametri aggiornati
 */
const processRelativeTimeCommand = (command, parameters) => {
  const lowerCommand = command.toLowerCase();
  
  // Gestione spostamenti relativi (avanti/indietro)
  if (lowerCommand.includes('ora in avanti') || lowerCommand.includes('ore in avanti') || 
      lowerCommand.includes('posticipa') || lowerCommand.includes('ritarda')) {
    
    // Estrai il numero di ore
    const hourMatch = lowerCommand.match(/(\d+)\s*or[ae]/i);
    const hoursToAdd = hourMatch ? parseInt(hourMatch[1]) : 1; // Default a 1 ora
    
    parameters.hoursToShift = hoursToAdd;
    parameters.moveDirection = 'forward';
  } 
  else if (lowerCommand.includes('ora prima') || lowerCommand.includes('ore prima') || 
           lowerCommand.includes('anticipa')) {
    
    const hourMatch = lowerCommand.match(/(\d+)\s*or[ae]/i);
    const hoursToSubtract = hourMatch ? parseInt(hourMatch[1]) : 1; // Default a 1 ora
    
    parameters.hoursToShift = -hoursToSubtract;
    parameters.moveDirection = 'backward';
  }
  
  return parameters;
};

/**
 * Normalizza la risposta di Gemini
 * @param {Object} parsedResult - Risultato parsato da JSON
 * @param {String} originalCommand - Comando originale dell'utente
 * @returns {Object} Risultato normalizzato
 */
const normalizeResponse = (parsedResult, originalCommand) => {
  // Gestione struttura piatta vs nidificata
  if (!parsedResult.action && parsedResult.azione) {
    // Caso in cui abbiamo una risposta nel formato italiano non nidificato
    logger.debug('Normalizzazione risposta da formato italiano piatto');
    
    // Mappa dei campi da italiano a inglese
    const actionMapping = {
      'crea_evento': 'CREATE_EVENT',
      'modifica_evento': 'UPDATE_EVENT',
      'visualizza_eventi': 'VIEW_EVENTS',
      'elimina_evento': 'DELETE_EVENT',
    };
    
    // Crea la struttura attesa
    return {
      action: actionMapping[parsedResult.azione.toLowerCase()] || 'CREATE_EVENT',
      parameters: {
        title: parsedResult.riepilogo || parsedResult.titolo,
        description: parsedResult.descrizione,
        date: parsedResult.data,
        startTime: parsedResult.ora_inizio,
        endTime: parsedResult.ora_fine,
        attendees: parsedResult.partecipanti || []
      }
    };
  }

  // Codice originale per formati già corretti
  if (!parsedResult.action) {
    throw new Error('Campo "action" mancante nella risposta');
  }
  
  // Normalizza l'azione
  let action = parsedResult.action.toUpperCase();
  
  // Mappa azioni in italiano a costanti in inglese
  const actionMapping = {
    'CREA EVENTO': 'CREATE_EVENT',
    'MODIFICA EVENTO': 'UPDATE_EVENT',
    'VISUALIZZA EVENTI': 'VIEW_EVENTS',
    'ELIMINA EVENTO': 'DELETE_EVENT',
  };
  
  if (actionMapping[action]) {
    action = actionMapping[action];
  } else if (!action.includes('_')) {
    // Converti formato "Crea evento" -> "CREATE_EVENT"
    action = action.toUpperCase().replace(' ', '_');
  }
  
  // Assicurati che parameters sia un oggetto
  const parameters = parsedResult.parameters || {};
  
  // Normalizza i nomi dei parametri
  let normalizedParams = {};
  
  if (parameters.title || parameters.titolo) {
    normalizedParams.title = parameters.title || parameters.titolo;
  }
  
  if (parameters.description || parameters.descrizione) {
    normalizedParams.description = parameters.description || parameters.descrizione;
  }
  
  if (parameters.date || parameters.data) {
    normalizedParams.date = parameters.date || parameters.data;
  }
  
  if (parameters.startTime || parameters.ora_inizio) {
    normalizedParams.startTime = parameters.startTime || parameters.ora_inizio;
  }
  
  if (parameters.endTime || parameters.ora_fine) {
    normalizedParams.endTime = parameters.endTime || parameters.ora_fine;
  }
  
  if (parameters.attendees || parameters.partecipanti) {
    normalizedParams.attendees = parameters.attendees || parameters.partecipanti;
    
    // Assicurati che attendees sia un array
    if (!Array.isArray(normalizedParams.attendees)) {
      normalizedParams.attendees = [normalizedParams.attendees];
    }
    
    // Controllo se si tratta di aggiunta di partecipanti
    const lowerCommand = originalCommand.toLowerCase();
    if (lowerCommand.includes('aggiungi') && 
        (lowerCommand.includes('alla riunione') || lowerCommand.includes('all\'evento'))) {
      normalizedParams.attendeesAction = 'ADD';
      logger.debug('Rilevata azione di aggiunta partecipanti');
    }
  }
  
  // Gestione della modifica temporale
  if (parameters.timeModification) {
    normalizedParams.timeModification = parameters.timeModification;
  } else if (!parameters.startTime && !parameters.endTime) {
    // Aggiungi modifiche temporali solo se non ci sono già orari specifici
    const timeModification = extractTimeModification(originalCommand);
    if (timeModification) {
      normalizedParams.timeModification = timeModification;
    }
  }
  
  if (parameters.query) {
    normalizedParams.query = parameters.query;
  }
  
  // Per azioni di visualizzazione, aggiungi limiti predefiniti
  if (action === 'VIEW_EVENTS' && !normalizedParams.maxResults) {
    normalizedParams.maxResults = 10;
  }
  
  return {
    action,
    parameters: normalizedParams
  };
};

/**
 * Parser locale come fallback in caso di errori con Gemini
 * @param {String} command - Comando da interpretare
 * @returns {Object} Azione e parametri interpretati
 */
const parseCommandLocally = (command) => {
  logger.debug('Parsing locale del comando:', command);
  const lowerCommand = command.toLowerCase().trim();
  
  // SEZIONE 1: COMANDI SPECIALI
  // Gestione "elimina tutto"
  if (lowerCommand === 'elimina tutto' || 
      lowerCommand.includes('elimina tutti gli eventi') || 
      lowerCommand.includes('cancella tutto')) {
    
    logger.debug('Rilevato comando speciale: eliminazione totale');
    const parameters = { deleteAll: true };
    
    // Controlla se c'è una data specifica
    if (lowerCommand.includes('oggi')) {
      parameters.date = 'oggi';
    } else if (lowerCommand.includes('domani')) {
      parameters.date = 'domani';
    } else if (lowerCommand.includes('questa settimana')) {
      parameters.period = 'current_week';
    }
    
    return { 
      action: 'DELETE_EVENT', 
      parameters 
    };
  }
  
  // SEZIONE 2: DETERMINAZIONE AZIONE PRINCIPALE
  let action = determineMainAction(lowerCommand);
  let parameters = {};
  
  // SEZIONE 3: ESTRAZIONE TITOLO E PARTECIPANTI
  extractTitleAndAttendees(lowerCommand, parameters);
  
  // SEZIONE 4: ESTRAZIONE DATE E ORARI
  extractDateAndTime(lowerCommand, parameters);
  
  // SEZIONE 5: GESTIONE MODIFICHE TEMPORALI
  processTemporalModifications(lowerCommand, parameters);
  
  // SEZIONE 6: RILEVAMENTO AGGIUNTA PARTECIPANTI
  if (lowerCommand.includes('aggiungi') && 
      (lowerCommand.includes('alla riunione') || lowerCommand.includes('all\'evento'))) {
    parameters.attendeesAction = 'ADD';
    
    // Estrai solo il nuovo partecipante, non tutti
    const matchPerson = lowerCommand.match(/aggiungi\s+([A-Za-z]+)\s+(?:alla|all')/i);
    if (matchPerson && matchPerson[1]) {
      parameters.attendees = [matchPerson[1]];
      logger.debug('Rilevata aggiunta partecipante:', matchPerson[1]);
    }
  }
  
  return { action, parameters };
};

/**
 * Determina l'azione principale dal comando
 * @param {String} command - Comando in minuscolo
 * @returns {String} Azione determinata
 */
const determineMainAction = (command) => {
  if (command.includes('crea') || 
      command.includes('aggiungi') || 
      command.includes('inserisci') || 
      command.includes('programma') || 
      command.includes('organizza')) {
    return 'CREATE_EVENT';
  } 
  
  if (command.includes('modifica') || 
      command.includes('aggiorna') || 
      command.includes('cambia') || 
      command.includes('sposta') || 
      command.includes('anticipa') || 
      command.includes('posticipa')) {
    return 'UPDATE_EVENT';
  }
  
  if (command.includes('elimina') || 
      command.includes('cancella') || 
      command.includes('rimuovi')) {
    return 'DELETE_EVENT';
  }
  
  if (command.includes('mostra') || 
      command.includes('visualizza') || 
      command.includes('elenca') || 
      command.includes('quali') || 
      command.includes('trovami')) {
    return 'VIEW_EVENTS';
  }
  
  // Default: visualizzazione eventi
  return 'VIEW_EVENTS';
};

/**
 * Estrae titolo e partecipanti dal comando
 * @param {String} command - Comando in minuscolo
 * @param {Object} parameters - Parametri da popolare
 */
const extractTitleAndAttendees = (command, parameters) => {
  // Estrazione più accurata del titolo
  let titleMatch = null;
  let attendees = [];
  
  // Pattern per riunioni e appuntamenti
  if (command.includes('riunione con') || command.includes('appuntamento con')) {
    titleMatch = command.match(/(?:riunione|appuntamento) con ([A-Za-z]+(?:\s+e\s+[A-Za-z]+)*)(?:\s|$)/i);
    
    if (titleMatch && titleMatch[1]) {
      // Gestione di più partecipanti separati da "e"
      const participantsText = titleMatch[1].trim();
      attendees = participantsText.split(/\s+e\s+/).map(p => p.trim());
      
      parameters.title = `Riunione con ${participantsText}`;
      parameters.attendees = attendees;
    }
  } 
  // Pattern per eventi generici
  else if (command.includes('evento')) {
    titleMatch = command.match(/evento\s+(?:su|per|di)\s+["']?([^"']+)["']?/i);
    
    if (titleMatch && titleMatch[1]) {
      parameters.title = titleMatch[1].trim();
    } else {
      parameters.title = 'Nuovo evento';
    }
  }
  // Default
  else if (!parameters.title) {
    parameters.title = 'Nuovo evento';
  }
};

/**
 * Estrae data e orario dal comando
 * @param {String} command - Comando in minuscolo
 * @param {Object} parameters - Parametri da popolare
 */
const extractDateAndTime = (command, parameters) => {
  // Estrazione della data
  if (command.includes('oggi')) {
    parameters.date = 'oggi';
  } else if (command.includes('domani')) {
    parameters.date = 'domani';
  } else if (command.includes('dopodomani')) {
    parameters.date = 'dopodomani';
  }
  
  // Estrazione giorni della settimana
  const weekdayMatch = command.match(/\b(lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica)\b/i);
  if (weekdayMatch) {
    parameters.date = weekdayMatch[1].toLowerCase();
    
    if (command.includes('prossimo') || command.includes('prossima')) {
      parameters.date = `${parameters.date} prossimo`;
    }
  }
  
  // Estrai orario
  const timeMatch = command.match(/(\d{1,2})[:\.]?(\d{2})?\s*$/);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1]);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    parameters.startTime = `${hours}:${minutes < 10 ? '0' + minutes : minutes}`;
    
    // Calcola un'ora in più per l'orario di fine predefinito
    const endHours = (hours + 1) % 24;
    parameters.endTime = `${endHours}:${minutes < 10 ? '0' + minutes : minutes}`;
  }
  
  // Estrazione orari specifici "alle X"
  const timeSpecificMatch = command.match(/alle\s+(\d{1,2})(?:[:\.](\d{2}))?/i);
  if (timeSpecificMatch) {
    const hours = parseInt(timeSpecificMatch[1]);
    const minutes = timeSpecificMatch[2] ? parseInt(timeSpecificMatch[2]) : 0;
    parameters.startTime = `${hours}:${minutes < 10 ? '0' + minutes : minutes}`;
    
    // Calcola un'ora in più per l'orario di fine predefinito
    const endHours = (hours + 1) % 24;
    parameters.endTime = `${endHours}:${minutes < 10 ? '0' + minutes : minutes}`;
  }
};

/**
 * Analizza modifiche temporali nel comando
 * @param {String} command - Comando in minuscolo
 * @param {Object} parameters - Parametri da popolare
 */
const processTemporalModifications = (command, parameters) => {
  // Gestione modifiche temporali relative (avanti/indietro)
  if (command.includes('ora in avanti') || 
      command.includes('ore in avanti') || 
      command.includes('posticipa') || 
      command.includes('ritarda')) {
    
    // Estrai il numero di ore
    const hourMatch = command.match(/(\d+)\s*or[ae]/i);
    const hoursToAdd = hourMatch ? parseInt(hourMatch[1]) : 1; // Default a 1 ora
    
    parameters.timeModification = {
      type: "SHIFT",
      direction: "FORWARD",
      amount: hoursToAdd,
      unit: "HOUR"
    };
  } 
  else if (command.includes('ora prima') || 
           command.includes('ore prima') || 
           command.includes('anticipa')) {
    
    const hourMatch = command.match(/(\d+)\s*or[ae]/i);
    const hoursToSubtract = hourMatch ? parseInt(hourMatch[1]) : 1; // Default a 1 ora
    
    parameters.timeModification = {
      type: "SHIFT",
      direction: "BACKWARD",
      amount: hoursToSubtract,
      unit: "HOUR"
    };
  }
  
  // Gestione minuti
  const minuteMatch = command.match(/(\d+)\s*minut[oi]/i);
  if (minuteMatch) {
    const minutes = parseInt(minuteMatch[1]);
    
    if (parameters.timeModification) {
      parameters.timeModification.amount = minutes;
      parameters.timeModification.unit = "MINUTE";
    } else if (command.includes('anticipa') || command.includes('prima')) {
      parameters.timeModification = {
        type: "SHIFT",
        direction: "BACKWARD",
        amount: minutes,
        unit: "MINUTE"
      };
    } else {
      parameters.timeModification = {
        type: "SHIFT",
        direction: "FORWARD",
        amount: minutes,
        unit: "MINUTE"
      };
    }
  }
};

module.exports = {
  processCommand
};