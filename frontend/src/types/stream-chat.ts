/**
 * Stream Chat Types
 * Types for AI-guided research stream creation workflow
 */

import { ScoringConfig } from './research-stream';

/**
 * Workflow Step Types
 */

export type StreamCreationStep =
    | 'exploration'
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

/**
 * User Action Types
 */

export interface UserAction {
    type: 'option_selected' | 'options_selected' | 'text_input' | 'skip_step' | 'accept_review';
    target_field?: string;
    selected_value?: string;
    selected_values?: string[];
}

/**
 * Message Types
 */

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

export interface StreamChatMessage extends ChatMessage {
    timestamp: string;
    suggestions?: SuggestionChip[];
    options?: CheckboxOption[];
    proposedMessage?: string;
}

/**
 * UI Component Types
 */

export interface SuggestionChip {
    label: string;
    value: string;
}

export interface CheckboxOption {
    label: string;
    value: string;
    checked: boolean;
}

/**
 * Configuration Types
 */

export interface PartialStreamConfig {
    // Core Purpose & Context
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
    scoring_config?: ScoringConfig;
}
