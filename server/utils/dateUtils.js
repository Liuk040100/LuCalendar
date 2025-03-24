/**
 * Utility per la manipolazione delle date
 */

const { createLogger } = require('./logger');
const logger = createLogger('date-utils');

/**
 * Converte una descrizione in linguaggio naturale in un oggetto data
 * @param {String} dateText - Descrizione della data in linguaggio naturale
 * @param {Date} baseDate - Data di riferimento (default: oggi)
 * @returns {Date} Data risultante
 */
const parseDateFromText = (dateText, baseDate = new Date()) => {
  const today = new Date(baseDate);
  today.setHours(0, 0, 0, 0);

  logger.debug('Parsing data da testo:', dateText);
  logger.debug('Data di base:', today.toLocaleDateString());

  // Normalizza il testo della data
  const text = dateText.toLowerCase().trim();
  
  // Gestione date relative
  if (text === 'oggi') {
    logger.debug('Data identificata come oggi');
    return today;
  } else if (text === 'domani') {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    logger.debug('Data identificata come domani:', tomorrow.toLocaleDateString());
    return tomorrow;
  } else if (text === 'dopodomani') {
    const dayAfterTomorrow = new Date(today);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
    logger.debug('Data identificata come dopodomani:', dayAfterTomorrow.toLocaleDateString());
    return dayAfterTomorrow;
  } else if (text.includes('prossimo') || text.includes('prossima')) {
    // Gestione "prossimo lunedì", "prossima settimana", etc.
    return parseNextDay(text, today);
  } else if (text.match(/tra\s+(\d+)\s+(giorn[oi]|settiman[ae])/i)) {
    // Gestione "tra X giorni/settimane"
    return parseInDays(text, today);
  }
  
  // Tentativo di parse diretto per date in formato standard
  const directDate = new Date(dateText);
  if (!isNaN(directDate.getTime())) {
    logger.debug('Data parsata direttamente dal formato standard:', directDate.toLocaleDateString());
    return directDate;
  }
  
  logger.debug('Impossibile parsare la data, ritorno data base:', baseDate.toLocaleDateString());
  // Fallback: restituisci la data base
  return baseDate;
};

/**
 * Analizza date del tipo "prossimo lunedì"
 * @param {String} text - Testo da analizzare
 * @param {Date} baseDate - Data di riferimento
 * @returns {Date} Data risultante
 */
const parseNextDay = (text, baseDate) => {
  const dayMapping = {
    'lunedì': 1, 'lunedi': 1, 
    'martedì': 2, 'martedi': 2,
    'mercoledì': 3, 'mercoledi': 3,
    'giovedì': 4, 'giovedi': 4,
    'venerdì': 5, 'venerdi': 5,
    'sabato': 6, 
    'domenica': 0
  };
  
  logger.debug('Parsing data relativa:', text);
  logger.debug('Data di base:', baseDate.toLocaleDateString());
  
  for (const [day, dayNum] of Object.entries(dayMapping)) {
    if (text.includes(day)) {
      logger.debug('Giorno trovato:', day, 'numero:', dayNum);
      const result = new Date(baseDate);
      const currentDay = result.getDay();
      logger.debug('Giorno attuale:', currentDay);
      
      // Calcola giorni da aggiungere
      let daysToAdd = (dayNum + 7 - currentDay) % 7;
      if (daysToAdd === 0) daysToAdd = 7; // Se siamo già al giorno target, vai alla prossima settimana
      
      logger.debug('Giorni da aggiungere:', daysToAdd);
      result.setDate(result.getDate() + daysToAdd);
      
      logger.debug('Nuova data calcolata:', result.toLocaleDateString(), 'giorno:', result.getDay());
      return result;
    }
  }
  
  // Se include "prossima settimana" ma non specifica il giorno
  if (text.includes('settimana')) {
    const result = new Date(baseDate);
    result.setDate(result.getDate() + 7);
    logger.debug('Data identificata come prossima settimana:', result.toLocaleDateString());
    return result;
  }
  
  logger.debug('Nessun giorno specifico trovato, ritorno data base:', baseDate.toLocaleDateString());
  return baseDate;
};

/**
 * Analizza date del tipo "tra X giorni"
 * @param {String} text - Testo da analizzare
 * @param {Date} baseDate - Data di riferimento
 * @returns {Date} Data risultante
 */
const parseInDays = (text, baseDate) => {
  const match = text.match(/tra\s+(\d+)\s+(giorn[oi]|settiman[ae])/i);
  if (match) {
    const amount = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    
    logger.debug(`Parsing "tra X ${unit}"`, {amount, unit});
    
    const result = new Date(baseDate);
    if (unit.startsWith('giorn')) {
      result.setDate(result.getDate() + amount);
      logger.debug(`Aggiungendo ${amount} giorni a ${baseDate.toLocaleDateString()}, risultato:`, result.toLocaleDateString());
    } else if (unit.startsWith('settiman')) {
      result.setDate(result.getDate() + (amount * 7));
      logger.debug(`Aggiungendo ${amount} settimane a ${baseDate.toLocaleDateString()}, risultato:`, result.toLocaleDateString());
    }
    
    return result;
  }
  
  logger.debug('Pattern "tra X giorni/settimane" non trovato, ritorno data base');
  return baseDate;
};

/**
 * Analizza l'orario da un testo
 * @param {String} timeText - Testo contenente l'orario
 * @param {Date} baseDate - Data di riferimento
 * @returns {Date} Data con l'ora impostata
 */
const parseTimeFromText = (timeText, baseDate = new Date()) => {
  const result = new Date(baseDate);
  logger.debug('Parsing orario da testo:', timeText);
  
  // Formato HH:MM
  const timeMatch = timeText.match(/(\d{1,2})[:\.](\d{2})/);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2]);
    result.setHours(hours, minutes, 0, 0);
    logger.debug(`Orario in formato HH:MM trovato: ${hours}:${minutes}`);
    return result;
  }
  
  // Formato "alle X" o "X am/pm"
  const hourMatch = timeText.match(/\b(\d{1,2})\s*(am|pm|del mattino|del pomeriggio|di sera|di notte)?/i);
  if (hourMatch) {
    let hour = parseInt(hourMatch[1]);
    const period = hourMatch[2]?.toLowerCase() || '';
    
    logger.debug('Formato orario semplice trovato:', {hour, period});
    
    // Converti in formato 24 ore
    if ((period === 'pm' || period.includes('pomeriggio') || period.includes('sera')) && hour < 12) {
      hour += 12;
      logger.debug(`Convertito in formato 24h: ${hour}:00`);
    } else if ((period === 'am' || period.includes('mattino')) && hour === 12) {
      hour = 0;
      logger.debug(`Convertito in formato 24h: ${hour}:00`);
    }
    
    result.setHours(hour, 0, 0, 0);
    return result;
  }
  
  // Gestione orari testuali
  const lowerTimeText = timeText.toLowerCase();
  if (lowerTimeText.includes('mezzogiorno')) {
    result.setHours(12, 0, 0, 0);
    logger.debug('Orario testuale riconosciuto: mezzogiorno (12:00)');
  } else if (lowerTimeText.includes('mezzanotte')) {
    result.setHours(0, 0, 0, 0);
    logger.debug('Orario testuale riconosciuto: mezzanotte (00:00)');
  } else if (lowerTimeText.includes('pranzo')) {
    result.setHours(13, 0, 0, 0);
    logger.debug('Orario testuale riconosciuto: pranzo (13:00)');
  } else if (lowerTimeText.includes('cena')) {
    result.setHours(20, 0, 0, 0);
    logger.debug('Orario testuale riconosciuto: cena (20:00)');
  } else {
    logger.debug('Nessun pattern di orario riconosciuto');
  }
  
  return result;
};

/**
 * Formatta una data in formato leggibile italiano
 * @param {Date|String} date - Data da formattare
 * @returns {String} Data formattata
 */
const formatDate = (date) => {
  if (!date) return '';
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(dateObj.getTime())) {
    logger.debug('Tentativo di formattare una data non valida');
    return '';
  }
  
  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'full'
  }).format(dateObj);
};

/**
 * Formatta un orario in formato leggibile italiano
 * @param {Date|String} date - Data da cui estrarre l'orario
 * @returns {String} Orario formattato
 */
const formatTime = (date) => {
  if (!date) return '';
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(dateObj.getTime())) {
    logger.debug('Tentativo di formattare un orario da una data non valida');
    return '';
  }
  
  return new Intl.DateTimeFormat('it-IT', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(dateObj);
};

/**
 * Formatta una data e ora in formato leggibile italiano
 * @param {Date|String} date - Data da formattare
 * @returns {String} Data e ora formattate
 */
const formatDateTime = (date) => {
  if (!date) return '';
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(dateObj.getTime())) {
    logger.debug('Tentativo di formattare una data/ora non valida');
    return '';
  }
  
  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'full',
    timeStyle: 'short'
  }).format(dateObj);
};

/**
 * Verifica se una data è oggi
 * @param {Date|String} date - Data da verificare
 * @returns {Boolean} True se la data è oggi
 */
const isToday = (date) => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const today = new Date();
  
  const result = dateObj.getDate() === today.getDate() &&
         dateObj.getMonth() === today.getMonth() &&
         dateObj.getFullYear() === today.getFullYear();
         
  logger.debug(`Verifica se ${dateObj.toLocaleDateString()} è oggi:`, result);
  return result;
};

/**
 * Ottiene l'inizio della settimana corrente (lunedì)
 * @returns {Date} Data di inizio settimana
 */
const getCurrentWeekStart = () => {
  const date = new Date();
  const day = date.getDay(); // 0 = domenica, 1 = lunedì, ...
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  
  const monday = new Date(date.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  
  logger.debug('Inizio settimana corrente calcolato:', monday.toLocaleDateString());
  return monday;
};

/**
 * Ottiene la fine della settimana corrente (domenica)
 * @returns {Date} Data di fine settimana
 */
const getCurrentWeekEnd = () => {
  const date = new Date();
  const day = date.getDay(); // 0 = domenica, 1 = lunedì, ...
  const diff = date.getDate() - day + (day === 0 ? 0 : 7);
  
  const sunday = new Date(date.setDate(diff));
  sunday.setHours(23, 59, 59, 999);
  
  logger.debug('Fine settimana corrente calcolata:', sunday.toLocaleDateString());
  return sunday;
};

module.exports = {
  parseDateFromText,
  parseTimeFromText,
  formatDate,
  formatTime,
  formatDateTime,
  isToday,
  getCurrentWeekStart,
  getCurrentWeekEnd
};