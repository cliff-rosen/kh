import { useAuth } from '../../context/AuthContext';

export default function NewStreamPage() {
    const { user } = useAuth();

    return (
        <div className="max-w-4xl mx-auto p-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
                    Create New Research Stream
                </h1>

                <div className="space-y-6">
                    <div className="text-lg text-gray-700 dark:text-gray-300">
                        Let's set up a new research stream to monitor the information that matters to you.
                    </div>

                    <div className="bg-blue-50 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-700 rounded-lg p-6">
                        <h2 className="text-xl font-semibold text-blue-900 dark:text-blue-100 mb-4">
                            🚧 Setup Process
                        </h2>
                        <div className="text-blue-800 dark:text-blue-200 space-y-2">
                            <p>We'll guide you through:</p>
                            <ul className="list-disc list-inside space-y-1 ml-4">
                                <li>Complete your user and company profile (if needed)</li>
                                <li>Define what you want to monitor</li>
                                <li>Set up focus areas and competitors</li>
                                <li>Configure report frequency and delivery</li>
                                <li>Launch your research stream</li>
                            </ul>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <button className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                            Start Stream Setup
                        </button>
                        <button className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                            Back to Dashboard
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}