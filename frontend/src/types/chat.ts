import { Mission } from '@/types/workflow';

export enum MessageRole {
    USER = 'user',
    ASSISTANT = 'assistant',
    SYSTEM = 'system',
    TOOL = 'tool',
    STATUS = 'status'
}

// Chat persistence models
export interface Chat {
    id: string;
    user_session_id: string;
    title?: string;
    chat_metadata: Record<string, any>;
    created_at: string;
    updated_at: string;

    // Relationships (populated by services)
    messages: ChatMessage[];
}

export interface ChatMessage {
    id: string;
    chat_id: string;
    role: MessageRole;
    content: string;
    message_metadata: Record<string, any>;
    created_at: string;
    updated_at: string;
}

// Chat API Request/Response types
export interface CreateChatMessageRequest {
    role: MessageRole;
    content: string;
    message_metadata?: Record<string, any>;
}

export interface CreateChatMessageResponse {
    message: ChatMessage;
}

// Lightweight asset reference for chat requests
export type AssetReference = {
    id: string;
    name: string;
    description: string;
    type: string;
    subtype?: string;
    metadata?: Record<string, any>;
}

export interface ChatRequest {
    messages: ChatMessage[];
    payload?: {
        // Additional context data
    };
}

// Legacy response types (may be used elsewhere)
export interface MissionDefinitionResponse {
    response_type: 'MISSION_DEFINITION' | 'INTERVIEW_QUESTION';
    response_content: string;
    mission_proposal?: {
        title: string;
        goal: string;
        success_criteria: string[];
        required_inputs: string[];
        expected_outputs: string[];
        possible_stage_sequence: string[];
    };
    information_gaps?: string[];
    confidence_level?: string;
}

export interface SupervisorResponse {
    response_type: 'FINAL_ANSWER' | 'MISSION_SPECIALIST' | 'WORKFLOW_SPECIALIST';
    response_content: string;
    result_details: any;
}

// Streaming response payload types
export interface MissionPayload {
    mission: Mission;
}

export interface HopPayload {
    hop: any; // Could be more specific if Hop type is available
}

export interface StreamResponsePayload {
    mission?: Mission;
    hop?: any;
    [key: string]: any;
}

// Core streaming response types (matches backend)
export interface AgentResponse {
    token: string | null;
    response_text: string | null;
    payload: StreamResponsePayload | string | null;
    status: string | null;
    error: string | null;
    debug: string | object | null;
}

export interface StatusResponse {
    status: string;
    payload: string | object | null;
    error: string | null;
    debug: string | object | null;
}

// Union type for all possible stream responses
export type StreamResponse = AgentResponse | StatusResponse;