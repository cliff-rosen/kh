import { useAuth } from '../../context/AuthContext';

export default function OnboardingPage() {
    const { user } = useAuth();

    return (
        <div className="max-w-4xl mx-auto p-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
                    Welcome to Knowledge Horizon
                </h1>

                <div className="space-y-6">
                    <div className="text-lg text-gray-700 dark:text-gray-300">
                        Hello {user?.email}! Let's get you set up with personalized horizon scanning.
                    </div>

                    <div className="bg-blue-50 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-700 rounded-lg p-6">
                        <h2 className="text-xl font-semibold text-blue-900 dark:text-blue-100 mb-4">
                            🚧 Coming Soon
                        </h2>
                        <div className="text-blue-800 dark:text-blue-200 space-y-2">
                            <p>The onboarding flow will help you:</p>
                            <ul className="list-disc list-inside space-y-1 ml-4">
                                <li>Set up your company profile</li>
                                <li>Define your therapeutic areas of interest</li>
                                <li>Configure your information preferences</li>
                                <li>Generate your personalized curation mandate</li>
                            </ul>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <button className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                            Start Onboarding
                        </button>
                        <button className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                            Skip for Now
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}