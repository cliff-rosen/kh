import { api } from './index';
import { CanonicalResearchArticle, CanonicalClinicalTrial } from '../../types/canonical_types';

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

export interface PubMedQueryTestResponse {
    articles: CanonicalResearchArticle[];
    total_results: number;
    returned_count: number;
}

export interface PubMedIdCheckRequest {
    query_expression: string;
    pubmed_ids: string[];
    start_date?: string;  // YYYY/MM/DD
    end_date?: string;    // YYYY/MM/DD
    date_type?: string;   // 'publication' (DP - default, matches reports), 'entry' (EDAT), 'pubmed' (PDAT), 'completion' (DCOM)
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

export interface PubMedSearchParams {
    query: string;
    startDate?: string;  // YYYY-MM-DD
    endDate?: string;    // YYYY-MM-DD
    dateType?: 'publication' | 'entry';
    maxResults?: number;
}

// ============================================================================
// Optimized PubMed Search (returns PMIDs for comparison + articles for display)
// ============================================================================

export interface PubMedOptimizedSearchRequest {
    query_expression: string;
    max_pmids?: number;        // Maximum PMIDs to retrieve for comparison (default 500)
    articles_to_fetch?: number; // Number of articles with full data (default 20)
    start_date?: string;       // YYYY/MM/DD
    end_date?: string;         // YYYY/MM/DD
    date_type?: string;        // 'publication', 'entry', etc.
    sort_by?: string;          // 'relevance', 'date'
}

export interface PubMedOptimizedSearchResponse {
    all_pmids: string[];       // All PMIDs matching query (up to max_pmids)
    articles: CanonicalResearchArticle[];  // Full article data for first N
    total_results: number;     // Total number of results matching the query
    pmids_retrieved: number;   // Number of PMIDs retrieved
    articles_retrieved: number; // Number of articles with full data
}

export const toolsApi = {
    /**
     * Test a PubMed query and return articles with total count
     */
    async testPubMedQuery(request: PubMedQueryTestRequest): Promise<PubMedQueryTestResponse> {
        const response = await api.post('/api/tools/pubmed/test-query', request);
        return response.data;
    },

    /**
     * Check which PubMed IDs from a list are captured by a query
     */
    async checkPubMedIds(request: PubMedIdCheckRequest): Promise<PubMedIdCheckResponse> {
        const response = await api.post('/api/tools/pubmed/check-ids', request);
        return response.data;
    },

    /**
     * Search PubMed with a simplified interface (for Tablizer)
     */
    async searchPubMed(params: PubMedSearchParams): Promise<PubMedQueryTestResponse> {
        // Convert YYYY-MM-DD to YYYY/MM/DD for the API
        const formatDate = (date?: string) => date ? date.replace(/-/g, '/') : undefined;

        const request: PubMedQueryTestRequest = {
            query_expression: params.query,
            start_date: formatDate(params.startDate),
            end_date: formatDate(params.endDate),
            date_type: params.dateType,
            max_results: params.maxResults || 100
        };

        return this.testPubMedQuery(request);
    },

    /**
     * Optimized PubMed search that returns:
     * - Up to max_pmids PMIDs for comparison (fast)
     * - Full article data for first articles_to_fetch articles (for display)
     */
    async optimizedSearch(params: {
        query: string;
        startDate?: string;    // YYYY-MM-DD
        endDate?: string;      // YYYY-MM-DD
        dateType?: 'publication' | 'entry';
        maxPmids?: number;     // Default 500
        articlesToFetch?: number; // Default 20
        sortBy?: 'relevance' | 'date';
    }): Promise<PubMedOptimizedSearchResponse> {
        // Convert YYYY-MM-DD to YYYY/MM/DD for the API
        const formatDate = (date?: string) => date ? date.replace(/-/g, '/') : undefined;

        const request: PubMedOptimizedSearchRequest = {
            query_expression: params.query,
            start_date: formatDate(params.startDate),
            end_date: formatDate(params.endDate),
            date_type: params.dateType,
            max_pmids: params.maxPmids || 500,
            articles_to_fetch: params.articlesToFetch || 20,
            sort_by: params.sortBy || 'relevance'
        };

        const response = await api.post('/api/tools/pubmed/search', request);
        return response.data;
    },

    // ========================================================================
    // Clinical Trials API
    // ========================================================================

    /**
     * Search ClinicalTrials.gov for clinical trials
     */
    async searchTrials(params: {
        condition?: string;
        intervention?: string;
        sponsor?: string;
        status?: string[];
        phase?: string[];
        studyType?: string;
        location?: string;
        startDate?: string;    // YYYY-MM-DD
        endDate?: string;      // YYYY-MM-DD
        maxResults?: number;
    }): Promise<TrialSearchResponse> {
        const request: TrialSearchRequest = {
            condition: params.condition,
            intervention: params.intervention,
            sponsor: params.sponsor,
            status: params.status,
            phase: params.phase,
            study_type: params.studyType,
            location: params.location,
            start_date: params.startDate,
            end_date: params.endDate,
            max_results: params.maxResults || 100
        };

        const response = await api.post('/api/tools/trials/search', request);
        return response.data;
    },

    /**
     * Get details for a specific trial by NCT ID
     */
    async getTrialDetail(nctId: string): Promise<CanonicalClinicalTrial> {
        const response = await api.post('/api/tools/trials/detail', { nct_id: nctId });
        return response.data;
    }
};

// ============================================================================
// Clinical Trials API Types
// ============================================================================

export interface TrialSearchRequest {
    condition?: string;
    intervention?: string;
    sponsor?: string;
    status?: string[];
    phase?: string[];
    study_type?: string;
    location?: string;
    start_date?: string;
    end_date?: string;
    max_results?: number;
}

export interface TrialSearchResponse {
    trials: CanonicalClinicalTrial[];
    total_results: number;
    returned_count: number;
}
