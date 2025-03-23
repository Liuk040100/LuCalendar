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
    logger.debug('Token disponibile:', !!req.oauth2Client);
    
    // Utilizza Gemini per interpretare il comando
    logger.debug('Inizio interpretazione comando con Gemini');
    const parsedCommand = await geminiService.processCommand(command);
    logger.debug('Comando interpretato:', parsedCommand);
    
    // Esegui l'azione appropriata
    logger.debug('Esecuzione azione sul calendario:', parsedCommand.action);
    const result = await executeCalendarAction(parsedCommand, req.oauth2Client);
    
    logger.debug('Risultato operazione:', result);
    res.json({ result });
  } catch (error) {
    // Log dettagliato dell'errore
    logger.error('Errore nell\'elaborazione del comando:', error);
    logger.error('Stack trace:', error.stack);
    
    res.status(500).json({ 
      error: 'Errore nell\'elaborazione del comando',
      details: error.message 
    });
  }
});

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