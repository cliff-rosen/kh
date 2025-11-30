
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

export interface ChatRequest {
    messages: ChatMessage[];
    payload?: {
        // Additional context data
    };
}

// Core streaming response types (matches backend)
export interface AgentResponse {
    token: string | null;
    response_text: string | null;
    payload: object | string | null;
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

// ============================================================================
// General Purpose Chat System Types
// ============================================================================

export enum InteractionType {
    TEXT_INPUT = 'text_input',
    VALUE_SELECTED = 'value_selected',
    ACTION_EXECUTED = 'action_executed'
}

export interface GeneralChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    suggested_values?: SuggestedValue[];
    suggested_actions?: SuggestedAction[];
    payload?: CustomPayload;
}

export interface SuggestedValue {
    label: string;
    value: string;
}

export interface SuggestedAction {
    label: string;
    action: string;
    handler: 'client' | 'server';
    data?: any;
    style?: 'primary' | 'secondary' | 'warning';
}

export interface CustomPayload {
    type: string;
    data: any;
}

export interface ActionMetadata {
    action_identifier: string;
    action_data?: any;
}

export interface GeneralChatRequest {
    message: string;
    context: Record<string, any>;
    interaction_type: InteractionType;
    action_metadata?: ActionMetadata;
    conversation_history: Array<{
        role: 'user' | 'assistant';
        content: string;
        timestamp: string;
    }>;
}

export interface GeneralChatResponse {
    message: string;
    suggested_values?: SuggestedValue[];
    suggested_actions?: SuggestedAction[];
    payload?: CustomPayload;
}