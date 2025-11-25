import { api } from './index';
import { CanonicalResearchArticle } from '../../types/canonical_types';

// ============================================================================
// PubMed Query Tester API Types
// ============================================================================

export interface PubMedQueryTestRequest {
    query_expression: string;
    max_results?: number;
    start_date?: string;  // YYYY/MM/DD
    end_date?: string;    // YYYY/MM/DD
    date_type?: string;   // 'entry', 'publication', etc.
    sort_by?: string;     // 'relevance', 'date'
}

export interface PubMedIdCheckRequest {
    query_expression: string;
    pubmed_ids: string[];
    start_date?: string;  // YYYY/MM/DD
    end_date?: string;    // YYYY/MM/DD
    date_type?: string;   // 'entry', 'publication', etc.
}

export interface PubMedIdCheckResult {
    pubmed_id: string;
    captured: boolean;
    article: CanonicalResearchArticle | null;
}

export interface PubMedIdCheckResponse {
    total_ids: number;
    captured_count: number;
    missed_count: number;
    results: PubMedIdCheckResult[];
    query_total_results: number;
}

export const toolsApi = {
    /**
     * Test a PubMed query and return articles
     */
    async testPubMedQuery(request: PubMedQueryTestRequest): Promise<CanonicalResearchArticle[]> {
        const response = await api.post('/api/tools/pubmed/test-query', request);
        return response.data;
    },

    /**
     * Check which PubMed IDs from a list are captured by a query
     */
    async checkPubMedIds(request: PubMedIdCheckRequest): Promise<PubMedIdCheckResponse> {
        const response = await api.post('/api/tools/pubmed/check-ids', request);
        return response.data;
    }
};
