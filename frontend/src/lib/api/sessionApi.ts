/**
 * Session API Client
 * 
 * This module provides API functions for managing user sessions
 */

import { api } from './index';
import {
    CreateUserSessionRequest,
    CreateUserSessionResponse,
    CreateUserSessionBackendResponse,
    UserSessionStatus
} from '@/types/user_session';

class SessionApiClient {
    /**
     * Initialize a new session on login
     */
    async initializeSession(request: CreateUserSessionRequest): Promise<CreateUserSessionResponse> {
        const response = await api.post('/api/sessions/initialize', request);

        // Backend returns lightweight response with just IDs
        // Convert to expected format for compatibility
        const data: CreateUserSessionBackendResponse = response.data;
        return {
            user_session: {
                id: data.id,
                user_id: data.user_id,
                name: data.name || request.name || 'Session',
                status: UserSessionStatus.ACTIVE,
                session_metadata: data.session_metadata || {},
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                last_activity_at: new Date().toISOString()
                // mission is optional and will be undefined by default
            },
            chat: {
                id: data.chat_id,
                user_session_id: data.id,
                title: data.name || request.name || 'Session',
                chat_metadata: {},
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                messages: []
            }
        };
    }
}

// Export singleton instance
export const sessionApi = new SessionApiClient();

// Export individual functions for backwards compatibility
export const {
    initializeSession
} = sessionApi; 