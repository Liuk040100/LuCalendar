/**
 * Utility per la formattazione delle date
 */

// Formatta una data in formato leggibile
export const formatDate = (dateString) => {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    
    // Controlla se la data è valida
    if (isNaN(date.getTime())) {
      return '';
    }
    
    return new Intl.DateTimeFormat('it-IT', {
      dateStyle: 'full'
    }).format(date);
  };
  
  // Formatta un orario in formato leggibile
  export const formatTime = (dateString) => {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    
    // Controlla se la data è valida
    if (isNaN(date.getTime())) {
      return '';
    }
    
    return new Intl.DateTimeFormat('it-IT', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };
  
  // Formatta una data e ora in formato leggibile
  export const formatDateTime = (dateString) => {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    
    // Controlla se la data è valida
    if (isNaN(date.getTime())) {
      return '';
    }
    
    return new Intl.DateTimeFormat('it-IT', {
      dateStyle: 'full',
      timeStyle: 'short'
    }).format(date);
  };
  
  // Verifica se una data è oggi
  export const isToday = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };
  
  // Verifica se una data è domani
  export const isTomorrow = (dateString) => {
    const date = new Date(dateString);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    return date.getDate() === tomorrow.getDate() &&
           date.getMonth() === tomorrow.getMonth() &&
           date.getFullYear() === tomorrow.getFullYear();
  };
  
  // Ottiene l'inizio della settimana corrente (lunedì)
  export const getCurrentWeekStart = () => {
    const date = new Date();
    const day = date.getDay(); // 0 = domenica, 1 = lunedì, ...
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    
    const monday = new Date(date.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    
    return monday;
  };
  
  // Ottiene la fine della settimana corrente (domenica)
  export const getCurrentWeekEnd = () => {
    const date = new Date();
    const day = date.getDay(); // 0 = domenica, 1 = lunedì, ...
    const diff = date.getDate() - day + (day === 0 ? 0 : 7);
    
    const sunday = new Date(date.setDate(diff));
    sunday.setHours(23, 59, 59, 999);
    
    return sunday;
  };