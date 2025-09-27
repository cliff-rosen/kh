/**
 * User Session Type Definitions
 * 
 * This file contains all TypeScript types for managing user sessions
 * for persistence and API operations.
 */

import { Mission } from '@/types/workflow';
import { Chat } from '@/types/chat';

export enum UserSessionStatus {
    ACTIVE = 'active',
    COMPLETED = 'completed',
    ABANDONED = 'abandoned',
    ARCHIVED = 'archived'
}

// Core session entity
export interface UserSession {
    id: string;
    user_id: number;
    name?: string;
    status: UserSessionStatus;
    session_metadata: Record<string, any>;
    created_at: string;
    updated_at: string;
    last_activity_at: string;

    // Relationships (populated by services)
    chat?: Chat;
    mission?: Mission;
}

// API Request/Response types
export interface CreateUserSessionRequest {
    name?: string;
    session_metadata?: Record<string, any>;
}

export interface CreateUserSessionResponse {
    user_session: UserSession;
    chat: Chat;
}

// Backend response format - lightweight response with just IDs
export interface CreateUserSessionBackendResponse {
    id: string;
    user_id: number;
    name?: string;
    chat_id: string;
    mission_id?: string;
    session_metadata: Record<string, any>;
}

export interface UpdateUserSessionRequest {
    name?: string;
    status?: UserSessionStatus;
    session_metadata?: Record<string, any>;
}

export interface ListUserSessionsResponse {
    sessions: UserSession[];
    total: number;
    page: number;
    per_page: number;
}

// Summary model for efficient listing
export interface UserSessionSummary {
    id: string;
    user_id: number;
    name?: string;
    status: UserSessionStatus;
    created_at: string;
    updated_at: string;
    last_activity_at: string;

    // Summary info
    message_count: number;
    has_mission: boolean;
} 