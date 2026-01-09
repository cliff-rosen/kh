/**
 * Operations API - Pipeline execution queue and scheduler management
 */

import { api } from './index';

// === Types ===

export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed';
export type ApprovalStatus = 'awaiting_approval' | 'approved' | 'rejected';
export type RunType = 'scheduled' | 'manual' | 'test';

export interface StreamOption {
    stream_id: number;
    stream_name: string;
}

export interface ExecutionQueueItem {
    execution_id: string;
    stream_id: number;
    stream_name: string;
    execution_status: ExecutionStatus;
    run_type: RunType;
    started_at: string | null;
    completed_at: string | null;
    error: string | null;
    created_at: string;
    // Report info (only for completed executions)
    report_id: number | null;
    report_name: string | null;
    approval_status: ApprovalStatus | null;
    article_count: number | null;
    approved_by: string | null;
    approved_at: string | null;
    rejection_reason: string | null;
}

export interface ExecutionQueueResponse {
    executions: ExecutionQueueItem[];
    total: number;
    streams: StreamOption[];
}

export interface ReportArticle {
    article_id: number;
    title: string;
    authors: string[];
    journal: string | null;
    year: string | null;
    pmid: string | null;
    abstract: string | null;
    category_id: string | null;
    relevance_score: number;
    filter_passed: boolean;
}

export interface ReportCategory {
    id: string;
    name: string;
    article_count: number;
}

export interface ExecutionMetrics {
    articles_retrieved: number | null;
    articles_after_dedup: number | null;
    articles_after_filter: number | null;
    filter_config: string | null;
}

export interface WipArticle {
    id: number;
    title: string;
    authors: string[];
    journal: string | null;
    year: string | null;
    pmid: string | null;
    abstract: string | null;
    is_duplicate: boolean;
    duplicate_of_id: number | null;
    passed_semantic_filter: boolean | null;
    filter_rejection_reason: string | null;
    included_in_report: boolean;
    presentation_categories: string[];
}

export interface ExecutionDetail {
    // Execution info
    execution_id: string;
    stream_id: number;
    stream_name: string;
    execution_status: ExecutionStatus;
    run_type: RunType;
    started_at: string | null;
    completed_at: string | null;
    error: string | null;
    created_at: string;
    metrics: ExecutionMetrics | null;
    wip_articles: WipArticle[];
    // Report info (only for completed executions)
    report_id: number | null;
    report_name: string | null;
    approval_status: ApprovalStatus | null;
    article_count: number;
    executive_summary: string | null;
    categories: ReportCategory[];
    articles: ReportArticle[];
    approved_by: string | null;
    approved_at: string | null;
    rejection_reason: string | null;
}

export interface ScheduleConfig {
    enabled: boolean;
    frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
    anchor_day: string | null;
    preferred_time: string;
    timezone: string;
    lookback_days: number | null;
}

export interface LastExecution {
    id: string;
    stream_id: number;
    status: ExecutionStatus;
    run_type: RunType;
    started_at: string | null;
    completed_at: string | null;
    error: string | null;
    report_id: number | null;
    report_approval_status: ApprovalStatus | null;
    article_count: number | null;
}

export interface ScheduledStream {
    stream_id: number;
    stream_name: string;
    schedule_config: ScheduleConfig;
    next_scheduled_run: string | null;
    last_execution: LastExecution | null;
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
