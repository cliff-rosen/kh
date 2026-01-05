import { api } from './index';
import { ResearchStream, ReportFrequency, InformationSource, Concept, RetrievalConfig, SemanticSpace, PresentationConfig, BroadQuery } from '../../types';
import { makeStreamRequest } from './streamUtils';
import { CanonicalResearchArticle } from '../../types/canonical_types';

// ============================================================================
// Refinement Workbench API Types
// ============================================================================

export interface RunQueryRequest {
    stream_id: number;
    query_index: number;
    start_date: string;  // YYYY-MM-DD
    end_date: string;    // YYYY-MM-DD
}

export interface TestCustomQueryRequest {
    query_expression: string;
    start_date: string;  // YYYY-MM-DD
    end_date: string;    // YYYY-MM-DD
}

export interface ManualPMIDsRequest {
    pmids: string[];
}

export interface SourceResponse {
    articles: CanonicalResearchArticle[];
    count: number;  // Number of articles actually returned
    total_count: number;  // Total number of articles matching the query
    all_matched_pmids: string[];  // ALL PMIDs matching the query (for comparison)
    metadata?: Record<string, any>;
}

export interface FilterArticlesRequest {
    articles: CanonicalResearchArticle[];
    filter_criteria: string;
    threshold: number;  // 0.0-1.0
    output_type?: 'boolean' | 'number' | 'text';  // Expected output type
}

export interface FilterResult {
    article: CanonicalResearchArticle;
    passed: boolean;
    score: number;
    reasoning: string;
}

export interface FilterResponse {
    results: FilterResult[];
    count: number;
    passed: number;
    failed: number;
}

export interface CategorizeArticlesRequest {
    stream_id: number;
    articles: CanonicalResearchArticle[];
}

export interface CategoryAssignment {
    article: CanonicalResearchArticle;
    assigned_categories: string[];
}

export interface CategorizeResponse {
    results: CategoryAssignment[];
    count: number;
    category_distribution: Record<string, number>;
}

export interface ComparePMIDsRequest {
    retrieved_pmids: string[];
    expected_pmids: string[];
}

export interface ComparisonResult {
    matched: string[];
    missed: string[];
    extra: string[];
    matched_count: number;
    missed_count: number;
    extra_count: number;
    recall: number;
    precision: number;
    f1_score: number;
}

/**
 * Research Stream CRUD API Types
 */

export interface ResearchStreamCreateRequest {
    stream_name: string;
    purpose: string;
    report_frequency: ReportFrequency;
    semantic_space: SemanticSpace;
    retrieval_config: RetrievalConfig;
    presentation_config: PresentationConfig;
}

export interface ResearchStreamUpdateRequest {
    stream_name?: string;
    purpose?: string;
    report_frequency?: ReportFrequency;
    is_active?: boolean;
    semantic_space?: SemanticSpace;
    retrieval_config?: RetrievalConfig;
    presentation_config?: PresentationConfig;
}

// ============================================================================
// Shared Retrieval API Types
// ============================================================================

export interface QueryGenerationResponse {
    query_expression: string;
    reasoning: string;
}

// ============================================================================
// Pipeline Execution API Types (Layer 4: Test & Execute)
// ============================================================================

export interface PipelineStatus {
    stage: string;
    message: string;
    data?: Record<string, any>;
    timestamp: string;
}

export interface ExecutePipelineRequest {
    run_type?: 'test' | 'scheduled' | 'manual';
    start_date?: string;  // YYYY/MM/DD format
    end_date?: string;    // YYYY/MM/DD format
    report_name?: string;  // Custom name for the report
}

export interface QueryTestRequest {
    source_id: string;
    query_expression: string;
    max_results?: number;
    start_date?: string;  // YYYY/MM/DD - PubMed only
    end_date?: string;    // YYYY/MM/DD - PubMed only
    date_type?: string;   // 'entry', 'publication', etc. - PubMed only
    sort_by?: string;     // 'relevance', 'date' - PubMed only
}

export interface QueryTestResponse {
    success: boolean;
    article_count: number;
    sample_articles: CanonicalResearchArticle[];
    error_message?: string;
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
     * Get the authoritative list of information sources
     */
    async getInformationSources(): Promise<InformationSource[]> {
        const response = await api.get('/api/research-streams/metadata/sources');
        return response.data;
    },

    // ========================================================================
    // Retrieval Concept Workflow (Layer 2: Concept-Based Configuration)
    // ========================================================================

    /**
     * Propose broad search strategy (alternative to concepts)
     *
     * Generates 1-3 broad, simple search queries that cast a wide net
     * to capture all relevant literature. Optimized for weekly monitoring
     * where accepting false positives is better than missing papers.
     */
    async proposeBroadSearch(streamId: number): Promise<{
        queries: BroadQuery[];
        strategy_rationale: string;
        coverage_analysis: any;
    }> {
        const response = await api.post(
            `/api/research-streams/${streamId}/retrieval/propose-broad-search`
        );
        return response.data;
    },

    /**
     * Generate semantic filter for a broad query
     */
    async generateBroadFilter(streamId: number, broadQuery: BroadQuery): Promise<{
        criteria: string;
        threshold: number;
        reasoning: string;
    }> {
        const response = await api.post(
            `/api/research-streams/${streamId}/retrieval/generate-broad-filter`,
            { broad_query: broadQuery }
        );
        return response.data;
    },

    /**
     * Propose retrieval concepts based on semantic space analysis
     */
    async proposeRetrievalConcepts(streamId: number): Promise<{
        proposed_concepts: Concept[];
        analysis: any;
        reasoning: string;
        coverage_check: any;
    }> {
        const response = await api.post(
            `/api/research-streams/${streamId}/retrieval/propose-concepts`
        );
        return response.data;
    },

    /**
     * Generate query for a concept
     */
    async generateConceptQuery(streamId: number, concept: Concept, sourceId: string): Promise<{
        query_expression: string;
        reasoning: string;
    }> {
        const response = await api.post(
            `/api/research-streams/${streamId}/retrieval/generate-concept-query`,
            { concept, source_id: sourceId }
        );
        return response.data;
    },

    /**
     * Generate semantic filter for a concept
     */
    async generateConceptFilter(streamId: number, concept: Concept): Promise<{
        criteria: string;
        threshold: number;
        reasoning: string;
    }> {
        const response = await api.post(
            `/api/research-streams/${streamId}/retrieval/generate-concept-filter`,
            { concept }
        );
        return response.data;
    },

    /**
     * Validate concepts configuration
     */
    async validateConcepts(streamId: number, concepts: Concept[]): Promise<{
        is_complete: boolean;
        coverage: any;
        configuration_status: any;
        warnings: string[];
        ready_to_activate: boolean;
    }> {
        const response = await api.post(
            `/api/research-streams/${streamId}/retrieval/validate-concepts`,
            { concepts }
        );
        return response.data;
    },

    // ========================================================================
    // Query Testing (Same Path as Pipeline)
    // ========================================================================

    /**
     * Test a query against a source (uses same code path as pipeline)
     */
    async testSourceQuery(
        streamId: number,
        request: QueryTestRequest
    ): Promise<QueryTestResponse> {
        const response = await api.post(
            `/api/research-streams/${streamId}/test-query`,
            request
        );
        return response.data;
    },


    // ========================================================================
    // Pipeline Execution (Layer 4: Test & Execute)
    // ========================================================================

    async* executePipeline(
        streamId: number,
        request: ExecutePipelineRequest = {}
    ): AsyncGenerator<PipelineStatus> {
        const stream = makeStreamRequest(
            `/api/research-streams/${streamId}/execute-pipeline`,
            request,
            'POST'
        );

        for await (const update of stream) {
            // Parse SSE data (format: "data: {json}\n\n")
            const lines = update.data.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonData = line.slice(6); // Remove "data: " prefix
                    if (jsonData.trim()) {
                        try {
                            const status = JSON.parse(jsonData) as PipelineStatus;
                            yield status;
                        } catch (e) {
                            console.error('Failed to parse pipeline status:', e);
                        }
                    }
                }
            }
        }
    },


    // ========================================================================
    // Refinement Workbench (Layer 4: Test & Refine)
    // ========================================================================

    /**
     * Execute a broad query from a stream's retrieval config
     */
    async runQuery(request: RunQueryRequest): Promise<SourceResponse> {
        const response = await api.post(
            '/api/refinement-workbench/source/run-query',
            request
        );
        return response.data;
    },

    /**
     * Test a custom query expression (not necessarily saved to stream)
     */
    async testCustomQuery(request: TestCustomQueryRequest): Promise<SourceResponse> {
        const response = await api.post(
            '/api/refinement-workbench/source/test-custom-query',
            request
        );
        return response.data;
    },

    /**
     * Fetch articles by PMID list
     */
    async fetchManualPMIDs(request: ManualPMIDsRequest): Promise<SourceResponse> {
        const response = await api.post(
            '/api/refinement-workbench/source/manual-pmids',
            request
        );
        return response.data;
    },

    /**
     * Apply semantic filtering to articles
     */
    async filterArticles(request: FilterArticlesRequest): Promise<FilterResponse> {
        const response = await api.post(
            '/api/refinement-workbench/filter',
            request
        );
        return response.data;
    },

    /**
     * Categorize articles using stream's Layer 3 categories
     */
    async categorizeArticles(request: CategorizeArticlesRequest): Promise<CategorizeResponse> {
        const response = await api.post(
            '/api/refinement-workbench/categorize',
            request
        );
        return response.data;
    },

    /**
     * Compare retrieved vs expected PMID lists
     */
    async comparePMIDs(request: ComparePMIDsRequest): Promise<ComparisonResult> {
        const response = await api.post(
            '/api/refinement-workbench/compare',
            request
        );
        return response.data;
    },

    /**
     * Update a specific broad query's expression
     * Used by refinement workbench to apply tested queries back to stream config
     */
    async updateBroadQuery(
        streamId: number,
        queryIndex: number,
        queryExpression: string
    ): Promise<ResearchStream> {
        const response = await api.patch(
            `/api/research-streams/${streamId}/retrieval-config/queries/${queryIndex}`,
            { query_expression: queryExpression }
        );
        return response.data;
    },

    /**
     * Update semantic filter configuration for a specific broad query
     * Used by refinement workbench to apply tested filters back to stream config
     */
    async updateSemanticFilter(
        streamId: number,
        queryIndex: number,
        filter: { enabled: boolean; criteria: string; threshold: number }
    ): Promise<ResearchStream> {
        const response = await api.patch(
            `/api/research-streams/${streamId}/retrieval-config/queries/${queryIndex}/semantic-filter`,
            filter
        );
        return response.data;
    }

};