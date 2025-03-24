/**
 * Servizio per l'integrazione con l'API Gemini
 */

const axios = require('axios');
const { createLogger } = require('../utils/logger');

const logger = createLogger('gemini-service');

/**
 * Sistema prompt per l'interpretazione dei comandi del calendario
 */
const SYSTEM_PROMPT = `Sei un assistente che aiuta a gestire il calendario Google. 
IMPORTANTE: RISPONDI SOLO IN FORMATO JSON.
Interpreta il comando dell'utente per determinare quale operazione eseguire e restituisci un JSON con questa struttura:
{
  "action": "[AZIONE]",
  "parameters": {
    "title": "Titolo evento",
    "date": "Data evento",
    "startTime": "Ora inizio",
    "endTime": "Ora fine",
    "description": "Descrizione",
    "attendees": ["nome1", "nome2"],
    "timeModification": {
      "type": "SHIFT",
      "direction": "FORWARD/BACKWARD",
      "amount": 1,
      "unit": "HOUR/MINUTE"
    }
  }
}

Dove [AZIONE] deve essere uno di questi valori esatti:
- "CREATE_EVENT" (per creare un nuovo evento)
- "UPDATE_EVENT" (per modificare un evento esistente)
- "VIEW_EVENTS" (per visualizzare eventi esistenti)
- "DELETE_EVENT" (per eliminare un evento)

Per comandi come "posticipa", "anticipa", "sposta", aggiungi l'oggetto "timeModification" con:
- "type": "SHIFT" 
- "direction": "FORWARD" (per posticipare) o "BACKWARD" (per anticipare)
- "amount": il numero di unità di tempo
- "unit": "HOUR" o "MINUTE"

Esempio:
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

Esempio:
Comando: "Posticipa la riunione con Mario di un'ora"
Risposta:
{
  "action": "UPDATE_EVENT",
  "parameters": {
    "title": "Riunione con Mario",
    "timeModification": {
      "type": "SHIFT",
      "direction": "FORWARD",
      "amount": 1,
      "unit": "HOUR"
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
  const lowerCommand = command.toLowerCase();
  let action = null;
  let parameters = {};
  
  try {
    // Nella funzione parseCommandLocally
    if (lowerCommand.includes('elimina tutto')) {
      action = 'DELETE_EVENT';
      parameters = {
        date: 'oggi',
        deleteAll: true
      };
      logger.debug('Rilevato comando di eliminazione di tutti gli eventi');
      return { action, parameters };
    }
    
    // Estrazione più accurata del titolo
    if (lowerCommand.includes('riunione con') || lowerCommand.includes('appuntamento con')) {
      const match = command.match(/(?:riunione|appuntamento) con ([A-Za-z]+)(?:\s|$)/i);
      if (match && match[1]) {
        parameters.title = `Riunione con ${match[1].trim()}`;
        // Estrai solo il nome della persona come partecipante
        parameters.attendees = [match[1].trim()]; 
        logger.debug('Titolo estratto:', parameters.title);
        logger.debug('Partecipante estratto:', parameters.attendees[0]);
      }
    } else {
      parameters.title = 'Nuovo evento';
    }
    
    // Estrai orario
    const timeMatch = command.match(/(\d{1,2})[:\.]?(\d{2})?\s*$/);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1]);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      parameters.startTime = `${hours}:${minutes || '00'}`;
      parameters.endTime = `${(hours + 1) % 24}:${minutes || '00'}`;
      logger.debug('Orario inizio estratto:', parameters.startTime);
    }
    
    // Estrazione della data
    if (lowerCommand.includes('oggi')) {
      parameters.date = 'oggi';
    } else if (lowerCommand.includes('domani')) {
      parameters.date = 'domani';
    }
    
    // Estrazione delle modifiche temporali
    const timeModification = extractTimeModification(command);
    if (timeModification) {
      parameters.timeModification = timeModification;
    }
    
    // Determina l'azione
    if (lowerCommand.includes('crea')) {
      action = 'CREATE_EVENT';
    } else if (lowerCommand.includes('mostra')) {
      action = 'VIEW_EVENTS';
    } else if (lowerCommand.includes('modifica') || lowerCommand.includes('sposta') || 
               lowerCommand.includes('anticipa') || lowerCommand.includes('posticipa')) {
      action = 'UPDATE_EVENT';
    } else if (lowerCommand.includes('elimina')) {
      action = 'DELETE_EVENT';
    } else {
      action = 'VIEW_EVENTS'; // Default modificato a visualizzazione
    }
    
    return { action, parameters };
  } catch (error) {
    logger.error('Errore nel parser locale:', error);
    return {
      action: 'VIEW_EVENTS',
      parameters: { maxResults: 5 }
    };
  }
};

module.exports = {
  processCommand
};