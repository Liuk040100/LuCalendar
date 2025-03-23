/**
 * Punto di ingresso principale dell'applicazione LuCalendar
 */

// Carica le variabili d'ambiente
require('dotenv').config();

// Importa dipendenze
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const path = require('path');

// Importa configurazioni
const { appConfig, sessionConfig, corsConfig } = require('./config/app');

// Importa route
const authRoutes = require('./routes/auth');
const calendarRoutes = require('./routes/calendar');

// Importa utility
const { createLogger } = require('./utils/logger');
const logger = createLogger('server');

// Inizializza l'applicazione
const app = express();

// Configura CORS
app.use(cors(corsConfig));

// Middleware per il parsing JSON
app.use(express.json());

// Configura gestione sessioni
app.use(session({
  ...sessionConfig,
  store: new FileStore({
    path: './sessions',
    ttl: 86400, // 24 ore
    retries: 0
  })
}));

// Log delle richieste in ambiente di sviluppo
if (appConfig.isDevelopment) {
  app.use((req, res, next) => {
    logger.debug(`${req.method} ${req.url}`);
    next();
  });
}

// Registra route
app.use('/api/auth', authRoutes);
app.use('/api', calendarRoutes);

// Servi file statici in produzione
if (appConfig.isProduction) {
  // Servi l'app React compilata
  app.use(express.static(path.join(__dirname, '../client/build')));
  
  // Per qualsiasi altra richiesta, restituisci l'app React
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
}

// Gestione errori globale
app.use((err, req, res, next) => {
  logger.error('Errore non gestito:', err);
  res.status(500).json({
    error: 'Errore interno del server',
    message: appConfig.isDevelopment ? err.message : 'Si è verificato un errore'
  });
});

// Avvia il server
app.listen(appConfig.port, () => {
  logger.info(`Server avviato sulla porta ${appConfig.port}`);
  logger.info(`Ambiente: ${appConfig.env}`);
  logger.info(`URL client: ${appConfig.clientUrl}`);
});

// Gestione errori non catturati
process.on('uncaughtException', (err) => {
  logger.error('Eccezione non catturata:', err);
  // In produzione potresti voler terminare il processo
  if (appConfig.isProduction) {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Promise non gestita:', reason);
});