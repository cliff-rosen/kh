// Chat types for AI-guided research stream creation

export interface UserAction {
    type: 'option_selected' | 'options_selected' | 'text_input' | 'skip_step' | 'accept_review';
    target_field?: string;
    selected_value?: string;
    selected_values?: string[];
}

export interface StreamChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    suggestions?: SuggestionChip[];
    options?: CheckboxOption[];
    proposedMessage?: string;
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
    | 'exploration'  // Replaces 'intro' and 'business_focus'
    | 'purpose'
    | 'business_goals'
    | 'expected_outcomes'
    | 'stream_name'
    | 'stream_type'
    | 'focus_areas'
    | 'keywords'
    | 'competitors'
    | 'report_frequency'
    | 'review'
    | 'complete';

export interface PartialStreamConfig {
    // Core Purpose & Context (drives everything else)
    purpose?: string;
    business_goals?: string[];
    expected_outcomes?: string;

    // Stream Identity
    stream_name?: string;
    stream_type?: string;
    description?: string;

    // What to Monitor
    focus_areas?: string[];
    keywords?: string[];
    competitors?: string[];

    // Configuration
    report_frequency?: string;
    scoring_config?: {
        relevance_weight?: number;
        evidence_weight?: number;
        inclusion_threshold?: number;
        max_items_per_report?: number;
    };
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
