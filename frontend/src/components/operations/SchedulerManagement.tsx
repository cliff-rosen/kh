/**
 * Scheduler Management - Configure and monitor stream schedules
 *
 * Route: /operations/scheduler
 * Features:
 * - View all scheduled streams with their last execution status
 * - Enable/disable schedules
 * - Edit schedule config (frequency, time, timezone)
 * - Monitor running jobs
 */

import { useState, useEffect } from 'react';
import {
    PlayIcon,
    PauseIcon,
    Cog6ToothIcon,
    CheckCircleIcon,
    XCircleIcon,
    ArrowPathIcon,
} from '@heroicons/react/24/outline';
import {
    getScheduledStreams,
    updateStreamSchedule,
    type UpdateScheduleRequest,
} from '../../lib/api/operationsApi';
import type { ScheduleConfig, LastExecution, ScheduledStream } from '../../types/research-stream';
import type { ApprovalStatus } from '../../types/report';

type Frequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';

export default function SchedulerManagement() {
    const [streams, setStreams] = useState<ScheduledStream[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editingStream, setEditingStream] = useState<number | null>(null);
    const [saving, setSaving] = useState(false);

    // Fetch scheduled streams
    useEffect(() => {
        async function fetchStreams() {
            setLoading(true);
            setError(null);
            try {
                const data = await getScheduledStreams();
                setStreams(data);
            } catch (err) {
                setError('Failed to load scheduled streams');
                console.error(err);
            } finally {
                setLoading(false);
            }
        }
        fetchStreams();
    }, []);

    const enabledCount = streams.filter(s => s.schedule_config?.enabled).length;
    const runningStreams = streams.filter(s => s.last_execution?.status === 'running');
    const runningCount = runningStreams.length;

    const handleSaveSchedule = async (streamId: number, updates: UpdateScheduleRequest) => {
        setSaving(true);
        try {
            const updated = await updateStreamSchedule(streamId, updates);
            setStreams(prev => prev.map(s => s.stream_id === streamId ? updated : s));
            setEditingStream(null);
        } catch (err) {
            console.error('Failed to update schedule:', err);
            setError('Failed to update schedule');
        } finally {
            setSaving(false);
        }
    };

    const handleToggleEnabled = async (streamId: number, enabled: boolean) => {
        try {
            const updated = await updateStreamSchedule(streamId, { enabled });
            setStreams(prev => prev.map(s => s.stream_id === streamId ? updated : s));
        } catch (err) {
            console.error('Failed to toggle schedule:', err);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <ArrowPathIcon className="h-8 w-8 text-gray-400 animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
                {error}
            </div>
        );
    }

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

            {/* Empty State */}
            {streams.length === 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center text-gray-500 dark:text-gray-400">
                    No scheduled streams found. Configure scheduling in stream settings.
                </div>
            )}

            {/* Schedules Table */}
            {streams.length > 0 && (
                <SchedulesTab
                    streams={streams}
                    editingStream={editingStream}
                    setEditingStream={setEditingStream}
                    onSaveSchedule={handleSaveSchedule}
                    onToggleEnabled={handleToggleEnabled}
                    saving={saving}
                />
            )}
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
    onSaveSchedule,
    onToggleEnabled,
    saving,
}: {
    streams: ScheduledStream[];
    editingStream: number | null;
    setEditingStream: (id: number | null) => void;
    onSaveSchedule: (streamId: number, updates: UpdateScheduleRequest) => Promise<void>;
    onToggleEnabled: (streamId: number, enabled: boolean) => Promise<void>;
    saving: boolean;
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
                                    <div className={`w-2 h-2 rounded-full ${stream.schedule_config?.enabled ? 'bg-green-500' : 'bg-gray-400'}`} />
                                    <a
                                        href={`/operations/reports?stream=${stream.stream_id}`}
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
                                        onSave={(updates) => onSaveSchedule(stream.stream_id, updates)}
                                        onCancel={() => setEditingStream(null)}
                                        saving={saving}
                                    />
                                ) : (
                                    <div className="text-sm">
                                        <p className="text-gray-900 dark:text-white capitalize">{stream.schedule_config?.frequency || 'weekly'}</p>
                                        <p className="text-gray-500 dark:text-gray-400">
                                            {stream.schedule_config?.anchor_day && `${stream.schedule_config.anchor_day}, `}
                                            {stream.schedule_config?.preferred_time || '08:00'} ({stream.schedule_config?.timezone || 'UTC'})
                                        </p>
                                    </div>
                                )}
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
                                {stream.last_execution?.status === 'running'
                                    ? <span className="text-purple-600 dark:text-purple-400">Running now...</span>
                                    : stream.schedule_config?.enabled
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
                                        onClick={() => onToggleEnabled(stream.stream_id, !stream.schedule_config?.enabled)}
                                        className={`p-1.5 ${stream.schedule_config?.enabled ? 'text-gray-400 hover:text-yellow-600' : 'text-yellow-600'}`}
                                        title={stream.schedule_config?.enabled ? 'Pause Schedule' : 'Resume Schedule'}
                                    >
                                        {stream.schedule_config?.enabled ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
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

function LastExecutionCell({ execution }: { execution: LastExecution | null }) {
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
                        <ApprovalBadge status={execution.report_approval_status as ApprovalStatus} />
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

function ApprovalBadge({ status }: { status: ApprovalStatus | null | undefined }) {
    if (!status) return null;

    const config: Record<ApprovalStatus, { bg: string; text: string; label: string }> = {
        awaiting_approval: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300', label: 'Awaiting Approval' },
        approved: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', label: 'Approved' },
        rejected: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', label: 'Rejected' },
    };

    const style = config[status];
    if (!style) return null;

    const { bg, text, label } = style;
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
    saving,
}: {
    config: ScheduleConfig | null;
    onSave: (updates: UpdateScheduleRequest) => Promise<void>;
    onCancel: () => void;
    saving: boolean;
}) {
    const [frequency, setFrequency] = useState<Frequency>((config?.frequency as Frequency) || 'weekly');
    const [anchorDay, setAnchorDay] = useState(config?.anchor_day || '');
    const [time, setTime] = useState(config?.preferred_time || '08:00');
    const [timezone, setTimezone] = useState(config?.timezone || 'UTC');

    const handleSave = () => {
        onSave({
            frequency,
            anchor_day: anchorDay || undefined,
            preferred_time: time,
            timezone,
        });
    };

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
                <button onClick={onCancel} className="px-2 py-1 text-sm text-gray-600 hover:text-gray-900" disabled={saving}>Cancel</button>
                <button onClick={handleSave} className="px-2 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50" disabled={saving}>
                    {saving ? 'Saving...' : 'Save'}
                </button>
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
