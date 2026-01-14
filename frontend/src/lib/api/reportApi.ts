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
     * Get a report with its articles
     */
    async getReportWithArticles(reportId: number): Promise<ReportWithArticles> {
        const response = await api.get(`/api/reports/${reportId}`);
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
    // Admin Operations
    // =========================================================================

    /**
     * Get list of admin users who can approve reports
     */
    async getAdminUsers(): Promise<{ user_id: number; email: string; display_name: string }[]> {
        const response = await api.get('/api/user/admins');
        return response.data;
    },
};
