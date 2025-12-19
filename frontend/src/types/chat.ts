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
    custom_payload?: CustomPayload;
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

// PayloadHandler interface for ChatTray
export interface PayloadHandler {
    render: (payload: any, callbacks: { onAccept?: (data: any) => void; onReject?: () => void }) => React.ReactNode;
    onAccept?: (payload: any, pageState?: any) => void;
    onReject?: (payload: any) => void;
    renderOptions?: {
        panelWidth?: string;
        headerTitle?: string;
        headerIcon?: string;
    };
}


// ============================================================================
// Chat Response Payload (final structured response)
// ============================================================================

export interface ChatResponsePayload {
    message: string;
    suggested_values?: SuggestedValue[];
    suggested_actions?: SuggestedAction[];
    custom_payload?: CustomPayload;
}


// ============================================================================
// Stream Event Types (discriminated union with explicit 'type' field)
// ============================================================================

/** Streaming text token */
export interface TextDeltaEvent {
    type: 'text_delta';
    text: string;
}

/** Status message (thinking, processing, etc.) */
export interface StatusEvent {
    type: 'status';
    message: string;
}

/** Tool execution begins */
export interface ToolStartEvent {
    type: 'tool_start';
    tool: string;
    input: any;
    tool_use_id: string;
}

/** Tool execution progress update */
export interface ToolProgressEvent {
    type: 'tool_progress';
    tool: string;
    stage: string;
    message: string;
    progress: number;  // 0.0 to 1.0
    data?: any;
}

/** Tool execution finished */
export interface ToolCompleteEvent {
    type: 'tool_complete';
    tool: string;
    index: number;  // Index for [[tool:N]] markers
}

/** Final response with payload */
export interface CompleteEvent {
    type: 'complete';
    payload: ChatResponsePayload;
}

/** Error occurred */
export interface ErrorEvent {
    type: 'error';
    message: string;
}

/** Request was cancelled */
export interface CancelledEvent {
    type: 'cancelled';
}

/** Discriminated union of all stream event types */
export type StreamEvent =
    | TextDeltaEvent
    | StatusEvent
    | ToolStartEvent
    | ToolProgressEvent
    | ToolCompleteEvent
    | CompleteEvent
    | ErrorEvent
    | CancelledEvent;
