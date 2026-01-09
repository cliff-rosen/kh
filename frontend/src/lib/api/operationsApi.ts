/**
 * Operations API - Pipeline execution queue and scheduler management
 */

import { api } from './index';
import settings from '../../config/settings';

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
    const token = localStorage.getItem('authToken');
    const url = `${settings.apiUrl}/api/operations/runs/${executionId}/stream`;

    // EventSource doesn't support headers, so we need to use fetch with ReadableStream
    const controller = new AbortController();

    (async () => {
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'text/event-stream',
                    'Authorization': `Bearer ${token}`,
                },
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('No response body');
            }

            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    onComplete?.();
                    break;
                }

                buffer += decoder.decode(value, { stream: true });

                // Process complete SSE messages
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        try {
                            const event = JSON.parse(data) as RunStatusEvent;
                            onMessage(event);

                            // Check for completion
                            if (event.stage === 'completed' || event.stage === 'failed') {
                                onComplete?.();
                                controller.abort();
                                return;
                            }
                        } catch {
                            // Ignore parse errors (might be keepalive)
                        }
                    }
                }
            }
        } catch (error) {
            if ((error as Error).name !== 'AbortError') {
                onError?.(error as Event);
            }
        }
    })();

    // Return cleanup function
    return () => {
        controller.abort();
    };
}
