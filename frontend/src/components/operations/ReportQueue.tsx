/**
 * Report Queue - View and manage report approvals
 *
 * Route: /operations/reports
 * Features:
 * - Filter by status (awaiting_approval/approved/rejected/all)
 * - Filter by stream
 * - Search
 */

import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
    FunnelIcon,
    MagnifyingGlassIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    ArrowPathIcon,
} from '@heroicons/react/24/outline';
import {
    getReportQueue,
    type ReportQueueItem,
    type StreamOption,
    type ApprovalStatus,
} from '../../lib/api/operationsApi';

export default function ReportQueue() {
    const [searchParams, setSearchParams] = useSearchParams();
    const statusFilter = (searchParams.get('status') as ApprovalStatus | 'all') || 'all';
    const streamFilter = searchParams.get('stream') || 'all';
    const [searchQuery, setSearchQuery] = useState('');

    const [reports, setReports] = useState<ReportQueueItem[]>([]);
    const [streams, setStreams] = useState<StreamOption[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch reports
    useEffect(() => {
        async function fetchReports() {
            setLoading(true);
            setError(null);
            try {
                const response = await getReportQueue({
                    status: statusFilter,
                    stream_id: streamFilter !== 'all' ? parseInt(streamFilter) : undefined,
                });
                setReports(response.reports);
                setStreams(response.streams);
                setTotal(response.total);
            } catch (err) {
                setError('Failed to load reports');
                console.error(err);
            } finally {
                setLoading(false);
            }
        }
        fetchReports();
    }, [statusFilter, streamFilter]);

    // Filter reports by search query (client-side)
    const filteredReports = reports.filter((report) => {
        if (searchQuery && !report.stream_name.toLowerCase().includes(searchQuery.toLowerCase())) {
            return false;
        }
        return true;
    });

    const setFilter = (key: string, value: string) => {
        const newParams = new URLSearchParams(searchParams);
        if (value === 'all') {
            newParams.delete(key);
        } else {
            newParams.set(key, value);
        }
        setSearchParams(newParams);
    };

    const awaitingCount = reports.filter((r) => r.approval_status === 'awaiting_approval').length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Report Queue</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                        Review and approve reports before distribution
                        {awaitingCount > 0 && ` · ${awaitingCount} awaiting approval`}
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <div className="flex flex-wrap items-center gap-4">
                    {/* Status Filter */}
                    <div className="flex items-center gap-2">
                        <FunnelIcon className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-600 dark:text-gray-400">Status:</span>
                        <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
                            {(['all', 'awaiting_approval', 'approved', 'rejected'] as const).map((status) => (
                                <button
                                    key={status}
                                    onClick={() => setFilter('status', status)}
                                    className={`px-3 py-1.5 text-sm ${
                                        statusFilter === status
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                                    }`}
                                >
                                    {status === 'awaiting_approval' ? 'Awaiting' : status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
                                    {status === 'awaiting_approval' && awaitingCount > 0 && (
                                        <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-yellow-500 text-white">
                                            {awaitingCount}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Stream Filter */}
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Stream:</span>
                        <select
                            value={streamFilter}
                            onChange={(e) => setFilter('stream', e.target.value)}
                            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                            <option value="all">All Streams</option>
                            {streams.map((stream) => (
                                <option key={stream.stream_id} value={stream.stream_id}>
                                    {stream.stream_name}
                                </option>
                            ))}
                        </select>
                        {streamFilter !== 'all' && (
                            <button
                                onClick={() => setFilter('stream', 'all')}
                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                            >
                                Clear
                            </button>
                        )}
                    </div>

                    {/* Search */}
                    <div className="flex-1 min-w-[200px]">
                        <div className="relative">
                            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search streams..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Loading / Error States */}
            {loading && (
                <div className="flex items-center justify-center py-12">
                    <ArrowPathIcon className="h-8 w-8 text-gray-400 animate-spin" />
                </div>
            )}

            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
                    {error}
                </div>
            )}

            {/* Reports Table */}
            {!loading && !error && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                    {filteredReports.length === 0 ? (
                        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                            No reports found
                        </div>
                    ) : (
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-900">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Status
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Stream / Report
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Run Type
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Articles
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Created
                                    </th>
                                    <th className="px-4 py-3"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {filteredReports.map((report) => (
                                    <tr key={report.report_id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                        <td className="px-4 py-4">
                                            <StatusBadge status={report.approval_status} />
                                        </td>
                                        <td className="px-4 py-4">
                                            <div>
                                                <button
                                                    onClick={() => setFilter('stream', String(report.stream_id))}
                                                    className="font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:underline text-left"
                                                    title={`Filter by ${report.stream_name}`}
                                                >
                                                    {report.stream_name}
                                                </button>
                                                <p className="text-sm text-gray-500 dark:text-gray-400">{report.report_name}</p>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <span className="capitalize text-sm text-gray-700 dark:text-gray-300">{report.run_type}</span>
                                        </td>
                                        <td className="px-4 py-4">
                                            <span className="text-sm text-gray-900 dark:text-white">{report.article_count}</span>
                                        </td>
                                        <td className="px-4 py-4">
                                            <span className="text-sm text-gray-500 dark:text-gray-400">
                                                {new Date(report.created_at).toLocaleDateString()}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4">
                                            <Link
                                                to={`/operations/reports/${report.report_id}`}
                                                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                            >
                                                Review →
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {/* Pagination */}
                    <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Showing {filteredReports.length} of {total} reports
                        </p>
                        <div className="flex items-center gap-2">
                            <button className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50" disabled>
                                <ChevronLeftIcon className="h-5 w-5 text-gray-400" />
                            </button>
                            <span className="text-sm text-gray-600 dark:text-gray-400">Page 1 of 1</span>
                            <button className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50" disabled>
                                <ChevronRightIcon className="h-5 w-5 text-gray-400" />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function StatusBadge({ status }: { status: ApprovalStatus }) {
    const config = {
        awaiting_approval: { bg: 'bg-yellow-100 dark:bg-yellow-900', text: 'text-yellow-800 dark:text-yellow-200', label: 'Awaiting Approval' },
        approved: { bg: 'bg-green-100 dark:bg-green-900', text: 'text-green-800 dark:text-green-200', label: 'Approved' },
        rejected: { bg: 'bg-red-100 dark:bg-red-900', text: 'text-red-800 dark:text-red-200', label: 'Rejected' },
    };
    const { bg, text, label } = config[status];
    return <span className={`px-2 py-1 text-xs font-medium rounded-full ${bg} ${text}`}>{label}</span>;
}
