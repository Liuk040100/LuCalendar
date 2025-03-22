import React from 'react';
import { 
  Box, 
  Typography, 
  Alert, 
  Link, 
  Divider, 
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemIcon
} from '@mui/material';
import EventIcon from '@mui/icons-material/Event';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';

function ResponseDisplay({ response, error }) {
  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }

  if (!response) {
    return null;
  }

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('it-IT', {
      dateStyle: 'full',
      timeStyle: 'short'
    }).format(date);
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Risultato
      </Typography>
      
      {response.success ? (
        <Box>
          <Alert severity="success" sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <CheckCircleIcon sx={{ mr: 1 }} />
              <Typography variant="body1">{response.message}</Typography>
            </Box>
          </Alert>
          
          {/* Se abbiamo un link all'evento, lo mostriamo */}
          {response.eventLink && (
            <Box sx={{ my: 2 }}>
              <Link href={response.eventLink} target="_blank" rel="noopener">
                Visualizza evento su Google Calendar
              </Link>
            </Box>
          )}
          
          {/* Se abbiamo un elenco di eventi, li mostriamo */}
          {response.events && response.events.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle1" gutterBottom>
                Eventi trovati:
              </Typography>
              
              <List>
                {response.events.map((event) => (
                  <Paper key={event.id} elevation={1} sx={{ mb: 2, p: 2 }}>
                    <ListItem alignItems="flex-start" sx={{ px: 0 }}>
                      <ListItemIcon>
                        <EventIcon color="primary" />
                      </ListItemIcon>
                      <ListItemText
                        primary={event.title}
                        secondary={
                          <React.Fragment>
                            <Typography component="span" variant="body2" color="text.primary">
                              {formatDate(event.start)}
                              {event.end ? ` - ${formatDate(event.end)}` : ''}
                            </Typography>
                            {event.description && (
                              <>
                                <Divider sx={{ my: 1 }} />
                                <Typography variant="body2" color="text.secondary">
                                  {event.description}
                                </Typography>
                              </>
                            )}
                            {event.attendees && event.attendees.length > 0 && (
                              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                Partecipanti: {event.attendees.join(', ')}
                              </Typography>
                            )}
                          </React.Fragment>
                        }
                      />
                    </ListItem>
                    
                    {event.link && (
                      <Box sx={{ ml: 9, mt: 1 }}>
                        <Link href={event.link} target="_blank" rel="noopener" variant="body2">
                          Visualizza su Google Calendar
                        </Link>
                      </Box>
                    )}
                  </Paper>
                ))}
              </List>
            </Box>
          )}
        </Box>
      ) : (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <ErrorIcon sx={{ mr: 1 }} />
            <Typography variant="body1">
              {response.message || 'Non sono riuscito a completare l\'operazione'}
            </Typography>
          </Box>
          {response.details && (
            <Typography variant="body2" sx={{ mt: 1 }}>
              Dettagli: {response.details}
            </Typography>
          )}
        </Alert>
      )}
    </Box>
  );
}

export default ResponseDisplay;