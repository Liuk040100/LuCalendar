/**
 * Servizio per l'interazione con l'API Gemini
 * 
 * Nota: questo file è principalmente per documentazione, poiché
 * l'elaborazione Gemini avviene sul server per sicurezza.
 */

// Esempi di prompt di sistema per NLP
export const SYSTEM_PROMPTS = {
    // Prompt per interpretare comandi del calendario
    CALENDAR_COMMAND: `Sei un assistente che aiuta a gestire il calendario Google. 
    Interpreta il comando dell'utente per determinare quale operazione eseguire:
    1. Crea evento
    2. Modifica evento
    3. Visualizza eventi
    4. Elimina evento
    5. Altro (specificare)
    
    Per ogni comando, estrai i dettagli pertinenti come data, ora, titolo, descrizione, partecipanti, ecc.
    Rispondi in formato JSON con i campi "action" e "parameters".`,
  
    // Prompt per analizzare le date in linguaggio naturale
    DATE_PARSER: `Analizza la seguente espressione di data/ora in linguaggio naturale e convertila in un formato ISO.
    Esempi:
    - "domani alle 15" → data ISO di domani alle 15:00
    - "il prossimo lunedì alle 10:30" → data ISO del prossimo lunedì alle 10:30
    - "tra due giorni a mezzogiorno" → data ISO di due giorni dopo alle 12:00
    
    Rispondi SOLO con la data in formato ISO.`
  };
  
  // Esempi di output Gemini interpretati
  export const COMMAND_EXAMPLES = {
    CREATE_EVENT: {
      userCommand: "Crea una riunione con Mario domani alle 15",
      geminiResponse: {
        action: "CREATE_EVENT",
        parameters: {
          title: "Riunione con Mario",
          startDateTime: "2025-03-23T15:00:00+01:00",
          endDateTime: "2025-03-23T16:00:00+01:00",
          description: "",
          attendees: ["mario@example.com"]
        }
      }
    },
    
    VIEW_EVENTS: {
      userCommand: "Mostra tutti gli eventi della prossima settimana",
      geminiResponse: {
        action: "VIEW_EVENTS",
        parameters: {
          startDate: "2025-03-23T00:00:00+01:00",
          endDate: "2025-03-30T23:59:59+01:00",
          maxResults: 20
        }
      }
    }
  };