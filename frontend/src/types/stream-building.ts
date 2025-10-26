import { ScoringConfig, Category } from './research-stream';

// ============================================================================
// Stream being built (all fields optional as they're filled in progressively)
// ============================================================================

export interface CategoryInProgress {
    id?: string;  // Unique identifier
    name?: string;
    topics?: string[];
    specific_inclusions?: string[];
}

export interface StreamInProgress {
    stream_name?: string;
    purpose?: string;
    audience?: string[];
    intended_guidance?: string[];
    global_inclusion?: string[];
    global_exclusion?: string[];
    categories?: CategoryInProgress[];
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
    | 'audience'           // Who uses this stream
    | 'intended_guidance'  // What decisions this informs
    | 'global_inclusion'   // Stream-wide inclusion criteria
    | 'global_exclusion'   // Stream-wide exclusion criteria
    | 'categories'         // Collect all categories
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
