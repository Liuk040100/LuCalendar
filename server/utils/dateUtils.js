/**
 * Utility per la manipolazione delle date
 */

/**
 * Converte una descrizione in linguaggio naturale in un oggetto data
 * @param {String} dateText - Descrizione della data in linguaggio naturale
 * @param {Date} baseDate - Data di riferimento (default: oggi)
 * @returns {Date} Data risultante
 */
const parseDateFromText = (dateText, baseDate = new Date()) => {
    const today = new Date(baseDate);
    today.setHours(0, 0, 0, 0);
  
    // Normalizza il testo della data
    const text = dateText.toLowerCase().trim();
    
    // Gestione date relative
    if (text === 'oggi') {
      return today;
    } else if (text === 'domani') {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    } else if (text === 'dopodomani') {
      const dayAfterTomorrow = new Date(today);
      dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
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
      return directDate;
    }
    
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
    
    for (const [day, dayNum] of Object.entries(dayMapping)) {
      if (text.includes(day)) {
        const result = new Date(baseDate);
        const currentDay = result.getDay();
        const daysToAdd = (dayNum + 7 - currentDay) % 7;
        result.setDate(result.getDate() + (daysToAdd === 0 ? 7 : daysToAdd));
        return result;
      }
    }
    
    // Se include "prossima settimana" ma non specifica il giorno
    if (text.includes('settimana')) {
      const result = new Date(baseDate);
      result.setDate(result.getDate() + 7);
      return result;
    }
    
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
      
      const result = new Date(baseDate);
      if (unit.startsWith('giorn')) {
        result.setDate(result.getDate() + amount);
      } else if (unit.startsWith('settiman')) {
        result.setDate(result.getDate() + (amount * 7));
      }
      
      return result;
    }
    
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
    
    // Formato HH:MM
    const timeMatch = timeText.match(/(\d{1,2})[:\.](\d{2})/);
    if (timeMatch) {
      result.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]), 0, 0);
      return result;
    }
    
    // Formato "alle X" o "X am/pm"
    const hourMatch = timeText.match(/\b(\d{1,2})\s*(am|pm|del mattino|del pomeriggio|di sera|di notte)?/i);
    if (hourMatch) {
      let hour = parseInt(hourMatch[1]);
      const period = hourMatch[2]?.toLowerCase() || '';
      
      // Converti in formato 24 ore
      if ((period === 'pm' || period.includes('pomeriggio') || period.includes('sera')) && hour < 12) {
        hour += 12;
      } else if ((period === 'am' || period.includes('mattino')) && hour === 12) {
        hour = 0;
      }
      
      result.setHours(hour, 0, 0, 0);
      return result;
    }
    
    // Gestione orari testuali
    const lowerTimeText = timeText.toLowerCase();
    if (lowerTimeText.includes('mezzogiorno')) {
      result.setHours(12, 0, 0, 0);
    } else if (lowerTimeText.includes('mezzanotte')) {
      result.setHours(0, 0, 0, 0);
    } else if (lowerTimeText.includes('pranzo')) {
      result.setHours(13, 0, 0, 0);
    } else if (lowerTimeText.includes('cena')) {
      result.setHours(20, 0, 0, 0);
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
    
    return dateObj.getDate() === today.getDate() &&
           dateObj.getMonth() === today.getMonth() &&
           dateObj.getFullYear() === today.getFullYear();
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