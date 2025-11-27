/**
 * Refinement Workbench Types
 *
 * Types for testing and refining queries, filters, and categorization.
 */

// ============================================================================
// Source Operations
// ============================================================================

export interface RunQueryRequest {
    stream_id: number;
    query_index: number;
    start_date: string;  // YYYY-MM-DD
    end_date: string;    // YYYY-MM-DD
}

export interface ManualPMIDsRequest {
    pmids: string[];
}

export interface ArticleResult {
    pmid: string | null;
    title: string;
    abstract: string | null;
    journal: string | null;
    authors: string[] | null;
    publication_date: string | null;
    doi: string | null;
    url: string | null;
}

export interface SourceResponse {
    articles: ArticleResult[];
    count: number;
    metadata?: Record<string, any>;
}

// ============================================================================
// Filter Operations
// ============================================================================

export interface FilterArticlesRequest {
    articles: ArticleResult[];
    filter_criteria: string;
    threshold: number;  // 0.0-1.0
}

export interface FilterResult {
    article: ArticleResult;
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

// ============================================================================
// Categorize Operations
// ============================================================================

export interface CategorizeArticlesRequest {
    stream_id: number;
    articles: ArticleResult[];
}

export interface CategoryAssignment {
    article: ArticleResult;
    assigned_categories: string[];
}

export interface CategorizeResponse {
    results: CategoryAssignment[];
    count: number;
    category_distribution: Record<string, number>;
}

// ============================================================================
// Compare Operations
// ============================================================================

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
