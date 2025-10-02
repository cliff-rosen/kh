// Chat types for AI-guided research stream creation

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
    | 'intro'
    | 'business_focus'
    | 'purpose'
    | 'name'
    | 'type'
    | 'focus'
    | 'keywords'
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

    // Phase 1 additions
    purpose?: string;
    business_goals?: string[];
    expected_outcomes?: string;
    keywords?: string[];
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
