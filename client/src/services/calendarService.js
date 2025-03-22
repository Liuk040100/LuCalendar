/**
 * Servizio per l'interazione con l'API del calendario
 */

// Processa un comando e lo invia al server
export const processCommand = async (command, accessToken) => {
    if (!command || !command.trim()) {
      throw new Error('Comando mancante');
    }
    
    if (!accessToken) {
      throw new Error('Non autenticato');
    }
    
    try {
      const response = await fetch('/api/process-command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command,
          accessToken,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Errore nell\'elaborazione del comando');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Errore nel processare il comando:', error);
      throw error;
    }
  };
  
  // Formatta un evento per la visualizzazione
  export const formatEvent = (event) => {
    return {
      id: event.id,
      title: event.summary || 'Evento senza titolo',
      description: event.description || '',
      start: event.start.dateTime || event.start.date,
      end: event.end.dateTime || event.end.date,
      link: event.htmlLink,
      attendees: event.attendees ? event.attendees.map(a => a.email) : []
    };
  };