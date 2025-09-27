import { api } from './index';

export interface LoginCredentials {
    username: string;
    password: string;
}

export interface RegisterCredentials {
    email: string;
    password: string;
}

export interface AuthResponse {
    access_token: string;
    token_type: string;
    username: string;
    role: string;
    user_id?: string;
    email?: string;
    session_id?: string;
    session_name?: string;
    chat_id?: string;
    mission_id?: string;
    session_metadata?: Record<string, any>;
}

export const authApi = {
    /**
     * Login with username/email and password
     */
    async login(credentials: LoginCredentials): Promise<AuthResponse> {
        const params = new URLSearchParams();
        params.append('username', credentials.username);
        params.append('password', credentials.password);

        const response = await api.post('/api/auth/login', params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        return response.data;
    },

    /**
     * Login with one-time token
     */
    async loginWithToken(token: string): Promise<AuthResponse> {
        const params = new URLSearchParams();
        params.append('token', token);

        const response = await api.post('/api/auth/login-with-token', params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        return response.data;
    },

    /**
     * Request a login token to be sent via email
     */
    async requestLoginToken(email: string): Promise<{ message: string }> {
        const params = new URLSearchParams();
        params.append('email', email);

        const response = await api.post('/api/auth/request-login-token', params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        return response.data;
    },

    /**
     * Register a new user and automatically log them in
     */
    async register(credentials: RegisterCredentials): Promise<AuthResponse> {
        const response = await api.post('/api/auth/register', credentials);
        return response.data;
    },

    /**
     * Get current user info
     */
    async getCurrentUser(): Promise<any> {
        const response = await api.get('/api/auth/me');
        return response.data;
    },

    /**
     * Get active session
     */
    async getActiveSession(): Promise<any> {
        const response = await api.get('/api/sessions/active');
        return response.data;
    },

    /**
     * Update session mission
     */
    async updateSessionMission(sessionId: string, missionId: string): Promise<any> {
        const response = await api.put(`/api/sessions/${sessionId}`, {
            mission_id: missionId
        });
        return response.data;
    },

    /**
     * Update session metadata
     */
    async updateSessionMetadata(sessionId: string, metadata: Record<string, any>): Promise<any> {
        const response = await api.put(`/api/sessions/${sessionId}`, {
            session_metadata: metadata
        });
        return response.data;
    }
};