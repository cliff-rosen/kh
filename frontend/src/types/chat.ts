/**
 * Chat domain types for user-facing chat feature
 *
 * Organized to mirror backend schemas/chat.py for easy cross-reference.
 *
 * This module contains:
 * - Core types: MessageRole, Message, Conversation (matching backend schemas/chat.py)
 * - Interaction types: SuggestedValue, SuggestedAction, etc.
 * - Stream event types for SSE streaming
 * - UI-specific types: ChatMessage (for display)
 */

// ============================================================================
// Core Types (matching backend models)
// ============================================================================

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Conversation {
    id: number;
    user_id?: number;
    title?: string;
    created_at: string;
    updated_at: string;
}


// ============================================================================
// Interaction Types
// ============================================================================

export enum InteractionType {
    TEXT_INPUT = 'text_input',
    VALUE_SELECTED = 'value_selected',
    ACTION_EXECUTED = 'action_executed'
}

export interface SuggestedValue {
    label: string;
    value: string;
}

export interface SuggestedAction {
    label: string;
    action: string;
    handler: 'client' | 'server';
    data?: unknown;
    style?: 'primary' | 'secondary' | 'warning';
}

export interface CustomPayload {
    type: string;
    data: unknown;
}

export interface ToolHistoryEntry {
    tool_name: string;
    input: Record<string, unknown>;
    output: string | Record<string, unknown>;
}

export interface ChatDiagnostics {
    model: string;
    max_tokens: number;
    max_iterations: number;
    temperature: number;
    tools: string[];
    system_prompt: string;
    messages: Record<string, unknown>[];
    context: Record<string, unknown>;
    raw_llm_response?: string;  // Raw text collected from LLM before parsing
}

export interface ActionMetadata {
    action_identifier: string;
    action_data?: unknown;
}


// ============================================================================
// Message Types (depends on interaction types above)
// ============================================================================

export interface MessageExtras {
    tool_history?: ToolHistoryEntry[];
    custom_payload?: CustomPayload;
    diagnostics?: ChatDiagnostics;
    suggested_values?: SuggestedValue[];
    suggested_actions?: SuggestedAction[];
}

export interface Message {
    id: number;
    conversation_id?: number;
    role: MessageRole;
    content: string;
    context?: Record<string, unknown>;
    extras?: MessageExtras;
    created_at: string;
}

export interface ConversationWithMessages extends Conversation {
    messages: Message[];
}


// ============================================================================
// Stream Event Types (discriminated union with explicit 'type' field)
// ============================================================================

export interface TextDeltaEvent {
    type: 'text_delta';
    text: string;
}

export interface StatusEvent {
    type: 'status';
    message: string;
}

export interface ToolStartEvent {
    type: 'tool_start';
    tool: string;
    input: unknown;
    tool_use_id: string;
}

export interface ToolProgressEvent {
    type: 'tool_progress';
    tool: string;
    stage: string;
    message: string;
    progress: number;  // 0.0 to 1.0
    data?: unknown;
}

export interface ToolCompleteEvent {
    type: 'tool_complete';
    tool: string;
    index: number;
}

export interface CompleteEvent {
    type: 'complete';
    payload: ChatResponsePayload;
}

export interface ErrorEvent {
    type: 'error';
    message: string;
}

export interface CancelledEvent {
    type: 'cancelled';
}

export type StreamEvent =
    | TextDeltaEvent
    | StatusEvent
    | ToolStartEvent
    | ToolProgressEvent
    | ToolCompleteEvent
    | CompleteEvent
    | ErrorEvent
    | CancelledEvent;


// ============================================================================
// Response Payload
// ============================================================================

export interface ChatResponsePayload {
    message: string;
    suggested_values?: SuggestedValue[];
    suggested_actions?: SuggestedAction[];
    custom_payload?: CustomPayload;
    tool_history?: ToolHistoryEntry[];
    conversation_id?: number;
    diagnostics?: ChatDiagnostics;
}


// ============================================================================
// UI-Specific Types
// ============================================================================

/**
 * Chat message for UI display (includes interaction elements)
 */
export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    suggested_values?: SuggestedValue[];
    suggested_actions?: SuggestedAction[];
    custom_payload?: CustomPayload;
    tool_history?: ToolHistoryEntry[];
    diagnostics?: ChatDiagnostics;
}

/**
 * Payload handler for custom chat payloads
 */
export interface PayloadHandler {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render: (payload: any, callbacks: { onAccept?: (data: any) => void; onReject?: () => void }) => React.ReactNode;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onAccept?: (payload: any, pageState?: any) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onReject?: (payload: any) => void;
    renderOptions?: {
        panelWidth?: string;
        headerTitle?: string;
        headerIcon?: string;
    };
}


// ============================================================================
// Backwards Compatibility Aliases
// ============================================================================

/** @deprecated Use ChatMessage instead */
export type GeneralChatMessage = ChatMessage;
