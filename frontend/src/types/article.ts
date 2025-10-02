// Article types for Knowledge Horizon
// Matches backend/schemas/article.py

export interface Article {
    article_id: number;
    source_id?: number;
    title: string;
    url?: string;
    authors: string[];
    publication_date?: string;
    summary?: string;
    ai_summary?: string;
    full_text?: string;
    article_metadata: Record<string, any>;
    theme_tags: string[];
    first_seen: string;
    last_updated: string;
    fetch_count: number;

    // PubMed-specific fields
    pmid?: string;
    abstract?: string;
    comp_date?: string;
    year?: string;
    journal?: string;
    volume?: string;
    issue?: string;
    medium?: string;
    pages?: string;
    poi?: string;
    doi?: string;
    is_systematic: boolean;
}
