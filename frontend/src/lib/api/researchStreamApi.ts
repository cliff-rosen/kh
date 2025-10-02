import { api } from './index';
import { ResearchStream, StreamType, ReportFrequency } from '../../types';
import {
    PartialStreamConfig,
    StreamCreationStep,
    StreamChatSuggestions,
    CheckboxOption
} from '../../types/stream-chat';
import { makeStreamRequest } from './streamUtils';
import { StreamResponse, AgentResponse, StatusResponse } from '../../types/chat';

// API Request/Response types (belong in API layer, not in types/)
export interface StreamChatRequest {
    message: string;
    current_config: PartialStreamConfig;
    current_step: StreamCreationStep;
}

export interface StreamChatResponse {
    message: string;
    next_step: StreamCreationStep;
    updated_config: PartialStreamConfig;
    suggestions?: StreamChatSuggestions;
    options?: CheckboxOption[];
}

// Request/Response wrapper types
export interface ResearchStreamCreateRequest {
    stream_name: string;
    description?: string;
    stream_type: StreamType;
    focus_areas: string[];
    competitors: string[];
    report_frequency: ReportFrequency;
}

export interface ResearchStreamUpdateRequest {
    stream_name?: string;
    description?: string;
    stream_type?: StreamType;
    focus_areas?: string[];
    competitors?: string[];
    report_frequency?: ReportFrequency;
    is_active?: boolean;
}

export interface ResearchStreamResponse {
    data: ResearchStream;
    message?: string;
}

export interface ResearchStreamsListResponse {
    data: ResearchStream[];
    message?: string;
    total: number;
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
     * Send a chat message for AI-guided stream creation (non-streaming)
     */
    async sendChatMessage(request: StreamChatRequest): Promise<StreamChatResponse> {
        const response = await api.post('/api/research-streams/chat', request);
        return response.data;
    },

    /**
     * Stream chat messages for AI-guided stream creation
     * @param request - Chat request with message, config, and current step
     * @returns AsyncGenerator that yields StreamResponse objects
     */
    streamChatMessage: async function* (
        request: StreamChatRequest
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
    }
};