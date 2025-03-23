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
    logger.info('Elaborazione comando:', command);
    
    // Utilizza Gemini per interpretare il comando
    const parsedCommand = await geminiService.processCommand(command);
    logger.debug('Comando interpretato:', parsedCommand);
    
    // Esegui l'azione appropriata
    const result = await executeCalendarAction(parsedCommand, req.oauth2Client);
    
    res.json({ result });
  } catch (error) {
    logger.error('Errore nell\'elaborazione del comando:', error);
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