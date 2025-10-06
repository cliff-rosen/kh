import { ScoringConfig, Channel } from './research-stream';

// ============================================================================
// Stream being built (all fields optional as they're filled in progressively)
// ============================================================================

export interface ChannelInProgress {
    name?: string;
    focus?: string;
    type?: string;  // string during building, validated on submission
    keywords?: string[];
}

export interface StreamInProgress {
    stream_name?: string;
    purpose?: string;
    channels?: ChannelInProgress[];
    report_frequency?: string;  // string during building, validated on submission
    scoring_config?: ScoringConfig;
}

// ============================================================================
// Build workflow steps
// ============================================================================

export type StreamBuildStep =
    | 'exploration'
    | 'stream_name'
    | 'purpose'
    | 'channels'       // Collect all channels
    | 'report_frequency'
    | 'review'
    | 'complete';

// ============================================================================
// User actions during building
// ============================================================================

export type UserActionType =
    | 'select_suggestion'    // Clicked a suggestion chip
    | 'confirm_selection'    // Clicked continue with checkboxes
    | 'text_input'          // Typed free text
    | 'skip_step'           // Skipped optional field
    | 'accept_review'       // Accepted final review
    | 'option_selected'     // Single option selected
    | 'options_selected';   // Multiple options selected

export interface UserAction {
    type: UserActionType;
    target_field?: string;      // Which field this affects
    selected_value?: string;    // Single selection
    selected_values?: string[]; // Multiple selections
}

// ============================================================================
// Interactive UI elements presented by AI
// ============================================================================

export interface Suggestion {
    label: string;
    value: string;
}

export interface MultiSelectOption {
    label: string;
    value: string;
    checked: boolean;
}
