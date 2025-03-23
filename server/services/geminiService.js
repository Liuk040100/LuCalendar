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
Interpreta il comando dell'utente per determinare quale operazione eseguire:
1. Crea evento
2. Modifica evento
3. Visualizza eventi
4. Elimina evento

Per ogni comando, estrai i dettagli pertinenti come data, ora, titolo, descrizione, partecipanti, ecc.
Rispondi in formato JSON con i campi "action" e "parameters".

Il campo "action" deve essere uno tra:
- "CREATE_EVENT" (per creare un nuovo evento)
- "UPDATE_EVENT" (per modificare un evento esistente)
- "VIEW_EVENTS" (per visualizzare eventi esistenti)
- "DELETE_EVENT" (per eliminare un evento)

Il campo "parameters" deve contenere i seguenti campi (solo quelli pertinenti):
- "title": il nome dell'evento
- "date": la data dell'evento (oggi, domani, un giorno specifico)
- "startTime": l'ora di inizio dell'evento in formato HH:MM
- "endTime": l'ora di fine dell'evento in formato HH:MM
- "description": descrizione dell'evento
- "attendees": elenco dei partecipanti
- "query": termine di ricerca per trovare eventi esistenti

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
    "attendees": ["mario@example.com"]
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
    const response = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      {
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
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY
        }
      }
    );

    logger.debug('Risposta ricevuta da Gemini API');
    
    if (!response.data.candidates || 
        !response.data.candidates[0] || 
        !response.data.candidates[0].content || 
        !response.data.candidates[0].content.parts ||
        !response.data.candidates[0].content.parts[0]) {
      throw new Error('Formato risposta Gemini non valido o vuoto');
    }
    
    const geminiResult = response.data.candidates[0].content.parts[0].text;
    return parseGeminiResponse(geminiResult);
  } catch (error) {
    logger.error('Errore nella comunicazione con Gemini:', error);
    
    if (error.response) {
      logger.error('Dettagli risposta errore:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    }
    
    // Fallback a un parser locale
    logger.debug('Utilizzo parser locale di fallback');
    return parseCommandLocally(command);
  }
};

/**
 * Analizza la risposta JSON di Gemini
 * @param {String} responseText - Testo della risposta da analizzare
 * @returns {Object} Oggetto risultante
 */
const parseGeminiResponse = (responseText) => {
  try {
    // Estrai il JSON dalla risposta
    let jsonText = responseText;
    
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
    
    // Pulisci il testo per il parsing
    jsonText = jsonText.replace(/\\n/g, ' ').replace(/\\"/g, '"');
    
    // Parsing del JSON
    logger.debug('Tentativo di parsing JSON:', jsonText);
    const parsedResult = JSON.parse(jsonText);
    
    // Verifica e normalizza il risultato
    return normalizeResponse(parsedResult);
  } catch (error) {
    logger.error('Errore nel parsing JSON della risposta:', error);
    throw error;
  }
};

/**
 * Normalizza la risposta di Gemini
 * @param {Object} parsedResult - Risultato parsato da JSON
 * @returns {Object} Risultato normalizzato
 */
const normalizeResponse = (parsedResult) => {
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
  const normalizedParams = {};
  
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
  const parameters = {};
  
  // Estrai il titolo
  const titleMatch = command.match(/chiamat[oa]\s+([^,\.]+)/i) || 
                     command.match(/intitolat[oa]\s+([^,\.]+)/i) ||
                     command.match(/\b(evento|riunione|appuntamento)\s+([^,\.]+)/i) ||
                     command.match(/(?:sposta|modifica|elimina|cancella)\s+(?:l[''])?(?:evento|appuntamento|riunione)?\s*(?:chiamato)?\s*["']?([^,\.\s"']+)["']?/i);
  
  if (titleMatch) {
    parameters.title = (titleMatch[1] || titleMatch[2]).trim();
  }
  
  // Estrai orario
  const timeMatch = command.match(/(\d{1,2})[:\.](\d{2})/);
  if (timeMatch) {
    parameters.startTime = `${timeMatch[1]}:${timeMatch[2]}`;
    
    // Aggiungi anche un'ora di fine predefinita (+1 ora)
    const hour = parseInt(timeMatch[1]);
    parameters.endTime = `${hour + 1}:${timeMatch[2]}`;
  }
  
  // Estrai data
  if (lowerCommand.includes('oggi')) {
    parameters.date = 'oggi';
  } else if (lowerCommand.includes('domani')) {
    parameters.date = 'domani';
  } else if (lowerCommand.includes('prossim')) {
    // Prova a estrarre il giorno della settimana
    const days = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
    for (const day of days) {
      if (lowerCommand.includes(day)) {
        parameters.date = `prossimo ${day}`;
        break;
      }
    }
  }
  
  // Determina l'azione
  if (lowerCommand.includes('crea') || lowerCommand.includes('nuovo') || 
      lowerCommand.includes('aggiungi') || lowerCommand.includes('fissa')) {
    action = 'CREATE_EVENT';
  } else if (lowerCommand.includes('mostra') || lowerCommand.includes('visualizza') || 
             lowerCommand.includes('elenco') || lowerCommand.includes('vedi')) {
    action = 'VIEW_EVENTS';
  } else if (lowerCommand.includes('modifica') || lowerCommand.includes('sposta') || 
             lowerCommand.includes('cambia') || lowerCommand.includes('aggiorna')) {
    action = 'UPDATE_EVENT';
  } else if (lowerCommand.includes('elimina') || lowerCommand.includes('cancella') || 
             lowerCommand.includes('rimuovi')) {
    action = 'DELETE_EVENT';
  } else {
    // Default
    action = 'VIEW_EVENTS';
  }
  
  return { action, parameters };
};

module.exports = {
  processCommand
};