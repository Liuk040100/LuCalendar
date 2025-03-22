# LuCalendar

LuCalendar è un'applicazione web che consente di gestire il calendario Google tramite comandi in linguaggio naturale. Gli utenti possono creare, modificare, visualizzare ed eliminare eventi attraverso un'interfaccia conversazionale, sia testuale che vocale.

## Funzionalità

- Autenticazione con account Google via OAuth 2.0
- Interfaccia per inserimento comandi in linguaggio naturale
- Supporto per comandi vocali (browser compatibili)
- Creazione, modifica, visualizzazione ed eliminazione di eventi
- Visualizzazione degli eventi in formato tabellare

## Tecnologie utilizzate

- **Frontend**: React, Material-UI
- **Backend**: Node.js, Express
- **NLP**: Gemini 2.0 Flash API
- **Gestione eventi**: Google Calendar API
- **Autenticazione**: OAuth 2.0

## Prerequisiti

- Node.js e npm
- Account Google Cloud Platform
- Chiavi API per Gemini e Google Calendar

## Configurazione

### Google Cloud Platform

1. Crea un nuovo progetto su [Google Cloud Console](https://console.cloud.google.com/)
2. Abilita Google Calendar API
3. Configura credenziali OAuth 2.0
4. Aggiungi l'URL di redirezione: `http://localhost:3001/api/auth/callback`

### API Gemini

Ottieni una chiave API Gemini da [Google AI Studio](https://ai.google.dev/)

### Installazione

```bash
# Clona il repository
git clone https://github.com/Liuk040100/LuCalendar.git
cd LuCalendar

# Installa le dipendenze del server
cd server
npm install

# Configura il file .env
cp .env.example .env
# Modifica il file .env con le tue credenziali

# Installa le dipendenze del client
cd ../client
npm install
```

## Esecuzione

```bash
# Avvia il server (dalla cartella server)
npm start

# Avvia il client (dalla cartella client in un altro terminale)
npm start
```

L'applicazione sarà disponibile all'indirizzo `http://localhost:3000`

## Comandi di esempio

- "Crea una riunione con Mario lunedì alle 15"
- "Mostra tutti gli eventi della prossima settimana"
- "Sposta la riunione di domani alle 16"
- "Elimina l'appuntamento con il dentista"

## Licenza

MIT