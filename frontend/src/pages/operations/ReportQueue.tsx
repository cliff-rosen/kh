/**
 * Report Queue - View and manage report approvals
 *
 * Route: /operations/reports
 * Features:
 * - Filter by status (pending/approved/rejected/all)
 * - Filter by stream
 * - Search
 * - Bulk actions
 */

import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
    FunnelIcon,
    MagnifyingGlassIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
} from '@heroicons/react/24/outline';

type ApprovalStatus = 'awaiting_approval' | 'approved' | 'rejected';

interface ReportItem {
    report_id: number;
    report_name: string;
    stream_id: number;
    stream_name: string;
    article_count: number;
    run_type: 'scheduled' | 'manual' | 'test';
    approval_status: ApprovalStatus;
    created_at: string;
    approved_by?: string;
    approved_at?: string;
    rejection_reason?: string;
    // New schema fields
    pipeline_execution_id: string;  // UUID linking to pipeline_executions
}

// Mock data - reports only exist after successful pipeline completion
const mockReports: ReportItem[] = [
    { report_id: 101, report_name: '2024.01.15', stream_id: 1, stream_name: 'Oncology Weekly', article_count: 47, run_type: 'scheduled', approval_status: 'awaiting_approval', created_at: '2024-01-15T10:00:00Z', pipeline_execution_id: 'exec-001' },
    { report_id: 102, report_name: '2024.01.15', stream_id: 2, stream_name: 'Cardio Monthly', article_count: 123, run_type: 'manual', approval_status: 'awaiting_approval', created_at: '2024-01-15T08:00:00Z', pipeline_execution_id: 'exec-002' },
    { report_id: 103, report_name: '2024.01.14', stream_id: 3, stream_name: 'Regulatory Updates', article_count: 18, run_type: 'scheduled', approval_status: 'awaiting_approval', created_at: '2024-01-14T09:00:00Z', pipeline_execution_id: 'exec-006' },
    { report_id: 100, report_name: '2024.01.14', stream_id: 1, stream_name: 'Oncology Weekly', article_count: 52, run_type: 'scheduled', approval_status: 'approved', created_at: '2024-01-14T10:00:00Z', approved_by: 'admin@example.com', approved_at: '2024-01-14T11:30:00Z', pipeline_execution_id: 'exec-007' },
    { report_id: 99, report_name: '2024.01.13', stream_id: 4, stream_name: 'Neuro Research', article_count: 31, run_type: 'scheduled', approval_status: 'approved', created_at: '2024-01-13T10:00:00Z', approved_by: 'admin@example.com', approved_at: '2024-01-13T12:00:00Z', pipeline_execution_id: 'exec-004' },
    { report_id: 98, report_name: '2024.01.12', stream_id: 5, stream_name: 'Rare Disease', article_count: 8, run_type: 'manual', approval_status: 'rejected', created_at: '2024-01-12T14:00:00Z', approved_by: 'admin@example.com', approved_at: '2024-01-12T15:00:00Z', rejection_reason: 'Too few articles - source query needs refinement', pipeline_execution_id: 'exec-008' },
];

const mockStreams = [
    { stream_id: 1, stream_name: 'Oncology Weekly' },
    { stream_id: 2, stream_name: 'Cardio Monthly' },
    { stream_id: 3, stream_name: 'Regulatory Updates' },
    { stream_id: 4, stream_name: 'Neuro Research' },
    { stream_id: 5, stream_name: 'Rare Disease' },
];

export default function ReportQueue() {
    const [searchParams, setSearchParams] = useSearchParams();
    const statusFilter = (searchParams.get('status') as ApprovalStatus | 'all') || 'all';
    const streamFilter = searchParams.get('stream') || 'all';
    const [searchQuery, setSearchQuery] = useState('');

    // Filter reports
    const filteredReports = mockReports.filter((report) => {
        if (statusFilter !== 'all' && report.approval_status !== statusFilter) return false;
        if (streamFilter !== 'all' && report.stream_id !== parseInt(streamFilter)) return false;
        if (searchQuery && !report.stream_name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
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

    const awaitingCount = mockReports.filter((r) => r.approval_status === 'awaiting_approval').length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Report Queue</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                        Review and approve reports before distribution · {awaitingCount} awaiting approval
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
                                    {status === 'awaiting_approval' ? 'Awaiting' : status.charAt(0).toUpperCase() + status.slice(1)}
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
                            {mockStreams.map((stream) => (
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

            {/* Reports Table */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
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

                {/* Pagination */}
                <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Showing {filteredReports.length} of {mockReports.length} reports
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
