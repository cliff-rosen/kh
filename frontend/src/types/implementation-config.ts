/**
 * Types for Implementation Configuration Workflow (Workflow 2)
 *
 * This workflow configures query expressions and semantic filters
 * for each channel in a research stream.
 */

import { Channel, InformationSource } from './research-stream';
import { CanonicalResearchArticle } from './canonical_types';
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
    completed_steps: ConfigStep[];
    current_step: ConfigStep;
    is_complete: boolean;
}

// ============================================================================
// Overall Workflow State
// ============================================================================

export interface ImplementationConfigState {
    stream_id: number;
    stream_name: string;
    channels: Channel[];
    available_sources: InformationSource[];

    // Channel configuration states
    channel_configs: Map<string, ChannelConfigState>; // channel_name -> config
    current_channel_index: number; // Which channel we're currently configuring

    // Overall progress
    is_saving: boolean;
    is_complete: boolean;
    error?: string;
}

// ============================================================================
// UI State & Actions
// ============================================================================

export interface ConfigWizardProps {
    streamId: number;
    onComplete: () => void;
    onCancel: () => void;
}

export type ConfigAction =
    | { type: 'LOAD_STREAM'; payload: { stream_name: string; channels: Channel[]; sources: InformationSource[] } }
    | { type: 'SELECT_SOURCES'; payload: { channel_name: string; source_ids: string[] } }
    | { type: 'GENERATE_QUERY_START'; payload: { channel_name: string; source_id: string } }
    | { type: 'GENERATE_QUERY_SUCCESS'; payload: { channel_name: string; source_id: string; query_expression: string; reasoning: string } }
    | { type: 'GENERATE_QUERY_ERROR'; payload: { channel_name: string; source_id: string; error: string } }
    | { type: 'UPDATE_QUERY'; payload: { channel_name: string; source_id: string; query_expression: string } }
    | { type: 'TEST_QUERY_START'; payload: { channel_name: string; source_id: string } }
    | { type: 'TEST_QUERY_SUCCESS'; payload: { channel_name: string; source_id: string; result: any } }
    | { type: 'TEST_QUERY_ERROR'; payload: { channel_name: string; source_id: string; error: string } }
    | { type: 'CONFIRM_QUERY'; payload: { channel_name: string; source_id: string } }
    | { type: 'NEXT_SOURCE'; payload: { channel_name: string } }
    | { type: 'GENERATE_FILTER_SUCCESS'; payload: { channel_name: string; criteria: string; reasoning: string } }
    | { type: 'UPDATE_SEMANTIC_FILTER'; payload: { channel_name: string; filter: Partial<SemanticFilterConfig> } }
    | { type: 'TEST_SEMANTIC_FILTER_START'; payload: { channel_name: string } }
    | { type: 'TEST_SEMANTIC_FILTER_SUCCESS'; payload: { channel_name: string; result: any } }
    | { type: 'TEST_SEMANTIC_FILTER_ERROR'; payload: { channel_name: string; error: string } }
    | { type: 'COMPLETE_CHANNEL'; payload: { channel_name: string } }
    | { type: 'NEXT_CHANNEL' }
    | { type: 'SAVE_PROGRESS_START' }
    | { type: 'SAVE_PROGRESS_SUCCESS' }
    | { type: 'SAVE_PROGRESS_ERROR'; payload: { error: string } }
    | { type: 'COMPLETE_WORKFLOW' };

// ============================================================================
// Helper Functions
// ============================================================================

export function getChannelProgress(channelConfig: ChannelConfigState): number {
    const totalSteps = 7; // source_selection, query gen/test/confirm per source, filter config/test
    const completedSteps = channelConfig.completed_steps.length;
    return Math.round((completedSteps / totalSteps) * 100);
}

export function getOverallProgress(state: ImplementationConfigState): number {
    const totalChannels = state.channels.length;
    if (totalChannels === 0) return 0;

    let completedChannels = 0;
    state.channel_configs.forEach(config => {
        if (config.is_complete) completedChannels++;
    });

    return Math.round((completedChannels / totalChannels) * 100);
}

export function getCurrentChannel(state: ImplementationConfigState): Channel | null {
    if (state.current_channel_index >= state.channels.length) return null;
    return state.channels[state.current_channel_index];
}

export function getCurrentChannelConfig(state: ImplementationConfigState): ChannelConfigState | null {
    const channel = getCurrentChannel(state);
    if (!channel) return null;
    return state.channel_configs.get(channel.name) || null;
}

export function isAllChannelsComplete(state: ImplementationConfigState): boolean {
    if (state.channels.length === 0) return false;

    for (const channel of state.channels) {
        const config = state.channel_configs.get(channel.name);
        if (!config || !config.is_complete) return false;
    }

    return true;
}
