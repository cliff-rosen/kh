/**
 * Operations API - Pipeline execution queue and scheduler management
 */

import { api } from './index';

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
