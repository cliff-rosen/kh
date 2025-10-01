import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useResearchStream } from '../context/ResearchStreamContext';
import { useNavigate } from 'react-router-dom';

export default function DashboardPage() {
    const { user } = useAuth();
    const { researchStreams, loadResearchStreams, isLoading, error } = useResearchStream();
    const navigate = useNavigate();

    useEffect(() => {
        loadResearchStreams();
    }, [loadResearchStreams]);

    return (
        <div className="max-w-7xl mx-auto p-6">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                    Dashboard
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mt-2">
                    Welcome back, {user?.email}
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                {/* Quick Stats */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        📊 Quick Stats
                    </h3>
                    <div className="space-y-3">
                        <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Reports Generated</span>
                            <span className="font-semibold">--</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Articles Reviewed</span>
                            <span className="font-semibold">--</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Sources Monitored</span>
                            <span className="font-semibold">--</span>
                        </div>
                    </div>
                </div>

                {/* Recent Activity */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        📈 Recent Activity
                    </h3>
                    <div className="text-gray-600 dark:text-gray-400 text-center py-8">
                        No recent activity
                    </div>
                </div>

                {/* Research Streams */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        🔬 Research Streams
                    </h3>
                    {isLoading ? (
                        <div className="text-center py-4">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
                            <div className="text-gray-600 dark:text-gray-400 text-sm">Loading...</div>
                        </div>
                    ) : error ? (
                        <div className="text-center py-4">
                            <div className="text-red-600 dark:text-red-400 mb-2 text-sm">Error loading streams</div>
                            <button
                                onClick={loadResearchStreams}
                                className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            >
                                Retry
                            </button>
                        </div>
                    ) : researchStreams.length === 0 ? (
                        <div className="text-center py-4">
                            <div className="text-gray-600 dark:text-gray-400 mb-2">
                                No active streams
                            </div>
                            <button
                                onClick={() => navigate('/new-stream')}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                            >
                                Create Stream
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {researchStreams.slice(0, 3).map((stream) => (
                                <div
                                    key={stream.stream_id}
                                    className="flex items-center justify-between py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 rounded px-2 -mx-2 transition-colors"
                                    onClick={() => navigate(`/reports?stream=${stream.stream_id}`)}
                                >
                                    <div className="flex-1">
                                        <div className="font-medium text-gray-900 dark:text-white text-sm">
                                            {stream.stream_name}
                                        </div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400">
                                            {stream.stream_type} • {stream.is_active ? 'Active' : 'Inactive'}
                                        </div>
                                    </div>
                                    <div className={`w-2 h-2 rounded-full ${stream.is_active ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                                </div>
                            ))}
                            {researchStreams.length > 3 && (
                                <div className="text-center pt-2">
                                    <button
                                        onClick={() => navigate('/settings')}
                                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                    >
                                        View all ({researchStreams.length})
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Main Content Area - Only show if no streams */}
            {!isLoading && researchStreams.length === 0 && (
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
            )}
        </div>
    );
}