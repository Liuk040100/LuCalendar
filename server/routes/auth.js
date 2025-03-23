/**
 * Route per la gestione dell'autenticazione
 */

const express = require('express');
const router = express.Router();
const { getAuthUrl, exchangeCodeForTokens } = require('../services/authService');
const { createLogger } = require('../utils/logger');

const logger = createLogger('auth-routes');

/**
 * GET /api/auth/url
 * Restituisce l'URL per l'autenticazione OAuth
 */
router.get('/url', (req, res) => {
  try {
    const url = getAuthUrl();
    res.json({ url });
  } catch (error) {
    logger.error('Errore nella generazione URL auth:', error);
    res.status(500).json({ error: 'Impossibile generare URL di autenticazione' });
  }
});

/**
 * GET /api/auth/callback
 * Gestisce il callback OAuth di Google
 */
router.get('/callback', async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    logger.error('Callback OAuth senza codice');
    return res.redirect(`${process.env.CLIENT_URL}?auth=error&message=Codice%20mancante`);
  }
  
  try {
    const tokens = await exchangeCodeForTokens(code);
    
    // Salva i token nella sessione dell'utente
    req.session.tokens = tokens;
    
    // Assicurati che la sessione venga salvata prima del redirect
    req.session.save((err) => {
      if (err) {
        logger.error('Errore nel salvataggio della sessione:', err);
        return res.redirect(`${process.env.CLIENT_URL}?auth=error&message=Errore%20di%20sessione`);
      }
      
      // Redirect al frontend con successo
      res.redirect(`${process.env.CLIENT_URL}?auth=success`);
    });
  } catch (error) {
    logger.error('Errore nell\'autenticazione OAuth:', error);
    res.redirect(`${process.env.CLIENT_URL}?auth=error&message=${encodeURIComponent(error.message)}`);
  }
});

/**
 * GET /api/auth/token
 * Restituisce il token di accesso attuale (se presente)
 */
router.get('/token', (req, res) => {
  if (req.session.tokens && req.session.tokens.access_token) {
    res.json({ 
      accessToken: req.session.tokens.access_token,
      expiryDate: req.session.tokens.expiry_date 
    });
  } else {
    res.status(401).json({ error: 'Nessun token disponibile' });
  }
});

/**
 * POST /api/auth/logout
 * Termina la sessione dell'utente
 */
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      logger.error('Errore nella distruzione della sessione:', err);
      return res.status(500).json({ error: 'Errore nel logout' });
    }
    res.json({ success: true, message: 'Logout effettuato con successo' });
  });
});

module.exports = router;