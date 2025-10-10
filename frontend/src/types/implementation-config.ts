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
// NOTE: We only track current position, not a map per channel
// The workflow is linear - one channel at a time
// ============================================================================

// No ChannelConfigUIState type needed - just use individual state variables:
// - currentChannelIndex: number (which channel we're on)
// - currentStep: ConfigStep (which step in the workflow)
// - currentSourceIndex: number (which source we're configuring)

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

