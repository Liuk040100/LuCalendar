import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow,
  Tab,
  Tabs
} from '@mui/material';
import EventIcon from '@mui/icons-material/Event';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import GroupIcon from '@mui/icons-material/Group';
import SubjectIcon from '@mui/icons-material/Subject';

function CalendarView({ events }) {
  const [groupedEvents, setGroupedEvents] = useState({});
  const [selectedTab, setSelectedTab] = useState(0);
  const [tabLabels, setTabLabels] = useState([]);

  useEffect(() => {
    if (!events || events.length === 0) return;

    // Raggruppa eventi per data
    const grouped = events.reduce((acc, event) => {
      const date = new Date(event.start);
      const dateKey = date.toISOString().split('T')[0];
      
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      
      acc[dateKey].push(event);
      return acc;
    }, {});

    // Ordina le chiavi per data
    const sortedKeys = Object.keys(grouped).sort();
    
    // Crea etichette per le tab
    const labels = sortedKeys.map(key => {
      const date = new Date(key);
      return new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }).format(date);
    });

    setGroupedEvents(grouped);
    setTabLabels(labels);
    setSelectedTab(0);
  }, [events]);

  const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('it-IT', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const handleTabChange = (event, newValue) => {
    setSelectedTab(newValue);
  };

  // Se non ci sono eventi raggruppati, non mostriamo nulla
  if (Object.keys(groupedEvents).length === 0) {
    return null;
  }

  // Ottieni la data corrente per la tab selezionata
  const currentDateKey = Object.keys(groupedEvents).sort()[selectedTab];
  const currentEvents = groupedEvents[currentDateKey] || [];

  return (
    <Box>
      <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
        <EventIcon sx={{ mr: 1 }} />
        Eventi nel calendario
      </Typography>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs 
          value={selectedTab} 
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
        >
          {tabLabels.map((label, index) => (
            <Tab key={index} label={label} />
          ))}
        </Tabs>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Orario</TableCell>
              <TableCell>Titolo</TableCell>
              <TableCell>Descrizione</TableCell>
              <TableCell>Partecipanti</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {currentEvents.length > 0 ? (
              currentEvents.map((event) => (
                <TableRow key={event.id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <AccessTimeIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />
                      {formatTime(event.start)} - {formatTime(event.end)}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body1">{event.title}</Typography>
                  </TableCell>
                  <TableCell>
                    {event.description ? (
                      <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                        <SubjectIcon fontSize="small" sx={{ mr: 1, mt: 0.3, color: 'text.secondary' }} />
                        <Typography variant="body2" sx={{ maxWidth: 200, maxHeight: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {event.description}
                        </Typography>
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.disabled">Nessuna descrizione</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {event.attendees && event.attendees.length > 0 ? (
                      <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                        <GroupIcon fontSize="small" sx={{ mr: 1, mt: 0.3, color: 'text.secondary' }} />
                        <Typography variant="body2">
                          {event.attendees.length} partecipant{event.attendees.length === 1 ? 'e' : 'i'}
                        </Typography>
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.disabled">Nessun partecipante</Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} align="center">
                  <Typography variant="body1" color="text.secondary">
                    Nessun evento in questa data
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

export default CalendarView;