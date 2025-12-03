/**
 * API client for Prompt Workbench endpoints
 */

import { api } from './index';

const API_BASE = '/api/prompt-workbench';

export interface PromptTemplate {
    system_prompt: string;
    user_prompt_template: string;
}

export interface SlugInfo {
    slug: string;
    description: string;
}

export interface DefaultPromptsResponse {
    prompts: Record<string, PromptTemplate>;
    available_slugs: Record<string, SlugInfo[]>;
}

export interface EnrichmentConfig {
    prompts: Record<string, PromptTemplate>;
}

export interface EnrichmentConfigResponse {
    enrichment_config: EnrichmentConfig | null;
    is_using_defaults: boolean;
    defaults: Record<string, PromptTemplate>;
}

export interface TestPromptRequest {
    prompt_type: string;
    prompt: PromptTemplate;
    sample_data?: Record<string, any>;
    report_id?: number;
    category_id?: string;
}

export interface TestPromptResponse {
    rendered_system_prompt: string;
    rendered_user_prompt: string;
    llm_response?: string;
    error?: string;
}

export const promptWorkbenchApi = {
    /**
     * Get default prompts and available slugs
     */
    async getDefaults(): Promise<DefaultPromptsResponse> {
        const response = await api.get(`${API_BASE}/defaults`);
        return response.data;
    },

    /**
     * Get enrichment config for a stream
     */
    async getStreamEnrichmentConfig(streamId: number): Promise<EnrichmentConfigResponse> {
        const response = await api.get(`${API_BASE}/streams/${streamId}/enrichment`);
        return response.data;
    },

    /**
     * Update enrichment config for a stream
     */
    async updateStreamEnrichmentConfig(
        streamId: number,
        enrichmentConfig: EnrichmentConfig | null
    ): Promise<void> {
        await api.put(
            `${API_BASE}/streams/${streamId}/enrichment`,
            { enrichment_config: enrichmentConfig }
        );
    },

    /**
     * Test a prompt with sample data or a report
     */
    async testPrompt(request: TestPromptRequest): Promise<TestPromptResponse> {
        const response = await api.post(`${API_BASE}/test`, request);
        return response.data;
    }
};
