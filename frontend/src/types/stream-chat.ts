// Chat types for AI-guided research stream creation

export interface StreamChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    suggestions?: SuggestionChip[];
    options?: CheckboxOption[];
}

export interface SuggestionChip {
    label: string;
    value: string;
}

export interface CheckboxOption {
    label: string;
    value: string;
    checked: boolean;
}

export type StreamCreationStep =
    | 'intro'
    | 'name'
    | 'type'
    | 'focus'
    | 'competitors'
    | 'frequency'
    | 'review'
    | 'complete';

export interface PartialStreamConfig {
    stream_name?: string;
    description?: string;
    stream_type?: string;
    focus_areas?: string[];
    competitors?: string[];
    report_frequency?: string;
}

export interface StreamChatSuggestions {
    therapeutic_areas?: string[];
    companies?: string[];
    stream_types?: string[];
}

export interface StreamCreationChatState {
    messages: StreamChatMessage[];
    currentStep: StreamCreationStep;
    streamConfig: PartialStreamConfig;
    suggestions: StreamChatSuggestions;
}

// API Request/Response types
export interface StreamChatRequest {
    message: string;
    current_config: PartialStreamConfig;
    current_step: StreamCreationStep;
}

export interface StreamChatResponse {
    message: string;
    next_step: StreamCreationStep;
    updated_config: PartialStreamConfig;
    suggestions?: StreamChatSuggestions;
    options?: CheckboxOption[];
}
