/**
 * Middleware per la gestione dell'autenticazione
 */

const { refreshTokensIfNeeded, createAuthenticatedClient } = require('../services/authService');
const { createLogger } = require('../utils/logger');

const logger = createLogger('auth-middleware');

/**
 * Middleware per verificare l'autenticazione dell'utente
 * e aggiornare i token se necessario
 */
const requireAuth = async (req, res, next) => {
  try {
    // Verifica se l'utente ha una sessione attiva
    if (!req.session || !req.session.tokens) {
      return res.status(401).json({ error: 'Non autenticato' });
    }

    try {
      // Aggiorna i token se necessario
      const updatedTokens = await refreshTokensIfNeeded(req.session.tokens);
      
      // Aggiorna i token nella sessione
      req.session.tokens = updatedTokens;
      
      // Salva la sessione in modo sincrono per garantire che venga salvata
      // prima di passare al middleware successivo
      await new Promise((resolve, reject) => {
        req.session.save(err => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      // Crea un client autenticato e lo aggiunge alla richiesta
      req.oauth2Client = createAuthenticatedClient(updatedTokens);
      
      next();
    } catch (error) {
      logger.error('Errore di autenticazione:', error);
      
      // Pulisci la sessione in caso di errore
      req.session.tokens = null;
      await new Promise(resolve => req.session.save(resolve));
      
      return res.status(401).json({ 
        error: 'Sessione scaduta',
        message: error.message 
      });
    }
  } catch (error) {
    logger.error('Errore critico nel middleware di autenticazione:', error);
    return res.status(500).json({ error: 'Errore del server' });
  }
};

module.exports = {
  requireAuth
};