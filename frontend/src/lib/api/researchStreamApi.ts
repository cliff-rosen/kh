import { api } from './index';
import { ResearchStream, ReportFrequency, Channel, InformationSource } from '../../types';
import {
    StreamInProgress,
    StreamBuildStep,
    UserAction,
    Suggestion,
    MultiSelectOption
} from '../../types/stream-building';
import { makeStreamRequest } from './streamUtils';
import { CanonicalResearchArticle } from '../../types/canonical_types';
import { FilteredArticle } from '../../types/smartsearch2';

// ============================================================================
// Stream Building Chat API
// ============================================================================

// Simple message format for API requests
export interface ApiMessage {
    role: 'user' | 'assistant';
    content: string;
}

export interface StreamBuildChatRequest {
    message: string;
    current_stream: StreamInProgress;
    current_step: StreamBuildStep;
    conversation_history: ApiMessage[];
    user_action?: UserAction;
}

// ============================================================================
// SSE Streaming Response Types
// ============================================================================

// The parsed payload from a complete LLM response
export interface StreamBuildChatPayload {
    message: string;                      // AI's response text
    mode: 'QUESTION' | 'SUGGESTION' | 'REVIEW';  // Response mode
    target_field: string | null;          // Field being asked about
    next_step: StreamBuildStep;           // Next workflow step
    updated_stream: StreamInProgress;     // Updated stream data
    suggestions?: Suggestion[];           // Suggestion chips (if mode=SUGGESTION)
    options?: MultiSelectOption[];        // Checkboxes (if mode=SUGGESTION)
    proposed_message?: string;            // Button text for options
}

// Status updates during streaming (thinking, tool use, etc.)
export interface StatusResponse {
    status: string;
    payload: string | object | null;
    error: string | null;
    debug: string | object | null;
}

// Token-by-token streaming response from LLM
export interface AgentResponse {
    token: string | null;                 // Individual token
    response_text: string | null;         // Accumulated text
    payload: StreamBuildChatPayload | null;  // Final parsed response
    status: string | null;
    error: string | null;
    debug: string | object | null;
}

// Union type for all possible stream responses
export type StreamResponse = AgentResponse | StatusResponse;

/**
 * Research Stream CRUD API Types
 */

export interface ResearchStreamCreateRequest {
    stream_name: string;
    purpose: string;
    channels: Channel[];
    report_frequency: ReportFrequency;
}

export interface ResearchStreamUpdateRequest {
    stream_name?: string;
    purpose?: string;
    channels?: Channel[];
    report_frequency?: ReportFrequency;
    is_active?: boolean;
}

// ============================================================================
// Implementation Configuration API Types (Workflow 2)
// ============================================================================

export interface QueryGenerationRequest {
    source_id: string;
}

export interface QueryGenerationResponse {
    query_expression: string;
    reasoning: string;
}

export interface QueryTestRequest {
    source_id: string;
    query_expression: string;
    max_results?: number;
}

export interface QueryTestResponse {
    success: boolean;
    article_count: number;
    sample_articles: CanonicalResearchArticle[];
    error_message?: string;
}

export interface SemanticFilterTestRequest {
    articles: CanonicalResearchArticle[];
    filter_criteria: string;
    threshold?: number;
}

export interface SemanticFilterTestResponse {
    filtered_articles: FilteredArticle[];
    pass_count: number;
    fail_count: number;
    average_confidence: number;
}

export interface ImplementationConfigProgressUpdate {
    channel_name: string;
    completed_steps: string[];
    configuration_data: Record<string, any>;
}

export const researchStreamApi = {
    /**
     * Get all research streams for current user
     */
    async getResearchStreams(): Promise<ResearchStream[]> {
        const response = await api.get('/api/research-streams');
        return response.data;
    },

    /**
     * Get a specific research stream by ID
     */
    async getResearchStream(streamId: number): Promise<ResearchStream> {
        const response = await api.get(`/api/research-streams/${streamId}`);
        return response.data;
    },

    /**
     * Create a new research stream
     */
    async createResearchStream(stream: ResearchStreamCreateRequest): Promise<ResearchStream> {
        const response = await api.post('/api/research-streams', stream);
        return response.data;
    },

    /**
     * Update an existing research stream
     */
    async updateResearchStream(streamId: number, updates: ResearchStreamUpdateRequest): Promise<ResearchStream> {
        const response = await api.put(`/api/research-streams/${streamId}`, updates);
        return response.data;
    },

    /**
     * Delete a research stream
     */
    async deleteResearchStream(streamId: number): Promise<void> {
        await api.delete(`/api/research-streams/${streamId}`);
    },

    /**
     * Toggle research stream active status
     */
    async toggleResearchStreamStatus(streamId: number, isActive: boolean): Promise<ResearchStream> {
        const response = await api.patch(`/api/research-streams/${streamId}/status`, { is_active: isActive });
        return response.data;
    },

    /**
     * Get the authoritative list of information sources
     */
    async getInformationSources(): Promise<InformationSource[]> {
        const response = await api.get('/api/research-streams/metadata/sources');
        return response.data;
    },

    /**
     * Stream chat messages for AI-guided research stream creation via SSE
     * @param request - Chat request with message, config, and current step
     * @returns AsyncGenerator that yields StreamResponse objects
     */
    streamChatMessage: async function* (
        request: StreamBuildChatRequest
    ): AsyncGenerator<StreamResponse> {
        try {
            const rawStream = makeStreamRequest('/api/research-streams/chat/stream', request, 'POST');

            for await (const update of rawStream) {
                const lines = update.data.split('\n');
                for (const line of lines) {
                    if (!line.trim()) continue;

                    if (!line.startsWith('data: ')) continue;

                    const jsonStr = line.slice(6);
                    try {
                        const data = JSON.parse(jsonStr);

                        // Check if it's a status response (tool usage, thinking, etc.)
                        if (data.status && !data.token) {
                            yield {
                                status: data.status,
                                payload: data.payload ?? null,
                                error: data.error ?? null,
                                debug: data.debug ?? null
                            } as StatusResponse;
                        } else {
                            // Agent response with tokens or final response
                            yield {
                                token: data.token ?? null,
                                response_text: data.response_text ?? null,
                                payload: data.payload ?? null,
                                status: data.status ?? null,
                                error: data.error ?? null,
                                debug: data.debug ?? null
                            } as AgentResponse;
                        }
                    } catch (e) {
                        // JSON parse error - yield error response
                        yield {
                            token: null,
                            response_text: null,
                            payload: null,
                            status: null,
                            error: `Failed to parse response: ${e instanceof Error ? e.message : String(e)}`,
                            debug: { originalLine: line }
                        } as AgentResponse;
                    }
                }
            }
        } catch (error) {
            // Yield error response if stream fails
            yield {
                token: null,
                response_text: null,
                payload: null,
                status: null,
                error: `Stream error: ${error instanceof Error ? error.message : String(error)}`,
                debug: { streamError: true }
            } as AgentResponse;
        }
    },

    // ========================================================================
    // Implementation Configuration Methods (Workflow 2)
    // ========================================================================

    /**
     * Generate a query expression for a channel based on its keywords and focus
     */
    async generateChannelQuery(
        streamId: number,
        channelName: string,
        request: QueryGenerationRequest
    ): Promise<QueryGenerationResponse> {
        const response = await api.post(
            `/api/research-streams/${streamId}/channels/${encodeURIComponent(channelName)}/generate-query`,
            request
        );
        return response.data;
    },

    /**
     * Test a query expression for a channel against a specific source
     */
    async testChannelQuery(
        streamId: number,
        channelName: string,
        request: QueryTestRequest
    ): Promise<QueryTestResponse> {
        const response = await api.post(
            `/api/research-streams/${streamId}/channels/${encodeURIComponent(channelName)}/test-query`,
            request
        );
        return response.data;
    },

    /**
     * Test a semantic filter for a channel on sample articles
     */
    async testChannelFilter(
        streamId: number,
        channelName: string,
        request: SemanticFilterTestRequest
    ): Promise<SemanticFilterTestResponse> {
        const response = await api.post(
            `/api/research-streams/${streamId}/channels/${encodeURIComponent(channelName)}/test-filter`,
            request
        );
        return response.data;
    },

    /**
     * Update implementation configuration progress for a channel
     */
    async updateImplementationConfig(
        streamId: number,
        update: ImplementationConfigProgressUpdate
    ): Promise<ResearchStream> {
        const response = await api.patch(
            `/api/research-streams/${streamId}/implementation-config`,
            update
        );
        return response.data;
    },

    /**
     * Mark implementation configuration as complete
     */
    async completeImplementationConfig(streamId: number): Promise<ResearchStream> {
        const response = await api.post(
            `/api/research-streams/${streamId}/implementation-config/complete`
        );
        return response.data;
    }
};