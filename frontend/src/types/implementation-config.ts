/**
 * Types for Implementation Configuration Workflow (Workflow 2)
 *
 * This workflow configures query expressions and semantic filters
 * for each channel in a research stream.
 *
 * NOTE: This now works directly with workflow_config.channel_configs
 * instead of maintaining a shadow structure.
 */

import { CanonicalResearchArticle } from './canonical_types';
import { FilteredArticle } from './smartsearch2';

// ============================================================================
// Workflow Steps (UI State Only)
// ============================================================================

export type ConfigStep =
    | 'source_selection'
    | 'query_generation'
    | 'query_testing'
    | 'query_refinement'
    | 'semantic_filter_config'
    | 'semantic_filter_testing'
    | 'channel_complete';

// ============================================================================
// UI State for Configuration Workflow
// ============================================================================

export interface ChannelConfigUIState {
    selected_sources: string[]; // source_ids being configured (UI only)
    current_source_index: number; // Which source we're currently configuring (UI only)
    current_step: ConfigStep; // Current workflow step (UI only)
}

// ============================================================================
// Test Results (Temporary, not persisted to workflow_config)
// ============================================================================

export interface QueryTestResult {
    success: boolean;
    article_count: number;
    sample_articles: CanonicalResearchArticle[];
    error_message?: string;
}

export interface FilterTestResult {
    filtered_articles: FilteredArticle[];
    pass_count: number;
    fail_count: number;
    average_confidence: number;
}

