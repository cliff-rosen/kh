/**
 * Operations API - Pipeline execution queue and scheduler management
 */

import { api } from './index';
import { subscribeToSSE } from './streamUtils';

// Import domain types from types/
import type {
    ExecutionStatus,
    StreamOption,
    ExecutionQueueItem,
    ExecutionDetail,
    ScheduledStream,
} from '../../types/research-stream';
import type { ApprovalStatus } from '../../types/report';


// === API-Specific Types (response wrappers and request shapes) ===

export interface ExecutionQueueResponse {
    executions: ExecutionQueueItem[];
    total: number;
    streams: StreamOption[];
}

export interface UpdateScheduleRequest {
    enabled?: boolean;
    frequency?: string;
    anchor_day?: string;
    preferred_time?: string;
    timezone?: string;
    lookback_days?: number;
}


// === Execution Queue API ===

export async function getExecutionQueue(params?: {
    execution_status?: ExecutionStatus;
    approval_status?: ApprovalStatus;
    stream_id?: number;
    limit?: number;
    offset?: number;
}): Promise<ExecutionQueueResponse> {
    const searchParams = new URLSearchParams();
    if (params?.execution_status) {
        searchParams.append('execution_status', params.execution_status);
    }
    if (params?.approval_status) {
        searchParams.append('approval_status', params.approval_status);
    }
    if (params?.stream_id) {
        searchParams.append('stream_id', params.stream_id.toString());
    }
    if (params?.limit) {
        searchParams.append('limit', params.limit.toString());
    }
    if (params?.offset) {
        searchParams.append('offset', params.offset.toString());
    }

    const url = `/api/operations/executions${searchParams.toString() ? '?' + searchParams.toString() : ''}`;
    const response = await api.get<ExecutionQueueResponse>(url);
    return response.data;
}

export async function getExecutionDetail(executionId: string): Promise<ExecutionDetail> {
    const response = await api.get<ExecutionDetail>(`/api/operations/executions/${executionId}`);
    return response.data;
}

// === Curation API ===
// Human review and approval workflow for pipeline outputs

export async function getCurationView(reportId: number): Promise<CurationViewResponse> {
    const response = await api.get<CurationViewResponse>(`/api/operations/reports/${reportId}/curation`);
    return response.data;
}

export async function getCurationHistory(reportId: number): Promise<CurationHistoryResponse> {
    const response = await api.get<CurationHistoryResponse>(`/api/operations/reports/${reportId}/curation/history`);
    return response.data;
}

export async function updateReportContent(
    reportId: number,
    updates: ReportContentUpdate
): Promise<ReportContentUpdateResponse> {
    const response = await api.patch<ReportContentUpdateResponse>(
        `/api/operations/reports/${reportId}/content`,
        updates
    );
    return response.data;
}

export async function excludeArticle(
    reportId: number,
    articleId: number,
    reason?: string
): Promise<ExcludeArticleResponse> {
    const response = await api.post<ExcludeArticleResponse>(
        `/api/operations/reports/${reportId}/articles/${articleId}/exclude`,
        { notes: reason }
    );
    return response.data;
}

export async function includeArticle(
    reportId: number,
    wipArticleId: number,
    category?: string
): Promise<IncludeArticleResponse> {
    const response = await api.post<IncludeArticleResponse>(
        `/api/operations/reports/${reportId}/articles/include`,
        { wip_article_id: wipArticleId, category }
    );
    return response.data;
}

export async function resetCuration(
    reportId: number,
    wipArticleId: number
): Promise<ResetCurationResponse> {
    const response = await api.post<ResetCurationResponse>(
        `/api/operations/reports/${reportId}/articles/${wipArticleId}/reset-curation`
    );
    return response.data;
}

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
        `/api/operations/reports/${reportId}/articles/${articleId}`,
        updates
    );
    return response.data;
}

export async function updateWipArticleCurationNotes(
    reportId: number,
    wipArticleId: number,
    curationNotes: string
): Promise<UpdateWipArticleNotesResponse> {
    const response = await api.patch<UpdateWipArticleNotesResponse>(
        `/api/operations/reports/${reportId}/wip-articles/${wipArticleId}/notes`,
        { curation_notes: curationNotes }
    );
    return response.data;
}

export async function approveReport(reportId: number): Promise<ApproveReportResponse> {
    const response = await api.post<ApproveReportResponse>(`/api/operations/reports/${reportId}/approve`);
    return response.data;
}

export async function rejectReport(reportId: number, reason: string): Promise<RejectReportResponse> {
    const response = await api.post<RejectReportResponse>(`/api/operations/reports/${reportId}/reject`, { reason });
    return response.data;
}

export async function sendApprovalRequest(
    reportId: number,
    adminUserId: number
): Promise<{ success: boolean; message: string }> {
    const response = await api.post<{ success: boolean; message: string }>(
        `/api/operations/reports/${reportId}/request-approval`,
        { admin_user_id: adminUserId }
    );
    return response.data;
}

export async function getPipelineAnalytics(reportId: number): Promise<PipelineAnalyticsResponse> {
    const response = await api.get<PipelineAnalyticsResponse>(
        `/api/operations/reports/${reportId}/pipeline-analytics`
    );
    return response.data;
}

// === Scheduler API ===

export async function getScheduledStreams(): Promise<ScheduledStream[]> {
    const response = await api.get<ScheduledStream[]>('/api/operations/streams/scheduled');
    return response.data;
}

export async function updateStreamSchedule(
    streamId: number,
    updates: UpdateScheduleRequest
): Promise<ScheduledStream> {
    const response = await api.patch<ScheduledStream>(
        `/api/operations/streams/${streamId}/schedule`,
        updates
    );
    return response.data;
}


// === Run Management API ===

export interface TriggerRunRequest {
    stream_id: number;
    run_type?: 'manual' | 'test';
    report_name?: string;
    start_date?: string;
    end_date?: string;
}

export interface TriggerRunResponse {
    execution_id: string;
    stream_id: number;
    status: string;
    message: string;
}

export interface RunStatusResponse {
    execution_id: string;
    stream_id: number;
    status: string;
    run_type: string;
    started_at?: string;
    completed_at?: string;
    error?: string;
}

export interface RunStatusEvent {
    execution_id: string;
    stage: string;
    message: string;
    timestamp: string;
    error?: string;
}

export async function triggerRun(request: TriggerRunRequest): Promise<TriggerRunResponse> {
    const response = await api.post<TriggerRunResponse>('/api/operations/runs', request);
    return response.data;
}

export async function getRunStatus(executionId: string): Promise<RunStatusResponse> {
    const response = await api.get<RunStatusResponse>(`/api/operations/runs/${executionId}`);
    return response.data;
}

export async function cancelRun(executionId: string): Promise<{ message: string; execution_id: string }> {
    const response = await api.delete<{ message: string; execution_id: string }>(
        `/api/operations/runs/${executionId}`
    );
    return response.data;
}

/**
 * Subscribe to run status updates via SSE.
 *
 * @param executionId - The execution ID to subscribe to
 * @param onMessage - Callback for each status update
 * @param onError - Callback for errors
 * @param onComplete - Callback when stream ends
 * @returns Cleanup function to close the connection
 */
export function subscribeToRunStatus(
    executionId: string,
    onMessage: (event: RunStatusEvent) => void,
    onError?: (error: Event) => void,
    onComplete?: () => void
): () => void {
    let cleanup: (() => void) | null = null;

    cleanup = subscribeToSSE<RunStatusEvent>(
        `/api/operations/runs/${executionId}/stream`,
        (event) => {
            onMessage(event);
            // Check for completion stages
            if (event.stage === 'completed' || event.stage === 'failed') {
                onComplete?.();
                cleanup?.();
            }
        },
        (error) => onError?.(error as unknown as Event),
        onComplete
    );

    return () => cleanup?.();
}


// ==================== Curation Types ====================

export interface CurationStats {
    pipeline_included: number;
    pipeline_filtered: number;
    pipeline_duplicates: number;
    current_included: number;
    curator_added: number;
    curator_removed: number;
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
    curator_added: boolean;
    wip_article_id: number | null;
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
    presentation_categories: string[];
}

export interface ReportContentUpdate {
    title?: string;
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
    curation_notes: string | null;
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

export interface PipelineAnalyticsResponse {
    report_id: number;
    execution_id: string | null;
    retrieval_config: Record<string, unknown> | null;
    stats: CurationStats;
    [key: string]: unknown;
}
