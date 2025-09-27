import { api, handleApiError } from './index';
import { CanonicalScholarArticle } from '@/types/canonical_types';

export interface ExtractionRequest {
    items: Record<string, any>[];
    result_schema: Record<string, any>;
    extraction_instructions: string;
    schema_key?: string;
    continue_on_error?: boolean;
}

export interface SingleExtractionRequest {
    item: Record<string, any>;
    result_schema: Record<string, any>;
    extraction_instructions: string;
    schema_key?: string;
}

export interface ExtractionResult {
    item_id: string;
    original_item: Record<string, any>;
    extraction: Record<string, any> | null;
    extraction_timestamp: string;
    error?: string;
    confidence_score?: number;
}

export interface ExtractionResponse {
    results: ExtractionResult[];
    metadata: {
        items_processed: number;
        successful_extractions: number;
        failed_extractions: number;
        schema_key?: string;
    };
    success: boolean;
}

export interface SingleExtractionResponse {
    result: ExtractionResult;
    success: boolean;
}

export interface ScholarFeaturesRequest {
    articles: CanonicalScholarArticle[];
}

export interface ScholarFeaturesResponse {
    results: {
        item_id: string;
        enriched_article: CanonicalScholarArticle;
        extraction_timestamp: string;
    }[];
    metadata: {
        articles_processed: number;
        successful_extractions: number;
        failed_extractions: number;
        schema_type: string;
    };
    success: boolean;
}

export interface ScholarFeaturesSchema {
    schema: Record<string, any>;
    instructions: string;
    description: string;
}

export const extractApi = {
    /**
     * Extract data from multiple items using custom schema and instructions
     */
    async extractMultiple(params: ExtractionRequest): Promise<ExtractionResponse> {
        try {
            const response = await api.post<ExtractionResponse>(
                '/api/extraction/extract-multiple',
                params
            );
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /**
     * Extract data from a single item using custom schema and instructions
     */
    async extractSingle(params: SingleExtractionRequest): Promise<SingleExtractionResponse> {
        try {
            const response = await api.post<SingleExtractionResponse>(
                '/api/extraction/extract-single',
                params
            );
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /**
     * Extract research features from Google Scholar articles using predefined schema
     */
    async extractScholarFeatures(params: ScholarFeaturesRequest): Promise<ScholarFeaturesResponse> {
        try {
            const response = await api.post<ScholarFeaturesResponse>(
                '/api/extraction/scholar-features',
                params
            );
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /**
     * Get the predefined schema for Google Scholar feature extraction
     */
    async getScholarFeaturesSchema(): Promise<ScholarFeaturesSchema> {
        try {
            const response = await api.get<ScholarFeaturesSchema>(
                '/api/extraction/schemas/scholar-features'
            );
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /**
     * Test extraction service connection and functionality
     */
    async testConnection(): Promise<{
        status: 'success' | 'error';
        message: string;
        test_result?: {
            extraction_successful: boolean;
            has_extraction: boolean;
            error?: string;
        };
    }> {
        try {
            const response = await api.get('/api/extraction/test-connection');
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    }
};