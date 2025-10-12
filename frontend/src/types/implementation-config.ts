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
    | 'query_definition'  // Combined generation + testing (count only)
    | 'semantic_filter_definition'
    | 'channel_testing'
    | 'channel_complete';

// Sub-states for query_definition step
export type QueryDefinitionSubState =
    | 'awaiting_generation'  // No query yet
    | 'query_generated'      // Query generated, can edit/test
    | 'query_tested'         // Query tested, can confirm

// Sub-states for semantic_filter_definition step
export type FilterDefinitionSubState =
    | 'awaiting_generation'  // No filter yet
    | 'filter_generated'     // Filter generated, can edit

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

export interface ChannelTestResults {
    sourceResults: {
        sourceId: string;
        sourceName: string;
        totalAvailable: number;    // Total available from source
        maxRequested: number;      // Cap we requested (10)
        actualRetrieved: number;   // Actually retrieved (min of available and cap)
        sampleArticles: CanonicalResearchArticle[];
        error?: string;
    }[];
    filterResults: {
        filtered_articles: Array<{
            article: CanonicalResearchArticle;
            confidence: number;
            reasoning: string;
            passed: boolean;
        }>;
        pass_count: number;
        fail_count: number;
        average_confidence: number;
    } | null;
    threshold: number;  // Threshold used for this test
    dateRange?: {       // Date range used (if applicable)
        start: string;
        end: string;
    };
}

// ============================================================================
// Executive Summary
// ============================================================================

export interface ChannelHighlight {
    channel_name: string;
    highlight: string;
}

export interface ExecutiveSummary {
    overview: string;
    key_themes: string[];
    channel_highlights: ChannelHighlight[];
    recommendations: string;
    generated_at: string;
}

