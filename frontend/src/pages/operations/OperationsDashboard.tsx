/**
 * Operations Dashboard - Overview of platform operations
 *
 * Top-level nav: "Operations"
 * Route: /operations
 */

import { Link } from 'react-router-dom';
import {
    DocumentCheckIcon,
    ClockIcon,
    CheckCircleIcon,
    XCircleIcon,
    ExclamationTriangleIcon,
    PlayIcon,
} from '@heroicons/react/24/outline';

// Mock data - replace with API calls
const mockStats = {
    pendingReports: 3,
    approvedToday: 5,
    rejectedToday: 1,
    scheduledStreams: 12,
    runningJobs: 1,
    failedLastHour: 0,
};

const mockPendingReports = [
    { report_id: 101, stream_name: 'Oncology Weekly', article_count: 47, created_at: '2 hours ago', run_type: 'scheduled' },
    { report_id: 102, stream_name: 'Cardio Monthly', article_count: 123, created_at: '5 hours ago', run_type: 'manual' },
    { report_id: 103, stream_name: 'Regulatory Updates', article_count: 18, created_at: '1 day ago', run_type: 'scheduled' },
];

const mockRunningJobs = [
    { stream_id: 42, stream_name: 'Neuro Research', stage: 'categorize', progress: '35/47', started: '5 min ago' },
];

const mockUpcomingRuns = [
    { stream_id: 15, stream_name: 'Cardio Monthly', next_run: 'in 2 hours' },
    { stream_id: 23, stream_name: 'Oncology Weekly', next_run: 'tomorrow 8:00 AM' },
    { stream_id: 8, stream_name: 'Rare Disease Monitor', next_run: 'in 3 days' },
];

export default function OperationsDashboard() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Operations</h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1">Report approval and scheduler management</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <StatCard label="Pending Approval" value={mockStats.pendingReports} icon={DocumentCheckIcon} color="yellow" link="/operations/reports?status=pending" />
                <StatCard label="Approved Today" value={mockStats.approvedToday} icon={CheckCircleIcon} color="green" />
                <StatCard label="Rejected Today" value={mockStats.rejectedToday} icon={XCircleIcon} color="red" />
                <StatCard label="Scheduled Streams" value={mockStats.scheduledStreams} icon={ClockIcon} color="blue" link="/operations/scheduler" />
                <StatCard label="Running Now" value={mockStats.runningJobs} icon={PlayIcon} color="purple" />
                <StatCard label="Failed (1hr)" value={mockStats.failedLastHour} icon={ExclamationTriangleIcon} color={mockStats.failedLastHour > 0 ? 'red' : 'gray'} />
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Pending Reports */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Reports Pending Approval</h2>
                        <Link to="/operations/reports?status=pending" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">View all</Link>
                    </div>
                    {mockPendingReports.length === 0 ? (
                        <p className="text-gray-500 dark:text-gray-400 text-center py-8">No reports pending approval</p>
                    ) : (
                        <div className="space-y-3">
                            {mockPendingReports.map((report) => (
                                <Link key={report.report_id} to={`/operations/reports/${report.report_id}`} className="block p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-medium text-gray-900 dark:text-white">{report.stream_name}</p>
                                            <p className="text-sm text-gray-500 dark:text-gray-400">{report.article_count} articles · {report.run_type} · {report.created_at}</p>
                                        </div>
                                        <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200">Pending</span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>

                {/* Scheduler Status */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Scheduler Status</h2>
                        <Link to="/operations/scheduler" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Manage</Link>
                    </div>
                    {mockRunningJobs.length > 0 && (
                        <div className="mb-4">
                            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Running Now</h3>
                            {mockRunningJobs.map((job) => (
                                <div key={job.stream_id} className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-medium text-gray-900 dark:text-white">{job.stream_name}</p>
                                            <p className="text-sm text-gray-500 dark:text-gray-400">{job.stage} · {job.progress} articles · started {job.started}</p>
                                        </div>
                                        <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    <div>
                        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Upcoming Runs</h3>
                        <div className="space-y-2">
                            {mockUpcomingRuns.map((run) => (
                                <div key={run.stream_id} className="flex items-center justify-between p-2 rounded border border-gray-200 dark:border-gray-700">
                                    <span className="text-sm text-gray-900 dark:text-white">{run.stream_name}</span>
                                    <span className="text-sm text-gray-500 dark:text-gray-400">{run.next_run}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatCard({ label, value, icon: Icon, color, link }: {
    label: string;
    value: number;
    icon: React.ComponentType<{ className?: string }>;
    color: 'yellow' | 'green' | 'red' | 'blue' | 'purple' | 'gray';
    link?: string;
}) {
    const colorClasses = {
        yellow: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400',
        green: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
        red: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
        blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
        purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
        gray: 'bg-gray-100 dark:bg-gray-900/30 text-gray-600 dark:text-gray-400',
    };

    const content = (
        <div className={`p-4 rounded-lg ${link ? 'hover:opacity-80 transition-opacity cursor-pointer' : ''}`}>
            <div className={`inline-flex p-2 rounded-lg ${colorClasses[color]} mb-2`}>
                <Icon className="h-5 w-5" />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
        </div>
    );

    return link ? (
        <Link to={link} className="bg-white dark:bg-gray-800 rounded-lg shadow">{content}</Link>
    ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">{content}</div>
    );
}
