import React, { useState, useEffect } from 'react';
import { 
  TextField, 
  Button, 
  Box, 
  IconButton, 
  Typography,
  Tooltip,
  CircularProgress
} from '@mui/material';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import SendIcon from '@mui/icons-material/Send';
import LogoutIcon from '@mui/icons-material/Logout';

function CommandInput({ onSubmit, onLogout }) {
  const [command, setCommand] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [recognition, setRecognition] = useState(null);

  // Verifica il supporto del riconoscimento vocale
  useEffect(() => {
    const checkSpeechSupport = () => {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        setSpeechSupported(true);
        const recognitionInstance = new SpeechRecognition();
        recognitionInstance.continuous = false;
        recognitionInstance.interimResults = false;
        recognitionInstance.lang = 'it-IT';

        recognitionInstance.onresult = (event) => {
          const transcript = event.results[0][0].transcript;
          setCommand(transcript);
          setIsListening(false);
        };

        recognitionInstance.onerror = (event) => {
          console.error('Errore nel riconoscimento vocale:', event.error);
          setIsListening(false);
        };

        recognitionInstance.onend = () => {
          setIsListening(false);
        };

        setRecognition(recognitionInstance);
      }
    };

    checkSpeechSupport();
  }, []);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    
    if (!command.trim()) return;
    
    setIsSending(true);
    await onSubmit(command);
    setCommand('');
    setIsSending(false);
  };

  const toggleListening = () => {
    if (isListening) {
      recognition.stop();
    } else {
      recognition.start();
      setIsListening(true);
    }
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Cosa vuoi fare con il tuo calendario?
      </Typography>
      
      <form onSubmit={handleSubmit}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <TextField
            fullWidth
            multiline
            rows={2}
            variant="outlined"
            placeholder="Es. Crea una riunione con Mario domani alle 15"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            disabled={isSending}
          />
          
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Button
              variant="contained"
              color="primary"
              endIcon={<SendIcon />}
              onClick={handleSubmit}
              disabled={isSending || !command.trim()}
              type="submit"
            >
              {isSending ? <CircularProgress size={24} /> : 'Invia'}
            </Button>
            
            {speechSupported && (
              <Tooltip title={isListening ? "Interrompi ascolto" : "Parla"}>
                <IconButton 
                  color={isListening ? "error" : "primary"}
                  onClick={toggleListening}
                  disabled={isSending}
                >
                  {isListening ? <MicOffIcon /> : <MicIcon />}
                </IconButton>
              </Tooltip>
            )}
            
            <Tooltip title="Logout">
              <IconButton 
                color="default"
                onClick={onLogout}
                disabled={isSending}
              >
                <LogoutIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </form>
      
      <Box sx={{ mt: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Esempi di comandi:
        </Typography>
        <Typography variant="body2" color="text.secondary">
          • "Crea una riunione con Mario lunedì alle 15"
        </Typography>
        <Typography variant="body2" color="text.secondary">
          • "Mostra tutti gli eventi della prossima settimana"
        </Typography>
        <Typography variant="body2" color="text.secondary">
          • "Sposta la riunione di domani alle 16"
        </Typography>
      </Box>
    </Box>
  );
}

export default CommandInput;