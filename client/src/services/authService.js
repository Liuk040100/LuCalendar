/**
 * Servizio per la gestione dell'autenticazione
 */

// Ottiene l'URL di autenticazione dal server
export const getAuthUrl = async () => {
    try {
      const response = await fetch('/api/auth/url');
      if (!response.ok) {
        throw new Error('Impossibile ottenere l\'URL di autenticazione');
      }
      return await response.json();
    } catch (error) {
      console.error('Errore nel recupero URL auth:', error);
      throw error;
    }
  };
  
  // Controlla lo stato di autenticazione
  export const checkAuthStatus = () => {
    const params = new URLSearchParams(window.location.search);
    const authStatus = params.get('auth');
    const savedToken = sessionStorage.getItem('accessToken');
    
    if (savedToken) {
      return {
        isAuthenticated: true,
        accessToken: savedToken
      };
    } else if (authStatus === 'success') {
      // In produzione, dovresti ottenere il token dal server
      const tempToken = 'auth-success-token';
      sessionStorage.setItem('accessToken', tempToken);
      
      // Pulisci URL
      window.history.replaceState({}, document.title, window.location.pathname);
      
      return {
        isAuthenticated: true,
        accessToken: tempToken
      };
    }
    
    return {
      isAuthenticated: false,
      accessToken: null
    };
  };
  
  // Logout
  export const logout = () => {
    sessionStorage.removeItem('accessToken');
    return {
      isAuthenticated: false,
      accessToken: null
    };
  };