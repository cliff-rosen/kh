import { api } from './index';
import { Report, ReportWithArticles, ArticleEnrichments } from '../../types';

export interface ArticleMetadata {
    notes: string | null;
    ai_enrichments: ArticleEnrichments | null;
}

export const reportApi = {
    /**
     * Get recent reports across all streams
     */
    async getRecentReports(limit: number = 5): Promise<Report[]> {
        const response = await api.get(`/api/reports/recent?limit=${limit}`);
        return response.data;
    },

    /**
     * Get all reports for a research stream
     */
    async getReportsForStream(streamId: number): Promise<Report[]> {
        const response = await api.get(`/api/reports/stream/${streamId}`);
        return response.data;
    },

    /**
     * Get the latest report for a research stream
     */
    async getLatestReportForStream(streamId: number): Promise<Report> {
        const response = await api.get(`/api/reports/stream/${streamId}/latest`);
        return response.data;
    },

    /**
     * Get a report with its articles
     */
    async getReportWithArticles(reportId: number): Promise<ReportWithArticles> {
        const response = await api.get(`/api/reports/${reportId}`);
        return response.data;
    },

    /**
     * Get pipeline analytics for a test report
     */
    async getPipelineAnalytics(reportId: number): Promise<any> {
        const response = await api.get(`/api/reports/${reportId}/pipeline-analytics`);
        return response.data;
    },

    /**
     * Compare a report to a list of PubMed IDs
     */
    async compareReport(reportId: number, pubmedIds: string[]): Promise<any> {
        const response = await api.post(`/api/research-streams/reports/${reportId}/compare`, {
            report_id: reportId,
            pubmed_ids: pubmedIds
        });
        return response.data;
    },

    /**
     * Delete a report
     */
    async deleteReport(reportId: number): Promise<void> {
        await api.delete(`/api/reports/${reportId}`);
    },

    /**
     * Get article metadata (notes and stance analysis) for an article in a report
     */
    async getArticleMetadata(reportId: number, articleId: number): Promise<ArticleMetadata> {
        const response = await api.get(`/api/reports/${reportId}/articles/${articleId}/metadata`);
        return response.data;
    },

    /**
     * Update notes for an article in a report
     */
    async updateArticleNotes(reportId: number, articleId: number, notes: string | null): Promise<void> {
        await api.patch(`/api/reports/${reportId}/articles/${articleId}/notes`, { notes });
    },

    /**
     * Update AI enrichments for an article in a report
     */
    async updateArticleEnrichments(reportId: number, articleId: number, aiEnrichments: ArticleEnrichments): Promise<void> {
        await api.patch(`/api/reports/${reportId}/articles/${articleId}/enrichments`, { ai_enrichments: aiEnrichments });
    },

    // =========================================================================
    // Email Operations
    // =========================================================================

    /**
     * Generate email HTML for a report (does not store)
     */
    async generateReportEmail(reportId: number): Promise<{ html: string; report_name: string }> {
        const response = await api.post(`/api/reports/${reportId}/email/generate`);
        return response.data;
    },

    /**
     * Store email HTML for a report
     */
    async storeReportEmail(reportId: number, html: string): Promise<{ html: string; report_name: string }> {
        const response = await api.post(`/api/reports/${reportId}/email/store`, { html });
        return response.data;
    },

    /**
     * Get stored email HTML for a report
     */
    async getReportEmail(reportId: number): Promise<{ html: string; report_name: string }> {
        const response = await api.get(`/api/reports/${reportId}/email`);
        return response.data;
    },

    /**
     * Send report email to recipients
     */
    async sendReportEmail(reportId: number, recipients: string[]): Promise<{ success: string[]; failed: string[] }> {
        const response = await api.post(`/api/reports/${reportId}/email/send`, { recipients });
        return response.data;
    },

    // =========================================================================
    // Curation Operations
    // =========================================================================

    /**
     * Get curation view for a report
     * Returns report content, included articles, filtered articles, and duplicates
     */
    async getCurationView(reportId: number): Promise<CurationViewResponse> {
        const response = await api.get(`/api/reports/${reportId}/curation`);
        return response.data;
    },

    /**
     * Get curation history (audit trail) for a report
     */
    async getCurationHistory(reportId: number): Promise<CurationHistoryResponse> {
        const response = await api.get(`/api/reports/${reportId}/curation/history`);
        return response.data;
    },

    /**
     * Update report content (title, summaries)
     */
    async updateReportContent(reportId: number, updates: ReportContentUpdate): Promise<{ success: boolean; message: string }> {
        const response = await api.patch(`/api/reports/${reportId}/content`, updates);
        return response.data;
    },

    /**
     * Exclude an article from the report
     * @param articleId - The ReportArticleAssociation ID (not the Article ID)
     */
    async excludeArticle(reportId: number, articleId: number, reason?: string): Promise<{ success: boolean; message: string }> {
        const response = await api.post(`/api/reports/${reportId}/articles/${articleId}/exclude`, { reason });
        return response.data;
    },

    /**
     * Include a filtered article into the report
     * @param wipArticleId - The WipArticle ID
     */
    async includeArticle(reportId: number, wipArticleId: number, categoryId?: string): Promise<{ success: boolean; article_id: number; message: string }> {
        const response = await api.post(`/api/reports/${reportId}/articles/include`, {
            wip_article_id: wipArticleId,
            category_id: categoryId
        });
        return response.data;
    },

    /**
     * Reset curation for an article, restoring it to the pipeline's original decision.
     * This is the "undo" operation for curator include/exclude actions.
     * @param wipArticleId - The WipArticle ID
     */
    async resetCuration(reportId: number, wipArticleId: number): Promise<{
        wip_article_id: number;
        reset: boolean;
        was_curator_included?: boolean;
        was_curator_excluded?: boolean;
        pipeline_decision?: boolean;
        now_in_report?: boolean;
        message?: string;
    }> {
        const response = await api.post(`/api/reports/${reportId}/articles/${wipArticleId}/reset-curation`);
        return response.data;
    },

    /**
     * Approve a report for distribution
     */
    async approveReport(reportId: number): Promise<{ success: boolean; message: string }> {
        const response = await api.post(`/api/reports/${reportId}/approve`);
        return response.data;
    },

    /**
     * Reject a report
     */
    async rejectReport(reportId: number, reason: string): Promise<{ success: boolean; message: string }> {
        const response = await api.post(`/api/reports/${reportId}/reject`, { reason });
        return response.data;
    },

    /**
     * Update an article within a report (ranking, category, AI summary)
     * @param articleId - The Article ID (not WipArticle ID)
     */
    async updateArticleInReport(
        reportId: number,
        articleId: number,
        updates: {
            ranking?: number;
            category?: string;
            ai_summary?: string;
            curation_notes?: string;
        }
    ): Promise<{
        article_id: number;
        ranking: number | null;
        presentation_categories: string[];
        ai_summary: string | null;
        curation_notes: string | null;
    }> {
        const response = await api.patch(`/api/reports/${reportId}/articles/${articleId}`, updates);
        return response.data;
    },

    // =========================================================================
    // Admin / Approval Operations
    // =========================================================================

    /**
     * Get list of admin users who can approve reports
     */
    async getAdminUsers(): Promise<{ user_id: number; email: string; display_name: string }[]> {
        const response = await api.get('/api/user/admins');
        return response.data;
    },

    /**
     * Send an approval request email to an admin
     * Sends a notification with a link to the report curation page
     */
    async sendApprovalRequest(reportId: number, adminUserId: number): Promise<{ success: boolean; message: string }> {
        const response = await api.post(`/api/reports/${reportId}/request-approval`, {
            admin_user_id: adminUserId
        });
        return response.data;
    }
};

// =========================================================================
// Curation Types
// =========================================================================

/**
 * Backend curation view response structure
 */
export interface CurationStats {
    pipeline_included: number;  // Articles pipeline decided to include
    pipeline_filtered: number;  // Articles pipeline filtered out
    pipeline_duplicates: number;  // Duplicate articles detected
    current_included: number;  // Current visible articles in report
    curator_added: number;  // Articles curator manually added
    curator_removed: number;  // Articles curator manually removed
}

export interface CurationViewResponse {
    report: CurationReportData;
    included_articles: CurationIncludedArticle[];
    filtered_articles: CurationFilteredArticle[];
    duplicate_articles: CurationFilteredArticle[];  // Empty - duplicates not actionable
    curated_articles: CurationFilteredArticle[];
    categories: CurationCategory[];
    stream_name: string | null;
    stats: CurationStats;
    // Execution info for retrieval config display
    execution_id: string | null;
    retrieval_config: Record<string, unknown> | null;
    // Date range from the pipeline execution
    start_date: string | null;
    end_date: string | null;
}

export interface CurationReportData {
    report_id: number;
    report_name: string;
    original_report_name: string | null;
    report_date: string | null;
    approval_status: string | null;
    executive_summary: string;
    original_executive_summary: string;
    category_summaries: Record<string, string>;
    original_category_summaries: Record<string, string>;
    has_curation_edits: boolean;
    last_curated_by: number | null;
    last_curated_at: string | null;
}

export interface CurationCategory {
    id: string;
    name: string;
    color?: string;
    description?: string;
}

export interface CurationEvent {
    id: number;
    event_type: string;
    field_name: string | null;
    old_value: string | null;
    new_value: string | null;
    notes: string | null;
    article_id: number | null;
    article_title: string | null;
    curator_name: string;
    created_at: string;
}

export interface CurationHistoryResponse {
    events: CurationEvent[];
    total_count: number;
}

/**
 * Included article (from ReportArticleAssociation + Article)
 */
export interface CurationIncludedArticle {
    article_id: number;
    pmid: string | null;
    doi: string | null;
    title: string;
    authors: string[];
    journal: string | null;
    year: number | null;
    abstract: string | null;
    url: string | null;
    // Association data
    ranking: number | null;
    original_ranking: number | null;
    presentation_categories: string[];
    original_presentation_categories: string[];
    ai_summary: string | null;
    original_ai_summary: string | null;
    relevance_score: number | null;
    curation_notes: string | null;
    curated_by: number | null;
    curated_at: string | null;
    // Source indicator
    curator_added: boolean;  // true = curator override, false = pipeline included
    wip_article_id: number | null;  // For reset curation on curator-added articles
}

/**
 * Filtered/duplicate article (from WipArticle)
 */
export interface CurationFilteredArticle {
    wip_article_id: number;
    pmid: string | null;
    doi: string | null;
    title: string;
    authors: string[];
    journal: string | null;
    year: number | null;
    abstract: string | null;
    url: string | null;
    filter_score: number | null;
    filter_score_reason: string | null;
    passed_semantic_filter: boolean | null;
    is_duplicate: boolean;
    duplicate_of_pmid: string | null;
    included_in_report: boolean;
    curator_included: boolean;
    curator_excluded: boolean;
    curation_notes: string | null;
    presentation_categories: string[];
}

export interface ReportContentUpdate {
    title?: string;
    executive_summary?: string;
    category_summaries?: Record<string, string>;
}
