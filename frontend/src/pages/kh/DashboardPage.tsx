import { useAuth } from '../../context/AuthContext';

export default function DashboardPage() {
    const { user } = useAuth();

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

                {/* Mandate Status */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        🎯 Curation Mandate
                    </h3>
                    <div className="text-center py-4">
                        <div className="text-yellow-600 dark:text-yellow-400 mb-2">
                            ⚠️ Not Configured
                        </div>
                        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm">
                            Set Up Mandate
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8">
                <div className="text-center py-12">
                    <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                        🚧 Dashboard Coming Soon
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-2xl mx-auto">
                        Your personalized dashboard will show the latest curated intelligence,
                        trending topics in your areas of interest, and actionable insights
                        tailored to your role and company.
                    </p>
                    <div className="flex justify-center gap-4">
                        <button className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                            Complete Onboarding
                        </button>
                        <button className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                            View Reports
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}