import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PencilIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';

import { useAuth } from '../context/AuthContext';
import { useResearchStream } from '../context/ResearchStreamContext';
import { reportApi } from '../lib/api/reportApi';
import { Report } from '../types';
import ChatTray from '../components/chat/ChatTray';

export default function DashboardPage() {
    const { user } = useAuth();
    const { researchStreams, loadResearchStreams, isLoading } = useResearchStream();
    const [recentReports, setRecentReports] = useState<Report[]>([]);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        loadResearchStreams();
        reportApi.getRecentReports(3).then(setRecentReports).catch(console.error);
    }, [loadResearchStreams]);

    const chatContext = useMemo(() => ({
        current_page: 'dashboard',
        stream_count: researchStreams.length,
        active_stream_count: researchStreams.filter(s => s.is_active).length
    }), [researchStreams]);

    return (
        <div className="h-[calc(100vh-4rem)] flex">
            {/* Chat Tray - inline on left side */}
            <ChatTray
                initialContext={chatContext}
                isOpen={isChatOpen}
                onOpenChange={setIsChatOpen}
            />

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-6 relative">
                {/* Chat toggle button - fixed to lower left of content area */}
                {!isChatOpen && (
                    <button
                        onClick={() => setIsChatOpen(true)}
                        className="fixed bottom-6 left-6 z-40 p-4 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-all hover:scale-110"
                        title="Open chat"
                    >
                        <ChatBubbleLeftRightIcon className="h-6 w-6" />
                    </button>
                )}

                <div className="max-w-7xl mx-auto">
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                            Dashboard
                        </h1>
                        <p className="text-gray-600 dark:text-gray-400 mt-2">
                            Welcome back, {user?.email}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                        {/* Quick Stats */}
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                📊 Quick Stats
                            </h3>
                            <div className="space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-gray-600 dark:text-gray-400">Active Streams</span>
                                    <span className="font-semibold text-gray-900 dark:text-white">
                                        {researchStreams.filter(s => s.is_active).length}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600 dark:text-gray-400">Total Streams</span>
                                    <span className="font-semibold text-gray-900 dark:text-white">
                                        {researchStreams.length}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600 dark:text-gray-400">Reports Generated</span>
                                    <span className="font-semibold text-gray-900 dark:text-white">
                                        {researchStreams.reduce((sum, s) => sum + (s.report_count || 0), 0)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Recent Activity */}
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                📈 Recent Reports
                            </h3>
                            {recentReports.length === 0 ? (
                                <div className="text-gray-600 dark:text-gray-400 text-center py-8">
                                    No reports yet
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {recentReports.map((report) => {
                                        const stream = researchStreams.find(s => s.stream_id === report.research_stream_id);
                                        return (
                                            <button
                                                key={report.report_id}
                                                onClick={() => navigate(`/reports?stream=${report.research_stream_id}&report=${report.report_id}`)}
                                                className="w-full text-left p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                            >
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                                                            {stream?.stream_name || 'Unknown Stream'}
                                                        </div>
                                                        <div className="text-xs text-gray-500 dark:text-gray-400">
                                                            {report.report_name || new Date(report.report_date).toLocaleDateString()}
                                                        </div>
                                                    </div>
                                                    <div className="text-xs text-gray-400">
                                                        {report.article_count || 0} articles
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Research Streams Table */}
                    {!isLoading && researchStreams.length === 0 ? (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8">
                            <div className="text-center py-12">
                                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                                    🚀 Get Started with Knowledge Horizon
                                </h2>
                                <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-2xl mx-auto">
                                    Create your first research stream to start monitoring the information that matters to your business.
                                    Once active, your dashboard will show the latest intelligence, trending topics, and actionable insights.
                                </p>
                                <div className="flex justify-center gap-4">
                                    <button
                                        onClick={() => navigate('/new-stream')}
                                        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                    >
                                        Create Research Stream
                                    </button>
                                    <button
                                        onClick={() => navigate('/reports')}
                                        className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        View Reports
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : isLoading ? (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8">
                            <div className="flex items-center justify-center py-12">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                                    🔬 Research Streams
                                </h2>
                                <button
                                    onClick={() => navigate('/streams')}
                                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                    View All
                                </button>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-gray-50 dark:bg-gray-700">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                Stream Name
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                Type
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                Channels
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                Frequency
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                Reports
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                Last Run
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                Status
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                        {researchStreams.map((stream) => (
                                            <tr key={stream.stream_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                                                        {stream.stream_name}
                                                    </div>
                                                    {stream.purpose && (
                                                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xs truncate">
                                                            {stream.purpose}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-wrap gap-1 max-w-xs">
                                                        {stream.presentation_config.categories && stream.presentation_config.categories.length > 0 ? (
                                                            <>
                                                                {stream.presentation_config.categories.slice(0, 2).map((category, idx) => (
                                                                    <span
                                                                        key={idx}
                                                                        className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded"
                                                                    >
                                                                        {category.name}
                                                                    </span>
                                                                ))}
                                                                {stream.presentation_config.categories.length > 2 && (
                                                                    <span className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                                                                        +{stream.presentation_config.categories.length - 2}
                                                                    </span>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <span className="text-sm text-gray-400">None</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className="text-sm text-gray-900 dark:text-white capitalize">
                                                        {stream.report_frequency}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <button
                                                        onClick={() => navigate(`/reports?stream=${stream.stream_id}`)}
                                                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                                    >
                                                        {stream.report_count || 0} reports
                                                    </button>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    {stream.latest_report_date ? (
                                                        <button
                                                            onClick={() => navigate(`/reports?stream=${stream.stream_id}`)}
                                                            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                                            title="View latest report"
                                                        >
                                                            {new Date(stream.latest_report_date).toLocaleDateString()}
                                                        </button>
                                                    ) : (
                                                        <span className="text-sm text-gray-400">No reports</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${stream.is_active
                                                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                                        : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                                                        }`}>
                                                        <span className={`w-2 h-2 rounded-full mr-1.5 ${stream.is_active ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                                                        {stream.is_active ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                    <button
                                                        onClick={() => navigate(`/streams/${stream.stream_id}/edit`)}
                                                        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                                                        title="Edit stream"
                                                    >
                                                        <PencilIcon className="h-4 w-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}