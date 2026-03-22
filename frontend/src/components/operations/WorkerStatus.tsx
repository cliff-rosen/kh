/**
 * Worker Status - Monitor and control the background worker process.
 *
 * Shows heartbeat status, active jobs, last poll summary.
 * Controls: Pause/Resume (toggle job dispatch), Shutdown (stop process).
 * Polls worker status every 10 seconds.
 */

import { useState, useEffect, useCallback } from 'react';
import {
    ArrowPathIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon,
    XCircleIcon,
    QuestionMarkCircleIcon,
    ServerIcon,
    PauseIcon,
    PlayIcon,
} from '@heroicons/react/24/outline';
import {
    getWorkerStatus,
    shutdownWorker,
    pauseWorker,
    resumeWorker,
    type WorkerStatusResponse,
} from '../../lib/api/operationsApi';

const POLL_INTERVAL_MS = 10_000;

function StatusIcon({ status }: { status: string }) {
    switch (status) {
        case 'running':
            return <CheckCircleIcon className="h-6 w-6 text-green-500" />;
        case 'paused':
            return <PauseIcon className="h-6 w-6 text-amber-500" />;
        case 'stopping':
            return <ExclamationTriangleIcon className="h-6 w-6 text-yellow-500" />;
        case 'down':
            return <XCircleIcon className="h-6 w-6 text-red-500" />;
        default:
            return <QuestionMarkCircleIcon className="h-6 w-6 text-gray-400" />;
    }
}

function StatusBadge({ status }: { status: string }) {
    const colors: Record<string, string> = {
        running: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
        paused: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
        stopping: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
        down: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
        unknown: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
    };
    return (
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[status] || colors.unknown}`}>
            {status.toUpperCase()}
        </span>
    );
}

function formatUptime(startedAt: string | null): string {
    if (!startedAt) return '--';
    const start = new Date(startedAt + 'Z');
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const hours = Math.floor(diffMs / 3_600_000);
    const minutes = Math.floor((diffMs % 3_600_000) / 60_000);
    if (hours > 24) {
        const days = Math.floor(hours / 24);
        return `${days}d ${hours % 24}h`;
    }
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatAgo(seconds: number | null): string {
    if (seconds === null) return '--';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s ago`;
}

export default function WorkerStatus() {
    const [status, setStatus] = useState<WorkerStatusResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionMessage, setActionMessage] = useState<string | null>(null);

    const fetchStatus = useCallback(async () => {
        try {
            const data = await getWorkerStatus();
            setStatus(data);
            setError(null);
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to fetch worker status');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [fetchStatus]);

    const handlePauseResume = async () => {
        if (!status) return;
        const isPaused = status.status === 'paused';

        try {
            const result = isPaused ? await resumeWorker() : await pauseWorker();
            setActionMessage(result.message);
            setTimeout(() => setActionMessage(null), 5000);
            fetchStatus();
        } catch (err: any) {
            setError(err.response?.data?.detail || `Failed to ${isPaused ? 'resume' : 'pause'} worker`);
        }
    };

    const handleRestart = async () => {
        if (!confirm('Restart the worker? Active jobs will be given 30 seconds to finish.')) return;

        try {
            const result = await shutdownWorker();
            setActionMessage(result.message);
            fetchStatus();
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to send shutdown command');
        }
    };

    if (loading && !status) {
        return (
            <div className="flex items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                <ArrowPathIcon className="h-5 w-5 animate-spin mr-2" />
                Loading worker status...
            </div>
        );
    }

    const s = status;
    const isAlive = s && (s.status === 'running' || s.status === 'paused');
    const isPaused = s?.status === 'paused';

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <ServerIcon className="h-6 w-6 text-gray-500 dark:text-gray-400" />
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Worker Process</h2>
                    {s && <StatusBadge status={s.status} />}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={fetchStatus}
                        className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
                        title="Refresh"
                    >
                        <ArrowPathIcon className="h-4 w-4" />
                    </button>
                    {isAlive && (
                        <>
                            <button
                                onClick={handlePauseResume}
                                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white rounded-md transition-colors ${
                                    isPaused
                                        ? 'bg-green-600 hover:bg-green-700'
                                        : 'bg-amber-600 hover:bg-amber-700'
                                }`}
                            >
                                {isPaused ? (
                                    <><PlayIcon className="h-4 w-4" /> Resume</>
                                ) : (
                                    <><PauseIcon className="h-4 w-4" /> Pause</>
                                )}
                            </button>
                            <button
                                onClick={handleRestart}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
                            >
                                <ArrowPathIcon className="h-4 w-4" />
                                Restart
                            </button>
                        </>
                    )}
                </div>
            </div>

            {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-700 dark:text-red-400">
                    {error}
                </div>
            )}

            {actionMessage && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md text-sm text-blue-700 dark:text-blue-400">
                    {actionMessage}
                </div>
            )}

            {s && s.status !== 'unknown' && (
                <>
                    {/* Status Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-1">
                                <StatusIcon status={s.status} />
                                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</span>
                            </div>
                            <p className="text-lg font-semibold text-gray-900 dark:text-white capitalize">{s.status}</p>
                        </div>

                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Active Jobs</p>
                            <p className="text-lg font-semibold text-gray-900 dark:text-white">
                                {s.active_jobs} active / {s.max_concurrent_jobs} max
                            </p>
                        </div>

                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Last Heartbeat</p>
                            <p className="text-lg font-semibold text-gray-900 dark:text-white">
                                {formatAgo(s.seconds_since_heartbeat)}
                            </p>
                        </div>

                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Uptime</p>
                            <p className="text-lg font-semibold text-gray-900 dark:text-white">
                                {formatUptime(s.started_at)}
                            </p>
                        </div>
                    </div>

                    {/* Details */}
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                            <h3 className="text-sm font-medium text-gray-900 dark:text-white">Details</h3>
                        </div>
                        <dl className="divide-y divide-gray-200 dark:divide-gray-700">
                            <div className="px-4 py-3 flex justify-between text-sm">
                                <dt className="text-gray-500 dark:text-gray-400">Worker ID</dt>
                                <dd className="font-mono text-gray-900 dark:text-white">{s.worker_id || '--'}</dd>
                            </div>
                            <div className="px-4 py-3 flex justify-between text-sm">
                                <dt className="text-gray-500 dark:text-gray-400">Version</dt>
                                <dd className="font-mono text-gray-900 dark:text-white">{s.version || 'dev'}</dd>
                            </div>
                            <div className="px-4 py-3 flex justify-between text-sm">
                                <dt className="text-gray-500 dark:text-gray-400">Poll Interval</dt>
                                <dd className="text-gray-900 dark:text-white">{s.poll_interval_seconds}s</dd>
                            </div>
                            <div className="px-4 py-3 flex justify-between text-sm">
                                <dt className="text-gray-500 dark:text-gray-400">Started At</dt>
                                <dd className="text-gray-900 dark:text-white">
                                    {s.started_at ? new Date(s.started_at + 'Z').toLocaleString() : '--'}
                                </dd>
                            </div>
                        </dl>
                    </div>

                    {/* Last Poll Summary */}
                    {s.last_poll_summary && (
                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                                <h3 className="text-sm font-medium text-gray-900 dark:text-white">Last Poll Cycle</h3>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4">
                                <div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">Pending Found</p>
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">{s.last_poll_summary.pending_found}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">Scheduled Found</p>
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">{s.last_poll_summary.scheduled_found}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">Active Jobs</p>
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">{s.last_poll_summary.active_jobs}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">Dispatched</p>
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">{s.last_poll_summary.dispatched}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}

            {s && s.status === 'down' && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <XCircleIcon className="h-12 w-12 mx-auto mb-3 text-red-400" />
                    <p className="text-lg font-medium text-red-600 dark:text-red-400">Worker is down</p>
                    <p className="text-sm mt-1">Last heartbeat was {formatAgo(s.seconds_since_heartbeat)}.</p>
                    <p className="text-sm mt-2">In production, systemd should restart it automatically.</p>
                    <p className="text-sm">In dev, restart manually: <code className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">python -m worker.main</code></p>
                </div>
            )}

            {s && s.status === 'unknown' && (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    <QuestionMarkCircleIcon className="h-12 w-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                    <p className="text-lg font-medium">No worker data available</p>
                    <p className="text-sm mt-1">The worker_status table may not exist yet, or the worker has never run.</p>
                    <p className="text-sm mt-1 font-mono text-xs">Run: python migrations/add_worker_status_table.py</p>
                </div>
            )}
        </div>
    );
}
