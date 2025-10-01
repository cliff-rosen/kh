import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function DashboardPage() {
    const { user } = useAuth();
    const navigate = useNavigate();

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
                </div>
            </div>

            {/* Main Content Area */}
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
        </div>
    );
}