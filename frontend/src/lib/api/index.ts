import axios from 'axios';
import settings from '../../config/settings';

// Add this to store the handleSessionExpired callback
let sessionExpiredHandler: (() => void) | null = null;

export const setSessionExpiredHandler = (handler: () => void) => {
  sessionExpiredHandler = handler;
};

export const api = axios.create({
  baseURL: settings.apiUrl,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  },
});

// Keep track of if we're already redirecting to avoid infinite loops
let isRedirectingToLogin = false;

api.interceptors.request.use((config) => {
  // Each standalone app has its own token
  const isPubMed = window.location.pathname.startsWith('/pubmed');
  const isTrialScout = window.location.pathname.startsWith('/trialscout');

  let token: string | null = null;
  if (isPubMed) {
    token = localStorage.getItem('pubmed_token');
  } else if (isTrialScout) {
    token = localStorage.getItem('trialscout_token');
  } else {
    token = localStorage.getItem('authToken');
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.log('API Error:', error);
    // Check for authentication/authorization errors
    if ((error.response?.status === 401 || error.response?.status === 403) &&
      !error.config.url?.includes('/login') &&
      !isRedirectingToLogin) {

      const isPubMed = window.location.pathname.startsWith('/pubmed');
      const isTrialScout = window.location.pathname.startsWith('/trialscout');
      const isStandaloneApp = isPubMed || isTrialScout;

      // Clear appropriate auth data
      if (isPubMed) {
        localStorage.removeItem('pubmed_token');
        localStorage.removeItem('pubmed_user');
      } else if (isTrialScout) {
        localStorage.removeItem('trialscout_token');
        localStorage.removeItem('trialscout_user');
      } else {
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
      }

      // Set redirecting flag
      isRedirectingToLogin = true;

      // Call the session expired handler if it exists (main app only)
      if (!isStandaloneApp && sessionExpiredHandler) {
        sessionExpiredHandler();
      } else {
        // Default behavior: redirect to appropriate login
        let loginPath = '/login';
        if (isPubMed) loginPath = '/pubmed/login';
        else if (isTrialScout) loginPath = '/trialscout/login';
        window.location.href = loginPath;
      }

      // Throw a user-friendly error
      throw new Error('Please log in to continue');
    }

    // Reset redirecting flag for other types of errors
    isRedirectingToLogin = false;
    return Promise.reject(error);
  }
);

// Common error handling
export const handleApiError = (error: any): string => {
  console.log('handleApiError:', error);
  console.log('Error response:', error.response);
  if (error.response) {
    // Don't show auth errors since they're handled by the interceptor
    if (error.response.status === 401 || error.response.status === 403) {
      return 'Please log in to continue';
    }
    const data = error.response.data;
    console.log('Error data:', data);

    // Handle validation errors (FastAPI returns array of error objects)
    if (Array.isArray(data.detail)) {
      return data.detail.map((err: any) => err.msg || JSON.stringify(err)).join('; ');
    }

    return data.detail || data.message || 'An error occurred';
  } else if (error.request) {
    return 'No response from server';
  } else {
    return 'Error creating request';
  }
};

// Common date formatting
export const formatTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp);
  return date.toLocaleString();
};

// Export all APIs
export * from './googleScholarApi';
export * from './extractApi';
export * from './researchStreamApi'; 