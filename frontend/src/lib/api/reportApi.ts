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
    async getCurationView(reportId: number): Promise<CurationView> {
        const response = await api.get(`/api/reports/${reportId}/curation`);
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
    }
};

// =========================================================================
// Curation Types
// =========================================================================

export interface CurationView {
    report_id: number;
    report_name: string;
    original_report_name: string | null;
    stream_name: string;
    approval_status: string;
    has_curation_edits: boolean;
    created_at: string;
    date_range: string;
    executive_summary: string | null;
    original_enrichments: Record<string, unknown> | null;
    categories: CurationCategory[];
    included_articles: CurationArticle[];
    filtered_articles: CurationArticle[];
    duplicate_articles: CurationArticle[];
}

export interface CurationCategory {
    id: string;
    name: string;
    summary: string | null;
    article_count: number;
}

export interface CurationArticle {
    id: number;  // WipArticle ID or Article ID depending on context
    wip_article_id?: number;
    article_id?: number;
    pmid: string | null;
    doi: string | null;
    title: string;
    authors: string[];
    journal: string | null;
    year: number | null;
    abstract: string | null;
    category_id: string | null;
    filter_score: number | null;
    filter_score_reason: string | null;
    is_duplicate: boolean;
    duplicate_of_pmid: string | null;
    curator_included: boolean;
    curator_excluded: boolean;
}

export interface ReportContentUpdate {
    report_name?: string;
    executive_summary?: string;
    category_summaries?: Record<string, string>;
}
