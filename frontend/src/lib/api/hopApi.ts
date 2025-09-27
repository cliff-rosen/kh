import { api } from './index';
import { Hop, HopStatus, ToolStep } from '@/types/workflow';

export interface CreateHopRequest {
    name: string;
    description: string;
    goal?: string;
    success_criteria?: string[];
    input_asset_ids?: string[];
    output_asset_ids?: string[];
    rationale?: string;
    is_final?: boolean;
    metadata?: Record<string, any>;
}

export interface UpdateHopRequest {
    name?: string;
    description?: string;
    goal?: string;
    success_criteria?: string[];
    input_asset_ids?: string[];
    output_asset_ids?: string[];
    rationale?: string;
    is_final?: boolean;
    is_resolved?: boolean;
    status?: HopStatus;
    error_message?: string;
    metadata?: Record<string, any>;
}

export interface CreateToolStepRequest {
    tool_id: string;
    description: string;
    template?: string;
    resource_configs?: Record<string, any>;
    parameter_mapping?: Record<string, any>;
    result_mapping?: Record<string, any>;
    validation_errors?: string[];
}

export interface HopApiResponse {
    message: string;
}

export interface ReorderToolStepsResponse {
    message: string;
    tool_steps: ToolStep[];
}

export interface HopExecutionResponse {
    success: boolean;
    errors: string[];
    message: string;
    executed_steps: number;
    total_steps: number;
    metadata?: Record<string, any>;
}

export const hopApi = {

    /**
     * Create a new hop for a mission
     */
    async createHop(missionId: string, hopRequest: CreateHopRequest): Promise<Hop> {
        const response = await api.post<Hop>(`/api/hops/missions/${missionId}/hops`, hopRequest);
        return response.data;
    },

    /**
     * Get all hops for a mission
     */
    async getMissionHops(missionId: string): Promise<Hop[]> {
        const response = await api.get<Hop[]>(`/api/hops/missions/${missionId}/hops`);
        return response.data;
    },

    /**
     * Get a hop by ID
     */
    async getHop(hopId: string): Promise<Hop> {
        const response = await api.get<Hop>(`/api/hops/${hopId}`);
        return response.data;
    },

    /**
     * Update a hop
     */
    async updateHop(hopId: string, hopRequest: UpdateHopRequest): Promise<Hop> {
        const response = await api.put<Hop>(`/api/hops/${hopId}`, hopRequest);
        return response.data;
    },

    /**
     * Update hop status
     */
    async updateHopStatus(hopId: string, status: HopStatus, errorMessage?: string): Promise<HopApiResponse> {
        const body: any = { status };
        if (errorMessage) {
            body.error_message = errorMessage;
        }

        const response = await api.patch<HopApiResponse>(`/api/hops/${hopId}/status`, body);
        return response.data;
    },

    /**
     * Delete a hop
     */
    async deleteHop(hopId: string): Promise<HopApiResponse> {
        const response = await api.delete<HopApiResponse>(`/api/hops/${hopId}`);
        return response.data;
    },

    /**
     * Create a tool step for a hop
     */
    async createToolStep(hopId: string, toolStepRequest: CreateToolStepRequest): Promise<ToolStep> {
        const response = await api.post<ToolStep>(`/api/hops/${hopId}/tool-steps`, toolStepRequest);
        return response.data;
    },

    /**
     * Get all tool steps for a hop
     */
    async getHopToolSteps(hopId: string): Promise<ToolStep[]> {
        const response = await api.get<ToolStep[]>(`/api/hops/${hopId}/tool-steps`);
        return response.data;
    },

    /**
     * Reorder tool steps within a hop
     */
    async reorderToolSteps(hopId: string, toolStepIds: string[]): Promise<ReorderToolStepsResponse> {
        const response = await api.post<ReorderToolStepsResponse>(`/api/hops/${hopId}/reorder-tool-steps`, toolStepIds);
        return response.data;
    },

    /**
     * Execute a hop - runs all tool steps in sequence
     */
    async executeHop(hopId: string): Promise<HopExecutionResponse> {
        const response = await api.post<HopExecutionResponse>(`/api/hops/${hopId}/execute`);
        return response.data;
    },
}; 