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

export interface StageModelConfig {
    model: string;
    temperature?: number;
    reasoning_effort?: 'low' | 'medium' | 'high';
}

export interface TestSummaryPromptRequest {
    prompt_type: string;
    prompt: PromptTemplate;
    sample_data?: Record<string, any>;
    report_id?: number;
    category_id?: string;
    article_index?: number;
    llm_config?: StageModelConfig;
}

export interface TestSummaryPromptResponse {
    rendered_system_prompt: string;
    rendered_user_prompt: string;
    llm_response?: string;
    error?: string;
}

// Categorization prompt types
export interface CategorizationDefaultsResponse {
    prompt: PromptTemplate;
    available_slugs: SlugInfo[];
}

export interface CategorizationConfigResponse {
    categorization_prompt: PromptTemplate | null;
    is_using_defaults: boolean;
    defaults: PromptTemplate;
}

export interface TestCategorizationPromptRequest {
    prompt: PromptTemplate;
    sample_data?: Record<string, any>;
    report_id?: number;
    article_index?: number;
}

export interface TestCategorizationPromptResponse {
    rendered_system_prompt: string;
    rendered_user_prompt: string;
    llm_response?: string;
    parsed_category_id?: string;
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
     * Test a summary prompt (executive, category, or article) with sample data or a report
     */
    async testSummaryPrompt(request: TestSummaryPromptRequest): Promise<TestSummaryPromptResponse> {
        const response = await api.post(`${API_BASE}/test-summary`, request);
        return response.data;
    },

    // =========================================================================
    // Categorization Prompts
    // =========================================================================

    /**
     * Get default categorization prompt and available slugs
     */
    async getCategorizationDefaults(): Promise<CategorizationDefaultsResponse> {
        const response = await api.get(`${API_BASE}/categorization/defaults`);
        return response.data;
    },

    /**
     * Get categorization prompt for a stream
     */
    async getStreamCategorizationConfig(streamId: number): Promise<CategorizationConfigResponse> {
        const response = await api.get(`${API_BASE}/streams/${streamId}/categorization`);
        return response.data;
    },

    /**
     * Update categorization prompt for a stream
     */
    async updateStreamCategorizationConfig(
        streamId: number,
        categorizationPrompt: PromptTemplate | null
    ): Promise<void> {
        await api.put(
            `${API_BASE}/streams/${streamId}/categorization`,
            { categorization_prompt: categorizationPrompt }
        );
    },

    /**
     * Test a categorization prompt with sample data or report article
     */
    async testCategorizationPrompt(
        request: TestCategorizationPromptRequest
    ): Promise<TestCategorizationPromptResponse> {
        const response = await api.post(`${API_BASE}/categorization/test`, request);
        return response.data;
    }
};
