import { api } from './index';
import { ResearchStream, StreamType, ReportFrequency } from '../../types';

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
    }
};