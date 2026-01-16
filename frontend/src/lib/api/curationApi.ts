/**
 * Curation API - Human review and approval workflow for pipeline outputs
 *
 * Matches backend router: /api/operations/reports/{report_id}/...
 */

import { api } from './index';

// ==================== Types ====================

export interface CurationStats {
    pipeline_included: number;
    pipeline_filtered: number;
    pipeline_duplicates: number;
    current_included: number;
    curator_added: number;
    curator_removed: number;
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
    // Association data (how article appears in this report)
    ranking: number | null;
    original_ranking: number | null;
    presentation_categories: string[];
    original_presentation_categories: string[];
    ai_summary: string | null;
    original_ai_summary: string | null;
    relevance_score: number | null;
    // Curation data (from WipArticle - audit trail)
    curation_notes: string | null;
    curated_by: number | null;
    curated_at: string | null;
    // Source indicator
    curator_added: boolean;
    wip_article_id: number | null;
    // Filter data (from WipArticle)
    filter_score: number | null;
    filter_score_reason: string | null;
}

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
}

export interface CurationViewResponse {
    report: CurationReportData;
    included_articles: CurationIncludedArticle[];
    filtered_articles: CurationFilteredArticle[];
    duplicate_articles: CurationFilteredArticle[];
    curated_articles: CurationFilteredArticle[];
    categories: CurationCategory[];
    stream_name: string | null;
    stats: CurationStats;
    execution_id: string | null;
    retrieval_config: Record<string, unknown> | null;
    start_date: string | null;
    end_date: string | null;
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

export interface PipelineAnalyticsResponse {
    report_id: number;
    execution_id: string | null;
    retrieval_config: Record<string, unknown> | null;
    stats: CurationStats;
    [key: string]: unknown;
}

// Request/Response types
export interface ReportContentUpdate {
    report_name?: string;
    executive_summary?: string;
    category_summaries?: Record<string, string>;
}

export interface ReportContentUpdateResponse {
    report_name: string;
    executive_summary: string;
    category_summaries: Record<string, string>;
    has_curation_edits: boolean;
}

export interface ExcludeArticleResponse {
    article_id: number;
    excluded: boolean;
    wip_article_updated: boolean;
}

export interface IncludeArticleResponse {
    article_id: number;
    wip_article_id: number;
    included: boolean;
    ranking: number;
    category: string | null;
}

export interface ResetCurationResponse {
    wip_article_id: number;
    reset: boolean;
    was_curator_included?: boolean;
    was_curator_excluded?: boolean;
    pipeline_decision?: boolean;
    now_in_report?: boolean;
    message?: string;
}

export interface UpdateArticleResponse {
    article_id: number;
    ranking: number | null;
    presentation_categories: string[];
    ai_summary: string | null;
}

export interface UpdateWipArticleNotesResponse {
    wip_article_id: number;
    curation_notes: string | null;
}

export interface ApproveReportResponse {
    report_id: number;
    approval_status: string;
    approved_by: number;
    approved_at: string;
}

export interface RejectReportResponse {
    report_id: number;
    approval_status: string;
    rejection_reason: string;
    rejected_by: number;
    rejected_at: string;
}

// ==================== API Functions ====================

const BASE_PATH = '/api/operations/reports';

/**
 * Get curation view for a report.
 * Returns report content, included articles, filtered articles, and duplicates.
 */
export async function getCurationView(reportId: number): Promise<CurationViewResponse> {
    const response = await api.get<CurationViewResponse>(`${BASE_PATH}/${reportId}/curation`);
    return response.data;
}

/**
 * Get curation history (audit trail) for a report.
 */
export async function getCurationHistory(reportId: number): Promise<CurationHistoryResponse> {
    const response = await api.get<CurationHistoryResponse>(`${BASE_PATH}/${reportId}/curation/history`);
    return response.data;
}

/**
 * Get pipeline analytics for a report.
 */
export async function getPipelineAnalytics(reportId: number): Promise<PipelineAnalyticsResponse> {
    const response = await api.get<PipelineAnalyticsResponse>(`${BASE_PATH}/${reportId}/pipeline-analytics`);
    return response.data;
}

/**
 * Update report content (name, summaries).
 */
export async function updateReportContent(
    reportId: number,
    updates: ReportContentUpdate
): Promise<ReportContentUpdateResponse> {
    const response = await api.patch<ReportContentUpdateResponse>(
        `${BASE_PATH}/${reportId}/content`,
        updates
    );
    return response.data;
}

/**
 * Exclude an article from the report.
 * @param articleId - The Article ID
 */
export async function excludeArticle(
    reportId: number,
    articleId: number,
    notes?: string
): Promise<ExcludeArticleResponse> {
    const response = await api.post<ExcludeArticleResponse>(
        `${BASE_PATH}/${reportId}/articles/${articleId}/exclude`,
        { notes }
    );
    return response.data;
}

/**
 * Include a filtered article into the report.
 * @param wipArticleId - The WipArticle ID
 */
export async function includeArticle(
    reportId: number,
    wipArticleId: number,
    category?: string
): Promise<IncludeArticleResponse> {
    const response = await api.post<IncludeArticleResponse>(
        `${BASE_PATH}/${reportId}/articles/include`,
        { wip_article_id: wipArticleId, category }
    );
    return response.data;
}

/**
 * Reset curation for an article, restoring it to the pipeline's original decision.
 * @param wipArticleId - The WipArticle ID
 */
export async function resetCuration(
    reportId: number,
    wipArticleId: number
): Promise<ResetCurationResponse> {
    const response = await api.post<ResetCurationResponse>(
        `${BASE_PATH}/${reportId}/articles/${wipArticleId}/reset-curation`
    );
    return response.data;
}

/**
 * Update an article within a report (ranking, category, AI summary).
 * @param articleId - The Article ID
 */
export async function updateArticleInReport(
    reportId: number,
    articleId: number,
    updates: {
        ranking?: number;
        category?: string;
        ai_summary?: string;
    }
): Promise<UpdateArticleResponse> {
    const response = await api.patch<UpdateArticleResponse>(
        `${BASE_PATH}/${reportId}/articles/${articleId}`,
        updates
    );
    return response.data;
}

/**
 * Update curation notes for a WipArticle.
 * @param wipArticleId - The WipArticle ID
 */
export async function updateWipArticleCurationNotes(
    reportId: number,
    wipArticleId: number,
    curationNotes: string
): Promise<UpdateWipArticleNotesResponse> {
    const response = await api.patch<UpdateWipArticleNotesResponse>(
        `${BASE_PATH}/${reportId}/wip-articles/${wipArticleId}/notes`,
        { curation_notes: curationNotes }
    );
    return response.data;
}

/**
 * Approve a report for distribution.
 */
export async function approveReport(reportId: number): Promise<ApproveReportResponse> {
    const response = await api.post<ApproveReportResponse>(`${BASE_PATH}/${reportId}/approve`);
    return response.data;
}

/**
 * Reject a report with a reason.
 */
export async function rejectReport(reportId: number, reason: string): Promise<RejectReportResponse> {
    const response = await api.post<RejectReportResponse>(`${BASE_PATH}/${reportId}/reject`, { reason });
    return response.data;
}

/**
 * Send an approval request email to an admin.
 */
export async function sendApprovalRequest(
    reportId: number,
    adminUserId: number
): Promise<{ success: boolean; message: string }> {
    const response = await api.post<{ success: boolean; message: string }>(
        `${BASE_PATH}/${reportId}/request-approval`,
        { admin_user_id: adminUserId }
    );
    return response.data;
}

// ==================== Regeneration ====================

export interface RegenerateExecutiveSummaryResponse {
    executive_summary: string;
}

export interface RegenerateCategorySummaryResponse {
    category_id: string;
    category_summary: string;
}

export interface RegenerateArticleSummaryResponse {
    article_id: number;
    ai_summary: string;
}

/**
 * Regenerate the executive summary for a report using AI.
 */
export async function regenerateExecutiveSummary(
    reportId: number
): Promise<RegenerateExecutiveSummaryResponse> {
    const response = await api.post<RegenerateExecutiveSummaryResponse>(
        `${BASE_PATH}/${reportId}/regenerate/executive-summary`
    );
    return response.data;
}

/**
 * Regenerate a category summary for a report using AI.
 */
export async function regenerateCategorySummary(
    reportId: number,
    categoryId: string
): Promise<RegenerateCategorySummaryResponse> {
    const response = await api.post<RegenerateCategorySummaryResponse>(
        `${BASE_PATH}/${reportId}/regenerate/category-summary/${categoryId}`
    );
    return response.data;
}

/**
 * Regenerate the AI summary for a specific article in the report.
 */
export async function regenerateArticleSummary(
    reportId: number,
    articleId: number
): Promise<RegenerateArticleSummaryResponse> {
    const response = await api.post<RegenerateArticleSummaryResponse>(
        `${BASE_PATH}/${reportId}/articles/${articleId}/regenerate-summary`
    );
    return response.data;
}
