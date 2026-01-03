import { api } from './index';

// ============================================================================
// Tablizer API Types
// ============================================================================

export interface ProcessCellRequest {
    prompt: string;
    output_type: 'text' | 'number' | 'boolean';
}

export interface ProcessCellResponse {
    value: string | number | boolean;
}

export const tablizerApi = {
    /**
     * Process a single cell with AI using the provided prompt
     */
    async processCell(request: ProcessCellRequest): Promise<ProcessCellResponse> {
        const response = await api.post('/api/tablizer/process-cell', request);
        return response.data;
    }
};
