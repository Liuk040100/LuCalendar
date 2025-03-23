/**
 * Utility per la gestione del logging dell'applicazione
 */

const DEBUG = process.env.NODE_ENV !== 'production';

/**
 * Crea un logger con prefisso per un modulo specifico
 * @param {String} module - Nome del modulo
 * @returns {Object} Logger configurato
 */
const createLogger = (module) => {
  const prefix = `[${module}]`;
  
  return {
    /**
     * Log per informazioni di debug (solo in ambiente di sviluppo)
     */
    debug: (...args) => {
      if (DEBUG) console.log(`[DEBUG]${prefix}`, ...args);
    },
    
    /**
     * Log per informazioni generali
     */
    info: (...args) => {
      console.log(`[INFO]${prefix}`, ...args);
    },
    
    /**
     * Log per avvisi
     */
    warn: (...args) => {
      console.warn(`[WARN]${prefix}`, ...args);
    },
    
    /**
     * Log per errori
     */
    error: (...args) => {
      console.error(`[ERROR]${prefix}`, ...args);
    },
    
    /**
     * Log per oggetti con formattazione JSON
     */
    object: (label, obj) => {
      if (DEBUG) {
        console.log(`[DEBUG]${prefix} ${label}:`);
        console.log(JSON.stringify(obj, null, 2));
      }
    }
  };
};

module.exports = {
  createLogger
};