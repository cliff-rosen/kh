import axios from 'axios';
import settings from '../../config/settings';

// Callback for session expiration
let sessionExpiredHandler: (() => void) | null = null;

export const setSessionExpiredHandler = (handler: () => void) => {
  sessionExpiredHandler = handler;
};

// Callback for token refresh - receives decoded token payload
export interface TokenPayload {
  sub: string;      // email
  user_id: number;
  org_id: number | null;
  username: string;
  role: string;
  iat: number;
  exp: number;
}

let tokenRefreshedHandler: ((payload: TokenPayload) => void) | null = null;

export const setTokenRefreshedHandler = (handler: (payload: TokenPayload) => void) => {
  tokenRefreshedHandler = handler;
};

/**
 * Decode a JWT token payload (without verification - that's done server-side)
 */
function decodeTokenPayload(token: string): TokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload as TokenPayload;
  } catch {
    return null;
  }
}

export const api = axios.create({
  baseURL: settings.apiUrl,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  },
});

/**
 * Determine the current app context based on URL path.
 */
function getAppContext(): 'pubmed' | 'trialscout' | 'main' {
  if (window.location.pathname.startsWith('/pubmed')) return 'pubmed';
  if (window.location.pathname.startsWith('/trialscout')) return 'trialscout';
  return 'main';
}

/**
 * Get the localStorage key for the auth token in the current app context.
 */
export function getTokenStorageKey(): string {
  const context = getAppContext();
  if (context === 'pubmed') return 'pubmed_token';
  if (context === 'trialscout') return 'trialscout_token';
  return 'authToken';
}

/**
 * Get the localStorage key for user data in the current app context.
 */
export function getUserStorageKey(): string {
  const context = getAppContext();
  if (context === 'pubmed') return 'pubmed_user';
  if (context === 'trialscout') return 'trialscout_user';
  return 'user';
}

/**
 * Get the login path for the current app context.
 */
export function getLoginPath(): string {
  const context = getAppContext();
  if (context === 'pubmed') return '/pubmed/login';
  if (context === 'trialscout') return '/trialscout/login';
  return '/login';
}

/**
 * Get the auth token for the current app context.
 */
export function getAuthToken(): string | null {
  return localStorage.getItem(getTokenStorageKey());
}

/**
 * Store the auth token for the current app context.
 */
export function setAuthToken(token: string): void {
  localStorage.setItem(getTokenStorageKey(), token);
}

/**
 * Get the user data for the current app context.
 */
export function getUserData<T = unknown>(): T | null {
  const data = localStorage.getItem(getUserStorageKey());
  if (!data) return null;
  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

/**
 * Store the user data for the current app context.
 */
export function setUserData<T>(user: T): void {
  localStorage.setItem(getUserStorageKey(), JSON.stringify(user));
}

/**
 * Clear auth data (token and user) for the current app context.
 */
export function clearAuthData(): void {
  localStorage.removeItem(getTokenStorageKey());
  localStorage.removeItem(getUserStorageKey());
}

/**
 * Check if current context is a standalone app (not main app).
 */
export function isStandaloneApp(): boolean {
  return getAppContext() !== 'main';
}

// Keep track of if we're already redirecting to avoid infinite loops
let isRedirectingToLogin = false;

api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    // Check for refreshed token in response header
    const newToken = response.headers['x-new-token'];
    if (newToken) {
      setAuthToken(newToken);
      console.debug('Token refreshed silently');

      // Notify AuthContext of the refreshed token (main app only)
      if (!isStandaloneApp() && tokenRefreshedHandler) {
        const payload = decodeTokenPayload(newToken);
        if (payload) {
          tokenRefreshedHandler(payload);
        }
      }
    }
    return response;
  },
  (error) => {
    console.log('API Error:', error);
    // Check for authentication/authorization errors
    if ((error.response?.status === 401 || error.response?.status === 403) &&
      !error.config.url?.includes('/login') &&
      !isRedirectingToLogin) {

      clearAuthData();
      isRedirectingToLogin = true;

      // Call the session expired handler if it exists (main app only)
      if (!isStandaloneApp() && sessionExpiredHandler) {
        sessionExpiredHandler();
      } else {
        // Default behavior: redirect to appropriate login
        window.location.href = getLoginPath();
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
export * from './researchStreamApi';
export * from './retrievalTestingApi';
export * from './promptTestingApi'; 