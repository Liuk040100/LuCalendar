/**
 * Route per la gestione del calendario
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth');
const calendarService = require('../services/calendarService');
const geminiService = require('../services/geminiService');
const { createLogger } = require('../utils/logger');

const logger = createLogger('calendar-routes');

/**
 * POST /api/process-command
 * Elabora un comando in linguaggio naturale e lo esegue sul calendario
 */
router.post('/process-command', requireAuth, async (req, res) => {
  const { command } = req.body;
  
  if (!command) {
    return res.status(400).json({ error: 'Comando mancante' });
  }
  
  try {
    // Aggiungi log per verificare l'input
    logger.info('Elaborazione comando:', command);
    
    // Verifica autenticazione
    if (!req.oauth2Client) {
      logger.error('Client OAuth2 non disponibile');
      return res.status(401).json({ 
        error: 'Errore di autenticazione',
        details: 'Token non valido o sessione scaduta' 
      });
    }
    
    logger.debug('Token disponibile, continuo con l\'elaborazione');
    
    // Nuova funzionalità: preprocessamento del comando
    const commandPreprocessor = require('../utils/commandPreprocessor');
    const preprocessed = commandPreprocessor.preprocessCommand(command);
    logger.trace('Preprocessamento', command, preprocessed);
    
    // Se il preprocessore ha identificato una risposta diretta, usala
    if (preprocessed.metadata.isSpecialCommand && preprocessed.metadata.directResponse) {
      logger.debug('Rilevato comando speciale con risposta diretta');
      const result = await executeCalendarAction(
        preprocessed.metadata.directResponse, 
        req.oauth2Client
      );
      logger.debug('Risultato operazione da comando speciale:', result);
      return res.json({ result });
    }
    
    // Arricchisci il comando prima di inviarlo a Gemini
    const enrichedCommand = commandPreprocessor.enrichCommand(preprocessed);
    logger.trace('Arricchimento', command, enrichedCommand);
    
    // Utilizza Gemini per interpretare il comando
    logger.debug('Inizio interpretazione comando con Gemini');
    let parsedCommand;
    try {
      parsedCommand = await geminiService.processCommand(enrichedCommand);
      logger.debug('Comando interpretato:', parsedCommand);
    } catch (geminiError) {
      logger.error('Errore specifico nell\'interpretazione del comando:', geminiError);
      return res.status(500).json({ 
        error: 'Errore nell\'interpretazione del comando',
        details: geminiError.message 
      });
    }
    
    // Verifica la validità del comando interpretato
    if (!parsedCommand || !parsedCommand.action) {
      logger.error('Comando interpretato non valido:', parsedCommand);
      return res.status(400).json({ 
        error: 'Impossibile interpretare il comando',
        details: 'Prova a riformulare la richiesta' 
      });
    }
    
    // Arricchisci i parametri con metadati dal preprocessore
    if (preprocessed.metadata.hasTemporalContext && parsedCommand.parameters) {
      enrichParametersWithTemporalContext(parsedCommand.parameters, preprocessed.metadata);
    }
    
    // Esegui l'azione appropriata
    logger.debug('Esecuzione azione sul calendario:', parsedCommand.action);
    try {
      const result = await executeCalendarAction(parsedCommand, req.oauth2Client);
      logger.debug('Risultato operazione:', result);
      res.json({ result });
    } catch (actionError) {
      logger.error('Errore nell\'esecuzione dell\'azione sul calendario:', actionError);
      return res.status(500).json({ 
        error: 'Errore nell\'esecuzione dell\'azione sul calendario',
        details: actionError.message 
      });
    }
  } catch (error) {
    // Log dettagliato dell'errore
    logger.error('Errore generale nell\'elaborazione del comando:', error);
    logger.error('Stack trace:', error.stack);
    
    // Risposta con dettagli più specifici
    res.status(500).json({ 
      error: 'Errore nell\'elaborazione del comando',
      details: error.message || 'Errore sconosciuto'
    });
  }
});

/**
 * Arricchisce i parametri con informazioni temporali dal preprocessore
 * @param {Object} parameters - Parametri dell'azione
 * @param {Object} metadata - Metadati dal preprocessore
 */
const enrichParametersWithTemporalContext = (parameters, metadata) => {
  if (!parameters) return;
  
  // Se ci sono riferimenti temporali specifici
  if (metadata.detectedEntities.specificTime && !parameters.startTime) {
    parameters.startTime = metadata.detectedEntities.specificTime;
  }
  
  // Se c'è una data specifica
  if (metadata.detectedEntities.specificDate && !parameters.date) {
    parameters.date = metadata.detectedEntities.specificDate;
  }
  
  // Se c'è un modificatore temporale
  if (metadata.detectedEntities.modifier) {
    if (!parameters.timeModification) {
      parameters.timeModification = {
        type: "SHIFT",
        direction: metadata.detectedEntities.modifier === 'hour' ? "FORWARD" : "BACKWARD",
        amount: metadata.detectedEntities.hourModifier || metadata.detectedEntities.minuteModifier || 1,
        unit: metadata.detectedEntities.modifier === 'hour' ? "HOUR" : "MINUTE"
      };
    }
  }
};

/**
 * Esegue l'azione sul calendario in base al comando interpretato
 * @param {Object} parsedCommand - Comando interpretato
 * @param {Object} auth - Client OAuth2 autenticato
 * @returns {Object} Risultato dell'operazione
 */
const executeCalendarAction = async (parsedCommand, auth) => {
  const { action, parameters } = parsedCommand;
  
  switch (action) {
    case 'CREATE_EVENT':
      return await calendarService.createEvent(auth, parameters);
    case 'UPDATE_EVENT':
      return await calendarService.updateEvent(auth, parameters);
    case 'VIEW_EVENTS':
      return await calendarService.listEvents(auth, parameters);
    case 'DELETE_EVENT':
      return await calendarService.deleteEvent(auth, parameters);
    default:
      return { 
        success: false,
        message: 'Azione non supportata', 
        details: action 
      };
  }
};

module.exports = router;