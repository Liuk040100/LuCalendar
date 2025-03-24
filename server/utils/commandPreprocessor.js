/**
 * Preprocessore dei comandi prima dell'invio a Gemini
 */
const dateUtils = require('./dateUtils');
const { createLogger } = require('./logger');

const logger = createLogger('command-preprocessor');

/**
 * Elabora il comando prima dell'invio a Gemini
 * @param {String} command - Comando originale dell'utente
 * @returns {Object} Comando elaborato e metadati
 */
const preprocessCommand = (command) => {
  logger.debug('Preprocessing del comando:', command);
  
  const lowerCommand = command.toLowerCase().trim();
  const metadata = {
    isSpecialCommand: false,
    hasTemporalContext: false,
    hasMultipleActions: false,
    detectedEntities: {}
  };
  
  // Rileva comandi speciali
  if (lowerCommand === 'elimina tutto' || lowerCommand.includes('elimina tutti gli eventi')) {
    metadata.isSpecialCommand = true;
    metadata.specialCommandType = 'DELETE_ALL';
    
    // Intercetta già la risposta
    metadata.directResponse = {
      action: 'DELETE_EVENT',
      parameters: {
        deleteAll: true
      }
    };
    
    // Controlla se c'è una data specifica
    const dateMatch = lowerCommand.match(/per (oggi|domani|questa settimana)/i);
    if (dateMatch) {
      metadata.directResponse.parameters.date = dateMatch[1].toLowerCase();
    }
    
    return { 
      command: command,
      metadata 
    };
  }
  
  // Rileva comandi di modifica temporale
  if (lowerCommand.includes('sposta') || 
      lowerCommand.includes('anticipa') || 
      lowerCommand.includes('posticipa')) {
    
    metadata.hasTemporalContext = true;
    
    // Estrai potenziale orario specifico
    const timeMatch = lowerCommand.match(/alle (\d{1,2})[:\.]?(\d{2})?/i);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1]);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      metadata.detectedEntities.specificTime = `${hours}:${minutes < 10 ? '0' + minutes : minutes}`;
    }
    
    // Estrai modificatori temporali (ore, minuti)
    const hourModMatch = lowerCommand.match(/(\d+)\s*or[ae]/i);
    if (hourModMatch) {
      metadata.detectedEntities.hourModifier = parseInt(hourModMatch[1]);
      metadata.detectedEntities.modifier = 'hour';
    }
    
    const minuteModMatch = lowerCommand.match(/(\d+)\s*minut[oi]/i);
    if (minuteModMatch) {
      metadata.detectedEntities.minuteModifier = parseInt(minuteModMatch[1]);
      metadata.detectedEntities.modifier = 'minute';
    }
  }
  
  // Rileva potenziali comandi multipli
  if (lowerCommand.includes(' e poi ') || 
      lowerCommand.includes(', poi ') || 
      lowerCommand.includes('; ')) {
    
    metadata.hasMultipleActions = true;
    
    // Suddividi in sotto-comandi
    let subCommands = [];
    
    if (lowerCommand.includes(' e poi ')) {
      subCommands = command.split(/\s+e\s+poi\s+/i);
    } else if (lowerCommand.includes(', poi ')) {
      subCommands = command.split(/,\s*poi\s+/i);
    } else if (lowerCommand.includes('; ')) {
      subCommands = command.split(/;\s*/);
    }
    
    metadata.subCommands = subCommands;
  }
  
  // Estrai riferimenti temporali generici
  const dateReferences = extractDateReferences(lowerCommand);
  if (Object.keys(dateReferences).length > 0) {
    metadata.hasTemporalContext = true;
    metadata.detectedEntities = {
      ...metadata.detectedEntities,
      ...dateReferences
    };
  }
  
  return {
    command,
    metadata
  };
};

/**
 * Estrae riferimenti a date dal testo
 * @param {String} text - Testo da analizzare
 * @returns {Object} Riferimenti a date trovati
 */
const extractDateReferences = (text) => {
  const references = {};
  
  // Date specifiche
  if (text.includes('oggi')) {
    references.specificDate = 'oggi';
  } else if (text.includes('domani')) {
    references.specificDate = 'domani';
  } else if (text.includes('dopodomani')) {
    references.specificDate = 'dopodomani';
  }
  
  // Giorni della settimana
  const weekdayMatch = text.match(/\b(lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica)\b/i);
  if (weekdayMatch) {
    references.weekday = weekdayMatch[1].toLowerCase();
  }
  
  // Periodi
  if (text.includes('questa settimana')) {
    references.period = 'current_week';
  } else if (text.includes('prossima settimana')) {
    references.period = 'next_week';
  } else if (text.includes('questo mese')) {
    references.period = 'current_month';
  }
  
  return references;
};

/**
 * Applica arricchimenti al comando in base ai metadati
 * @param {Object} preprocessedCommand - Comando pre-elaborato
 * @returns {String} Comando arricchito per Gemini
 */
const enrichCommand = (preprocessedCommand) => {
  const { command, metadata } = preprocessedCommand;
  
  // Se è un comando speciale con risposta diretta, non serve arricchimento
  if (metadata.isSpecialCommand && metadata.directResponse) {
    return command;
  }
  
  // Base del comando originale
  let enrichedCommand = command;
  
  // Aggiungi contesto temporale se necessario
  if (metadata.hasTemporalContext && metadata.detectedEntities.specificTime) {
    // Assicurati che il riferimento temporale sia chiaro
    if (!enrichedCommand.includes(' alle ')) {
      enrichedCommand += ` alle ${metadata.detectedEntities.specificTime}`;
    }
  }
  
  return enrichedCommand;
};

module.exports = {
  preprocessCommand,
  enrichCommand
};