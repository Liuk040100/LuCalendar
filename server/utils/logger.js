/**
 * Utility avanzata per la gestione del logging dell'applicazione
 */

const DEBUG = process.env.NODE_ENV !== 'production';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info'; // debug, info, warn, error

// Mapping livelli di log
const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

/**
 * Crea un logger con prefisso per un modulo specifico
 * @param {String} module - Nome del modulo
 * @returns {Object} Logger configurato
 */
const createLogger = (module) => {
  const prefix = `[${module}]`;
  const currentLevel = LOG_LEVELS[LOG_LEVEL] || 1;
  
  return {
    /**
     * Log per informazioni di debug (solo in ambiente di sviluppo)
     */
    debug: (...args) => {
      if (DEBUG && currentLevel <= LOG_LEVELS.debug) {
        const timestamp = new Date().toISOString();
        console.log(`${timestamp} [DEBUG]${prefix}`, ...args);
      }
    },
    
    /**
     * Log per informazioni generali
     */
    info: (...args) => {
      if (currentLevel <= LOG_LEVELS.info) {
        const timestamp = new Date().toISOString();
        console.log(`${timestamp} [INFO]${prefix}`, ...args);
      }
    },
    
    /**
     * Log per avvisi
     */
    warn: (...args) => {
      if (currentLevel <= LOG_LEVELS.warn) {
        const timestamp = new Date().toISOString();
        console.warn(`${timestamp} [WARN]${prefix}`, ...args);
      }
    },
    
    /**
     * Log per errori
     */
    error: (...args) => {
      if (currentLevel <= LOG_LEVELS.error) {
        const timestamp = new Date().toISOString();
        console.error(`${timestamp} [ERROR]${prefix}`, ...args);
      }
    },
    
    /**
     * Log per oggetti con formattazione JSON
     */
    object: (label, obj) => {
      if (DEBUG && currentLevel <= LOG_LEVELS.debug) {
        const timestamp = new Date().toISOString();
        console.log(`${timestamp} [DEBUG]${prefix} ${label}:`);
        console.log(JSON.stringify(obj, null, 2));
      }
    },
    
    /**
     * Log per tracciamento di input/output/pipeline
     */
    trace: (stage, input, output) => {
      if (DEBUG && currentLevel <= LOG_LEVELS.debug) {
        const timestamp = new Date().toISOString();
        console.log(`${timestamp} [TRACE]${prefix} === STAGE: ${stage} ===`);
        if (input !== undefined) {
          console.log(`INPUT:`, typeof input === 'object' ? JSON.stringify(input, null, 2) : input);
        }
        if (output !== undefined) {
          console.log(`OUTPUT:`, typeof output === 'object' ? JSON.stringify(output, null, 2) : output);
        }
        console.log(`${timestamp} [TRACE]${prefix} === END STAGE: ${stage} ===`);
      }
    }
  };
};

module.exports = {
  createLogger
};