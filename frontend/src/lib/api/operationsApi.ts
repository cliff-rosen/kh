/**
 * Operations API - Admin endpoints for report queue and scheduler management
 */

import { api } from './index';

// === Types ===

export type ApprovalStatus = 'awaiting_approval' | 'approved' | 'rejected';
export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed';
export type RunType = 'scheduled' | 'manual' | 'test';

export interface ReportQueueItem {
    report_id: number;
    report_name: string;
    stream_id: number;
    stream_name: string;
    article_count: number;
    run_type: RunType;
    approval_status: ApprovalStatus;
    created_at: string;
    approved_by?: string | null;
    approved_at?: string | null;
    rejection_reason?: string | null;
    pipeline_execution_id?: string | null;
}

export interface StreamOption {
    stream_id: number;
    stream_name: string;
}

export interface ReportQueueResponse {
    reports: ReportQueueItem[];
    total: number;
    streams: StreamOption[];
}

export interface PipelineExecution {
    id: string;
    stream_id: number;
    status: ExecutionStatus;
    run_type: RunType;
    started_at: string | null;
    completed_at: string | null;
    error: string | null;
    report_id: number | null;
    report_approval_status?: ApprovalStatus | null;
    article_count?: number | null;
}

export interface ScheduleConfig {
    enabled: boolean;
    frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
    anchor_day: string | null;
    preferred_time: string;
    timezone: string;
    lookback_days?: number | null;
}

export interface ScheduledStream {
    stream_id: number;
    stream_name: string;
    schedule_config: ScheduleConfig;
    next_scheduled_run: string | null;
    last_execution: PipelineExecution | null;
}

export interface UpdateScheduleRequest {
    enabled?: boolean;
    frequency?: string;
    anchor_day?: string;
    preferred_time?: string;
    timezone?: string;
    lookback_days?: number;
}

// === Report Queue API ===

export async function getReportQueue(params?: {
    status?: ApprovalStatus | 'all';
    stream_id?: number;
    limit?: number;
    offset?: number;
}): Promise<ReportQueueResponse> {
    const searchParams = new URLSearchParams();
    if (params?.status && params.status !== 'all') {
        searchParams.append('status_filter', params.status);
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

    const url = `/api/operations/reports/queue${searchParams.toString() ? '?' + searchParams.toString() : ''}`;
    const response = await api.get<ReportQueueResponse>(url);
    return response.data;
}

export async function approveReport(reportId: number): Promise<void> {
    await api.post(`/api/operations/reports/${reportId}/approve`);
}

export async function rejectReport(reportId: number, reason: string): Promise<void> {
    await api.post(`/api/operations/reports/${reportId}/reject`, { reason });
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

// === Report Detail API ===

export interface ReportArticle {
    article_id: number;
    title: string;
    authors: string[];
    journal: string;
    year: string;
    pmid: string;
    abstract?: string;
    category_id: string | null;
    relevance_score: number;
    filter_passed: boolean;
}

export interface ReportCategory {
    id: string;
    name: string;
    article_count: number;
}

export interface ReportExecution {
    id: string;
    stream_id: number;
    status: ExecutionStatus;
    run_type: RunType;
    started_at: string | null;
    completed_at: string | null;
    error: string | null;
    report_id: number | null;
    articles_retrieved?: number;
    articles_after_dedup?: number;
    articles_after_filter?: number;
    filter_config?: string;
}

export interface WipArticle {
    id: number;
    title: string;
    authors: string[];
    journal: string;
    year: string;
    pmid: string;
    abstract?: string;
    is_duplicate: boolean;
    duplicate_of_id?: number;
    passed_semantic_filter: boolean | null;
    filter_rejection_reason?: string;
    included_in_report: boolean;
    presentation_categories: string[];
    relevance_score?: number;
}

export interface ReportDetail {
    report_id: number;
    report_name: string;
    stream_id: number;
    stream_name: string;
    run_type: RunType;
    approval_status: ApprovalStatus;
    created_at: string;
    article_count: number;
    pipeline_execution_id: string | null;
    executive_summary: string | null;
    categories: ReportCategory[];
    articles: ReportArticle[];
    execution: ReportExecution | null;
    wip_articles: WipArticle[];
    approved_by: string | null;
    approved_at: string | null;
    rejection_reason: string | null;
}

export async function getReportDetail(reportId: number): Promise<ReportDetail> {
    const response = await api.get<ReportDetail>(`/api/operations/reports/${reportId}`);
    return response.data;
}
