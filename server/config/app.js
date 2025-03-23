/**
 * Configurazione generale dell'applicazione
 */

// Impostazioni di base dell'app
const appConfig = {
    port: process.env.PORT || 3001,
    clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
    env: process.env.NODE_ENV || 'development',
    isProduction: process.env.NODE_ENV === 'production',
    isDevelopment: process.env.NODE_ENV !== 'production'
  };
  
  // Configurazione delle sessioni
  const sessionConfig = {
    secret: process.env.SESSION_SECRET || 'lucalendar-secret-key',
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000, // 24 ore
      sameSite: 'lax'
    },
    resave: false,
    saveUninitialized: false
  };
  
  // Configurazione CORS
  const corsConfig = {
    origin: appConfig.clientUrl,
    credentials: true
  };
  
  // Configurazione limiti richieste API
  const apiLimits = {
    windowMs: 15 * 60 * 1000, // 15 minuti
    max: 100, // limite di 100 richieste per finestra
    standardHeaders: true,
    legacyHeaders: false
  };
  
  module.exports = {
    appConfig,
    sessionConfig,
    corsConfig,
    apiLimits
  };