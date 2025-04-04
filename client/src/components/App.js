import React, { useState, useEffect } from 'react';
import { Container, Box, Typography, CircularProgress, CssBaseline, Paper } from '@mui/material';
import Login from './Login';
import CommandInput from './CommandInput';
import ResponseDisplay from './ResponseDisplay';
import CalendarView from './CalendarView';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessToken, setAccessToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [commandResponse, setCommandResponse] = useState(null);
  const [error, setError] = useState(null);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    // Verifica se l'utente è già autenticato
    const checkAuthStatus = async () => {
      const params = new URLSearchParams(window.location.search);
      const authStatus = params.get('auth');
      
      // Pulisci l'URL per evitare riutilizzi del parametro auth=success
      if (authStatus) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      
      // Controlla se ci sono token salvati in sessionStorage
      const savedToken = sessionStorage.getItem('accessToken');
      
      if (savedToken) {
        setAccessToken(savedToken);
        setIsAuthenticated(true);
        setLoading(false);
      } else if (authStatus === 'success') {
        // Ottieni il token dal server
        try {
          setLoading(true);
          const response = await fetch('/api/auth/token');
          
          if (response.ok) {
            const data = await response.json();
            
            // Verifica che il token sia presente e valido
            if (data.accessToken && data.accessToken !== 'auth-success-token') {
              setAccessToken(data.accessToken);
              setIsAuthenticated(true);
              sessionStorage.setItem('accessToken', data.accessToken);
            } else {
              throw new Error('Token non valido ricevuto dal server');
            }
          } else {
            throw new Error('Impossibile ottenere il token');
          }
        } catch (error) {
          console.error('Errore di autenticazione:', error);
          setIsAuthenticated(false);
          setError('Errore di autenticazione. Riprova.');
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };
    
    checkAuthStatus();
  }, []);

  const handleCommandSubmit = async (command, isVoice = false) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/process-command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command: command,
          accessToken: accessToken,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Errore nell\'elaborazione del comando');
      }
      
      const data = await response.json();
      setCommandResponse(data.result);
      
      // Se il risultato contiene eventi, aggiorniamo la vista del calendario
      if (data.result.events) {
        setEvents(data.result.events);
      }
      
    } catch (err) {
      setError(err.message);
      setCommandResponse(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('accessToken');
    setIsAuthenticated(false);
    setAccessToken(null);
    setCommandResponse(null);
    setEvents([]);
  };

  if (loading && !isAuthenticated) {
    return (
      <Container sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <CssBaseline />
      
      {/* Header */}
      <Box sx={{ backgroundColor: 'primary.main', color: 'white', py: 2, boxShadow: 1 }}>
        <Container maxWidth="lg">
          <Typography variant="h4" component="h1">
            LuCalendar
          </Typography>
          <Typography variant="subtitle1">
            Gestisci il tuo calendario con comandi in linguaggio naturale
          </Typography>
        </Container>
      </Box>
      
      {/* Contenuto principale */}
      <Container component="main" maxWidth="lg" sx={{ flexGrow: 1, py: 4 }}>
        {!isAuthenticated ? (
          <Login />
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {/* Input comandi */}
            <Paper elevation={3} sx={{ p: 3 }}>
              <CommandInput onSubmit={handleCommandSubmit} onLogout={handleLogout} />
            </Paper>
            
            {/* Display risposta */}
            {(commandResponse || error) && (
              <Paper elevation={3} sx={{ p: 3 }}>
                <ResponseDisplay 
                  response={commandResponse} 
                  error={error} 
                />
              </Paper>
            )}
            
            {/* Vista calendario */}
            {events.length > 0 && (
              <Paper elevation={3} sx={{ p: 3 }}>
                <CalendarView events={events} />
              </Paper>
            )}
          </Box>
        )}
      </Container>
      
      {/* Footer */}
      <Box component="footer" sx={{ py: 3, backgroundColor: 'grey.200', mt: 'auto' }}>
        <Container maxWidth="lg">
          <Typography variant="body2" color="text.secondary" align="center">
            LuCalendar © {new Date().getFullYear()}
          </Typography>
        </Container>
      </Box>
    </Box>
  );
}

export default App;