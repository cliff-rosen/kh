import { api } from '@/lib/api';

export interface ToolExecutionResponse {
    success: boolean;
    errors: string[];
    outputs: Record<string, any>;  // Maps output parameter names to their values (serialized)
    canonical_outputs?: Record<string, any>;  // Maps output parameter names to their canonical typed values
    metadata?: Record<string, any>;  // Additional metadata about the execution
}

export const toolsApi = {
    /**
     * Get list of available tools
     */
    getTools: async (): Promise<any> => {
        const response = await api.get('/api/tools/available');
        return response.data;
    },

    /**
     * Execute a tool step - just pass the tool step ID
     */
    executeTool: async (toolStepId: string): Promise<ToolExecutionResponse> => {
        const response = await api.post<ToolExecutionResponse>(`/api/tools/step/${toolStepId}/execute`);
        return response.data;
    }
};