import axios from 'axios';
import settings from '../../config/settings';
import { getCurrentJourneyId } from '../utils/journeyTracking';

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
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Add journey tracking header for SmartSearch2 and Google Scholar endpoints
  // Analytics endpoints don't need this header since they get journey ID from URL parameter
  if (config.url?.includes('/smart-search2/') || config.url?.includes('/google-scholar/')) {
    // Use the context's function that properly syncs state
    const getOrCreateJourneyId = (window as any).__getOrCreateJourneyId || getCurrentJourneyId;
    const journeyId = getOrCreateJourneyId();
    config.headers['X-Journey-Id'] = journeyId;
  } else {
    // For other endpoints, only add header if journey exists (don't create new one)
    const journeyId = localStorage.getItem('currentJourneyId');
    if (journeyId) {
      config.headers['X-Journey-Id'] = journeyId;
    }
  }

  return config;
});

api.interceptors.response.use(
  (response) => {
    // Frontend owns journey ID - do not overwrite from backend
    return response;
  },
  (error) => {
    console.log('API Error:', error);
    // Check for authentication/authorization errors
    if ((error.response?.status === 401 || error.response?.status === 403) &&
      !error.config.url?.includes('/login') &&
      !isRedirectingToLogin) {

      // Clear auth data
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');

      // Set redirecting flag
      isRedirectingToLogin = true;

      // Call the session expired handler if it exists
      if (sessionExpiredHandler) {
        sessionExpiredHandler();
      } else {
        // Default behavior: redirect to login
        window.location.href = '/login';
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
export * from './chatApi';
export * from './emailApi';
export * from './toolsApi';
export * from './missionApi';
export * from './assetApi';
export * from './hopApi';
export * from './sessionApi';
export * from './stateTransitionApi';
export * from './googleScholarApi';
export * from './extractApi';

// Unified workbench API (replaces tabelizer, articleGroup, articleWorkbench APIs)
export * from './workbenchApi'; 