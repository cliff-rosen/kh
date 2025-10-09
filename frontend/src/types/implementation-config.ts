/**
 * Types for Implementation Configuration Workflow (Workflow 2)
 *
 * This workflow configures query expressions and semantic filters
 * for each channel in a research stream.
 */

import { Channel } from './research-stream';
import { FilteredArticle } from './smartsearch2';

// ============================================================================
// Workflow Steps
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
// Source Configuration State
// ============================================================================

export interface SourceQueryConfig {
    source_id: string;
    source_name: string;
    query_expression: string;
    query_reasoning?: string;
    is_tested: boolean;
    test_result?: {
        success: boolean;
        article_count: number;
        sample_articles: CanonicalResearchArticle[];
        error_message?: string;
    };
    is_confirmed: boolean; // User confirmed this query is good
}

// ============================================================================
// Semantic Filter Configuration State
// ============================================================================

export interface SemanticFilterConfig {
    enabled: boolean;
    criteria: string;
    reasoning?: string; // Explanation of why this criteria was generated
    threshold: number; // 0.0 to 1.0
    is_tested: boolean;
    test_result?: {
        filtered_articles: FilteredArticle[];
        pass_count: number;
        fail_count: number;
        average_confidence: number;
    };
}

// ============================================================================
// Channel Configuration State
// ============================================================================

export interface ChannelConfigState {
    channel: Channel;
    selected_sources: string[]; // source_ids
    source_configs: Map<string, SourceQueryConfig>; // source_id -> config
    current_source_index: number; // Which source we're currently configuring
    semantic_filter?: SemanticFilterConfig;
    current_step: ConfigStep;
    is_complete: boolean;
}

