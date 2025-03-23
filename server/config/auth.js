/**
 * Configurazione dell'autenticazione OAuth 2.0 con Google
 */

const { google } = require('googleapis');

// Scopes richiesti per l'accesso alle API di Google Calendar
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events'
];

// Crea e configura il client OAuth2
const createOAuth2Client = () => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.REDIRECT_URI
  );
  
  return oauth2Client;
};

// Genera l'URL di autenticazione
const generateAuthUrl = (oauth2Client) => {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',  // Necessario per ottenere refresh token
    scope: SCOPES,
    prompt: 'consent'        // Forza il dialogo di consenso per garantire il refresh token
  });
};

module.exports = {
  SCOPES,
  createOAuth2Client,
  generateAuthUrl
};