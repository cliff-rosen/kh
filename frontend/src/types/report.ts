export interface ReportArticle {
    article_id: number;
    title: string;
    authors: string[];
    journal?: string;
    publication_date?: string;
    pmid?: string;
    doi?: string;
    abstract?: string;
    url?: string;
    year?: string;
    // Association metadata
    relevance_score?: number;
    relevance_rationale?: string;
    ranking?: number;
    is_starred?: boolean;
    is_read?: boolean;
    notes?: string;
    presentation_categories?: string[];  // List of category IDs
}

export interface Report {
    report_id: number;
    user_id: number;
    research_stream_id: number | null;
    report_date: string;
    executive_summary?: string | null;  // Generated separately by LLM
    key_highlights: string[];
    thematic_analysis?: string | null;  // Generated separately by LLM
    coverage_stats: Record<string, any>;
    is_read: boolean;
    read_at: string | null;
    created_at: string;
    article_count?: number;
    // Pipeline execution metadata
    run_type?: string | null;  // 'test', 'scheduled', or 'manual'
    pipeline_metrics?: Record<string, any>;
    pipeline_execution_id?: string | null;  // UUID linking to WIP data
}

export interface ReportWithArticles extends Report {
    articles: ReportArticle[];
}
