import React, { useState, useEffect } from 'react';
import { Box, Button, Typography, Paper } from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';

function Login() {
  const [authUrl, setAuthUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAuthUrl = async () => {
      try {
        const response = await fetch('/api/auth/url');
        if (!response.ok) {
          throw new Error('Impossibile ottenere l\'URL di autenticazione');
        }
        const data = await response.json();
        setAuthUrl(data.url);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchAuthUrl();
  }, []);

  return (
    <Box sx={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '80vh'
    }}>
      <Paper 
        elevation={6} 
        sx={{ 
          p: 4, 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center',
          maxWidth: 500,
          width: '100%'
        }}
      >
        <CalendarMonthIcon sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
        
        <Typography variant="h5" component="h2" sx={{ mb: 3, textAlign: 'center' }}>
          Benvenuto in LuCalendar
        </Typography>
        
        <Typography variant="body1" sx={{ mb: 4, textAlign: 'center' }}>
          Accedi con il tuo account Google per gestire il tuo calendario tramite comandi in linguaggio naturale.
        </Typography>
        
        {loading ? (
          <Typography>Caricamento...</Typography>
        ) : error ? (
          <Typography color="error">{error}</Typography>
        ) : (
          <Button 
            variant="contained" 
            color="primary" 
            size="large"
            href={authUrl}
            startIcon={<CalendarMonthIcon />}
            sx={{ py: 1.5, px: 4 }}
          >
            Accedi con Google
          </Button>
        )}
        
        <Box sx={{ mt: 4 }}>
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
            LuCalendar richiede l'accesso al tuo calendario Google per funzionare.
            Non memorizziamo le tue credenziali.
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}

export default Login;