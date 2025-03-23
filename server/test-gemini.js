/**
 * Script di test per verificare la connessione all'API Gemini
 * 
 * Esecuzione: node test-gemini.js "il tuo comando di test"
 */

require('dotenv').config();
const axios = require('axios');

// Verifica chiave API
if (!process.env.GEMINI_API_KEY) {
  console.error('Errore: GEMINI_API_KEY non configurata nel file .env');
  process.exit(1);
}

// Prompt di sistema
const SYSTEM_PROMPT = `Sei un assistente che aiuta a gestire il calendario Google. 
Interpreta il comando dell'utente e restituisci un JSON.`;

// Comando di test
const testCommand = process.argv[2] || 'Crea un evento domani alle 15';

console.log(`Testando Gemini API con comando: "${testCommand}"`);
console.log('Chiave API configurata:', process.env.GEMINI_API_KEY ? 'Sì' : 'No');

// Funzione di test
async function testGeminiAPI() {
  try {
    console.log('Invio richiesta a Gemini API...');
    
    const response = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      {
        contents: [{
          parts: [
            { text: SYSTEM_PROMPT },
            { text: testCommand }
          ]
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1024,
          topP: 0.8
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY
        }
      }
    );
    
    console.log('Risposta ricevuta con status:', response.status);
    console.log('Struttura risposta:');
    console.log(JSON.stringify(response.data, null, 2));
    
    if (response.data.candidates && 
        response.data.candidates[0] && 
        response.data.candidates[0].content && 
        response.data.candidates[0].content.parts &&
        response.data.candidates[0].content.parts[0]) {
      
      console.log('\nContenuto risposta:');
      console.log(response.data.candidates[0].content.parts[0].text);
    } else {
      console.error('\nStruttura risposta non valida o vuota');
    }
    
  } catch (error) {
    console.error('Errore nella comunicazione con Gemini API:');
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Dettagli:', error.response.data);
    } else if (error.request) {
      console.error('Nessuna risposta ricevuta');
    } else {
      console.error('Errore:', error.message);
    }
  }
}

// Esegui il test
testGeminiAPI();