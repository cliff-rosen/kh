/**
 * Types for per-user article starring feature
 */

/**
 * A starred article with full metadata and context
 */
export interface StarredArticle {
    article_id: number;
    report_id: number;
    report_name: string;
    stream_id: number;
    stream_name: string;
    title: string;
    authors: string[];
    journal?: string;
    pub_year?: number;
    pub_month?: number;
    pub_day?: number;
    pmid?: string;
    doi?: string;
    abstract?: string;
    starred_at: string;  // ISO datetime string
}

/**
 * Response from toggling star status
 */
export interface ToggleStarResponse {
    is_starred: boolean;
}

/**
 * Response containing list of starred article IDs for a report
 */
export interface StarredArticleIdsResponse {
    starred_article_ids: number[];
}

/**
 * Response containing list of starred articles
 */
export interface StarredArticlesResponse {
    articles: StarredArticle[];
}

/**
 * Response containing count of starred articles
 */
export interface StarredCountResponse {
    count: number;
}
