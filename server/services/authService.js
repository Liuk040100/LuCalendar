/**
 * Servizio per la gestione dell'autenticazione con Google OAuth 2.0
 */

const { createOAuth2Client, generateAuthUrl } = require('../config/auth');

/**
 * Ottiene l'URL di autenticazione OAuth 2.0
 * @returns {String} URL di autenticazione
 */
const getAuthUrl = () => {
  const oauth2Client = createOAuth2Client();
  return generateAuthUrl(oauth2Client);
};

/**
 * Scambia il codice di autorizzazione con i token di accesso
 * @param {String} code - Codice di autorizzazione ricevuto da Google
 * @returns {Object} Token di accesso e refresh
 */
const exchangeCodeForTokens = async (code) => {
  try {
    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
  } catch (error) {
    console.error('Errore nello scambio del codice per i token:', error);
    throw new Error(`Impossibile ottenere i token: ${error.message}`);
  }
};

/**
 * Verifica e aggiorna i token se necessario
 * @param {Object} tokens - Token di accesso e refresh
 * @returns {Object} Token aggiornati
 */
const refreshTokensIfNeeded = async (tokens) => {
  if (!tokens || !tokens.access_token) {
    throw new Error('Token non validi');
  }

  const expiryDate = tokens.expiry_date;
  const now = Date.now();
  
  // Aggiorna il token se scade entro 5 minuti
  if (!expiryDate || expiryDate - now < 300000) {
    if (!tokens.refresh_token) {
      throw new Error('Refresh token mancante, richiesta riautenticazione');
    }
    
    try {
      const oauth2Client = createOAuth2Client();
      oauth2Client.setCredentials(tokens);
      const result = await oauth2Client.refreshToken(tokens.refresh_token);
      
      if (!result || !result.credentials || !result.credentials.access_token) {
        throw new Error('Token refresh non riuscito: dati incompleti');
      }
      
      // Mantieni il refresh token originale se non è stato restituito un nuovo
      if (!result.credentials.refresh_token && tokens.refresh_token) {
        result.credentials.refresh_token = tokens.refresh_token;
      }
      
      return result.credentials;
    } catch (error) {
      console.error('Errore nel refresh del token:', error.message);
      throw new Error('Sessione scaduta, effettua nuovamente il login');
    }
  }
  
  return tokens;
};

/**
 * Crea un client Google API autenticato
 * @param {Object} tokens - Token di accesso e refresh
 * @returns {Object} Google OAuth2 client configurato
 */
const createAuthenticatedClient = (tokens) => {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials(tokens);
  return oauth2Client;
};

module.exports = {
  getAuthUrl,
  exchangeCodeForTokens,
  refreshTokensIfNeeded,
  createAuthenticatedClient
};