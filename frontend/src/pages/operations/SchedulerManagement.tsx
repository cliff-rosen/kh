/**
 * Scheduler Management - Configure and monitor stream schedules
 *
 * Route: /operations/scheduler
 * Features:
 * - View all scheduled streams with their last execution status
 * - Enable/disable schedules
 * - Edit schedule config (frequency, time, timezone)
 * - Monitor running jobs
 * - Trigger manual runs
 */

import { useState } from 'react';
import {
    PlayIcon,
    PauseIcon,
    Cog6ToothIcon,
    CheckCircleIcon,
    XCircleIcon,
} from '@heroicons/react/24/outline';

// === Types matching new schema ===

type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed';
type RunType = 'scheduled' | 'manual' | 'test';
type Frequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';
type ApprovalStatus = 'awaiting_approval' | 'approved' | 'rejected';

interface PipelineExecution {
    id: string;  // UUID
    stream_id: number;
    status: ExecutionStatus;
    run_type: RunType;
    started_at: string | null;
    completed_at: string | null;
    error: string | null;
    report_id: number | null;
    // Denormalized for convenience in UI
    report_approval_status?: ApprovalStatus;
    article_count?: number;
}

interface ScheduleConfig {
    enabled: boolean;
    frequency: Frequency;
    anchor_day: string | null;
    preferred_time: string;
    timezone: string;
    lookback_days?: number;
}

interface ScheduledStream {
    stream_id: number;
    stream_name: string;
    schedule_config: ScheduleConfig;
    next_scheduled_run: string | null;
    last_execution: PipelineExecution | null;  // The key change: execution state comes from here
}

// === Mock data matching new schema ===

const mockStreams: ScheduledStream[] = [
    {
        stream_id: 1,
        stream_name: 'Oncology Weekly',
        schedule_config: { enabled: true, frequency: 'weekly', anchor_day: 'monday', preferred_time: '08:00', timezone: 'America/New_York' },
        next_scheduled_run: '2024-01-22T08:00:00-05:00',
        last_execution: {
            id: 'exec-001',
            stream_id: 1,
            status: 'completed',
            run_type: 'scheduled',
            started_at: '2024-01-15T08:00:00-05:00',
            completed_at: '2024-01-15T08:45:00-05:00',
            error: null,
            report_id: 101,
            report_approval_status: 'awaiting_approval',
            article_count: 52
        }
    },
    {
        stream_id: 2,
        stream_name: 'Cardio Monthly',
        schedule_config: { enabled: true, frequency: 'monthly', anchor_day: '1', preferred_time: '09:00', timezone: 'America/Chicago' },
        next_scheduled_run: '2024-02-01T09:00:00-06:00',
        last_execution: {
            id: 'exec-002',
            stream_id: 2,
            status: 'completed',
            run_type: 'scheduled',
            started_at: '2024-01-01T09:00:00-06:00',
            completed_at: '2024-01-01T10:23:00-06:00',
            error: null,
            report_id: 98,
            report_approval_status: 'approved',
            article_count: 187
        }
    },
    {
        stream_id: 3,
        stream_name: 'Regulatory Updates',
        schedule_config: { enabled: true, frequency: 'daily', anchor_day: null, preferred_time: '06:00', timezone: 'UTC' },
        next_scheduled_run: null,  // null because currently running
        last_execution: {
            id: 'exec-003',
            stream_id: 3,
            status: 'running',
            run_type: 'scheduled',
            started_at: '2024-01-16T06:00:00Z',
            completed_at: null,
            error: null,
            report_id: null
        }
    },
    {
        stream_id: 4,
        stream_name: 'Neuro Research',
        schedule_config: { enabled: false, frequency: 'weekly', anchor_day: 'wednesday', preferred_time: '10:00', timezone: 'America/Los_Angeles' },
        next_scheduled_run: null,  // null because paused
        last_execution: {
            id: 'exec-004',
            stream_id: 4,
            status: 'completed',
            run_type: 'scheduled',
            started_at: '2024-01-10T10:00:00-08:00',
            completed_at: '2024-01-10T10:35:00-08:00',
            error: null,
            report_id: 95,
            report_approval_status: 'approved',
            article_count: 28
        }
    },
    {
        stream_id: 5,
        stream_name: 'Rare Disease Monitor',
        schedule_config: { enabled: true, frequency: 'biweekly', anchor_day: 'friday', preferred_time: '07:00', timezone: 'Europe/London' },
        next_scheduled_run: '2024-01-26T07:00:00Z',
        last_execution: {
            id: 'exec-005',
            stream_id: 5,
            status: 'failed',
            run_type: 'scheduled',
            started_at: '2024-01-12T07:00:00Z',
            completed_at: '2024-01-12T07:15:00Z',
            error: 'PubMed API timeout after 3 retries',
            report_id: null
        }
    },
    {
        stream_id: 6,
        stream_name: 'New Stream (Never Run)',
        schedule_config: { enabled: true, frequency: 'weekly', anchor_day: 'tuesday', preferred_time: '09:00', timezone: 'UTC' },
        next_scheduled_run: '2024-01-23T09:00:00Z',
        last_execution: null  // Never run
    },
];

export default function SchedulerManagement() {
    const [editingStream, setEditingStream] = useState<number | null>(null);

    const enabledCount = mockStreams.filter(s => s.schedule_config.enabled).length;
    // Running streams are those with last_execution.status === 'running'
    const runningStreams = mockStreams.filter(s => s.last_execution?.status === 'running');
    const runningCount = runningStreams.length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Scheduler</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                        Configure when streams run · {enabledCount} active schedules
                    </p>
                </div>
            </div>

            {/* Running Jobs Alert */}
            {runningCount > 0 && (
                <RunningJobsAlert streams={runningStreams} />
            )}

            {/* Schedules Table */}
            <SchedulesTab
                streams={mockStreams}
                editingStream={editingStream}
                setEditingStream={setEditingStream}
            />
        </div>
    );
}

function RunningJobsAlert({ streams }: { streams: ScheduledStream[] }) {
    return (
        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
                <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span>
                </span>
                <span className="font-medium text-purple-900 dark:text-purple-100">
                    {streams.length} job{streams.length > 1 ? 's' : ''} running
                </span>
            </div>
            <div className="space-y-2">
                {streams.map((stream) => (
                    <div key={stream.stream_id} className="flex items-center justify-between text-sm">
                        <span className="text-purple-800 dark:text-purple-200">{stream.stream_name}</span>
                        <div className="flex items-center gap-4 text-purple-600 dark:text-purple-300">
                            <span className="capitalize">{stream.last_execution?.run_type}</span>
                            <span>
                                Started {stream.last_execution?.started_at
                                    ? formatRelativeTime(stream.last_execution.started_at)
                                    : 'recently'}
                            </span>
                            <button className="text-red-600 dark:text-red-400 hover:underline">Cancel</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function SchedulesTab({
    streams,
    editingStream,
    setEditingStream,
}: {
    streams: ScheduledStream[];
    editingStream: number | null;
    setEditingStream: (id: number | null) => void;
}) {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Stream</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Schedule</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Next Run</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Last Execution</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {streams.map((stream) => (
                        <tr key={stream.stream_id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                            <td className="px-4 py-4">
                                <div className="flex items-center gap-3">
                                    <div className={`w-2 h-2 rounded-full ${stream.schedule_config.enabled ? 'bg-green-500' : 'bg-gray-400'}`} />
                                    <a
                                        href={`/operations?stream=${stream.stream_id}`}
                                        className="font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                                        title="View reports for this stream"
                                    >
                                        {stream.stream_name}
                                    </a>
                                </div>
                            </td>
                            <td className="px-4 py-4">
                                {editingStream === stream.stream_id ? (
                                    <ScheduleEditor
                                        config={stream.schedule_config}
                                        onSave={() => setEditingStream(null)}
                                        onCancel={() => setEditingStream(null)}
                                    />
                                ) : (
                                    <div className="text-sm">
                                        <p className="text-gray-900 dark:text-white capitalize">{stream.schedule_config.frequency}</p>
                                        <p className="text-gray-500 dark:text-gray-400">
                                            {stream.schedule_config.anchor_day && `${stream.schedule_config.anchor_day}, `}
                                            {stream.schedule_config.preferred_time} ({stream.schedule_config.timezone})
                                        </p>
                                    </div>
                                )}
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
                                {stream.last_execution?.status === 'running'
                                    ? <span className="text-purple-600 dark:text-purple-400">Running now...</span>
                                    : stream.schedule_config.enabled
                                        ? (stream.next_scheduled_run ? formatRelativeTime(stream.next_scheduled_run) : 'Calculating...')
                                        : <span className="text-gray-400">Paused</span>
                                }
                            </td>
                            <td className="px-4 py-4">
                                <LastExecutionCell execution={stream.last_execution} />
                            </td>
                            <td className="px-4 py-4">
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setEditingStream(stream.stream_id)}
                                        className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                                        title="Edit Schedule"
                                    >
                                        <Cog6ToothIcon className="h-5 w-5" />
                                    </button>
                                    <button
                                        className="p-1.5 text-gray-400 hover:text-green-600 dark:hover:text-green-400"
                                        title="Run Now"
                                        disabled={stream.last_execution?.status === 'running'}
                                    >
                                        <PlayIcon className="h-5 w-5" />
                                    </button>
                                    <button
                                        className={`p-1.5 ${stream.schedule_config.enabled ? 'text-gray-400 hover:text-yellow-600' : 'text-yellow-600'}`}
                                        title={stream.schedule_config.enabled ? 'Pause Schedule' : 'Resume Schedule'}
                                    >
                                        {stream.schedule_config.enabled ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function LastExecutionCell({ execution }: { execution: PipelineExecution | null }) {
    if (!execution) {
        return <span className="text-sm text-gray-400">Never run</span>;
    }

    if (execution.status === 'running') {
        return (
            <div className="text-sm">
                <div className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                    </span>
                    <span>Running...</span>
                </div>
                {execution.started_at && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Started {formatRelativeTime(execution.started_at)}
                    </p>
                )}
            </div>
        );
    }

    if (execution.status === 'failed') {
        return (
            <div className="text-sm">
                <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                    <XCircleIcon className="h-4 w-4" />
                    <span>Failed</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-[200px]" title={execution.error || undefined}>
                    {execution.error || 'Unknown error'}
                </p>
            </div>
        );
    }

    if (execution.status === 'completed' && execution.report_id) {
        return (
            <div className="text-sm">
                <a
                    href={`/operations/reports/${execution.report_id}`}
                    className="flex items-center gap-1.5 hover:underline"
                >
                    <CheckCircleIcon className="h-4 w-4 text-green-500" />
                    <span className="text-gray-900 dark:text-white">{execution.article_count ?? '?'} articles</span>
                    {execution.report_approval_status && (
                        <ApprovalBadge status={execution.report_approval_status} />
                    )}
                </a>
                {execution.completed_at && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {formatRelativeTime(execution.completed_at)}
                    </p>
                )}
            </div>
        );
    }

    if (execution.status === 'pending') {
        return (
            <div className="text-sm text-gray-500 dark:text-gray-400">
                Queued...
            </div>
        );
    }

    // Fallback for completed without report (shouldn't happen normally)
    return (
        <span className="text-sm text-gray-500 dark:text-gray-400">
            {execution.completed_at ? formatRelativeTime(execution.completed_at) : 'Unknown'}
        </span>
    );
}

function ApprovalBadge({ status }: { status: ApprovalStatus }) {
    const config = {
        awaiting_approval: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300', label: 'Awaiting Approval' },
        approved: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', label: 'Approved' },
        rejected: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', label: 'Rejected' },
    };
    const { bg, text, label } = config[status];
    return (
        <span className={`px-1.5 py-0.5 text-xs rounded ${bg} ${text}`}>
            {label}
        </span>
    );
}

function ScheduleEditor({
    config,
    onSave,
    onCancel,
}: {
    config: ScheduledStream['schedule_config'];
    onSave: () => void;
    onCancel: () => void;
}) {
    const [frequency, setFrequency] = useState(config.frequency);
    const [anchorDay, setAnchorDay] = useState(config.anchor_day || '');
    const [time, setTime] = useState(config.preferred_time);
    const [timezone, setTimezone] = useState(config.timezone);

    return (
        <div className="space-y-2 p-2 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <div className="grid grid-cols-2 gap-2">
                <select
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as Frequency)}
                    className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800"
                >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Biweekly</option>
                    <option value="monthly">Monthly</option>
                </select>
                {(frequency === 'weekly' || frequency === 'biweekly') && (
                    <select
                        value={anchorDay}
                        onChange={(e) => setAnchorDay(e.target.value)}
                        className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800"
                    >
                        {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => (
                            <option key={day} value={day} className="capitalize">{day}</option>
                        ))}
                    </select>
                )}
                {frequency === 'monthly' && (
                    <select
                        value={anchorDay}
                        onChange={(e) => setAnchorDay(e.target.value)}
                        className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800"
                    >
                        {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                            <option key={day} value={day}>{day}{getOrdinalSuffix(day)}</option>
                        ))}
                    </select>
                )}
            </div>
            <div className="grid grid-cols-2 gap-2">
                <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800"
                />
                <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800"
                >
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">Eastern</option>
                    <option value="America/Chicago">Central</option>
                    <option value="America/Denver">Mountain</option>
                    <option value="America/Los_Angeles">Pacific</option>
                    <option value="Europe/London">London</option>
                </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
                <button onClick={onCancel} className="px-2 py-1 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
                <button onClick={onSave} className="px-2 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
            </div>
        </div>
    );
}

function formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMins = Math.round(diffMs / 60000);
    const diffHours = Math.round(diffMs / 3600000);
    const diffDays = Math.round(diffMs / 86400000);

    if (diffMins < 0) {
        // Past
        if (diffMins > -60) return `${-diffMins} min ago`;
        if (diffHours > -24) return `${-diffHours} hours ago`;
        return `${-diffDays} days ago`;
    } else {
        // Future
        if (diffMins < 60) return `in ${diffMins} min`;
        if (diffHours < 24) return `in ${diffHours} hours`;
        return `in ${diffDays} days`;
    }
}

function getOrdinalSuffix(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
}
