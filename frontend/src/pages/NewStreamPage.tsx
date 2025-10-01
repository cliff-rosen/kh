import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { useNavigate } from 'react-router-dom';

export default function NewStreamPage() {
    const { user } = useAuth();
    const {
        completenessStatus,
        checkCompleteness,
        isLoading,
        error,
        clearError
    } = useProfile();
    const navigate = useNavigate();
    const [isCheckingPrerequisites, setIsCheckingPrerequisites] = useState(true);

    useEffect(() => {
        const checkPrerequisites = async () => {
            try {
                await checkCompleteness();
            } finally {
                setIsCheckingPrerequisites(false);
            }
        };

        checkPrerequisites();
    }, [checkCompleteness]);

    // Show loading state while checking prerequisites
    if (isCheckingPrerequisites || isLoading) {
        return (
            <div className="max-w-4xl mx-auto p-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8">
                    <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        <span className="ml-3 text-gray-600 dark:text-gray-400">
                            Checking prerequisites...
                        </span>
                    </div>
                </div>
            </div>
        );
    }

    // Show error state
    if (error) {
        return (
            <div className="max-w-4xl mx-auto p-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8">
                    <div className="text-center">
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
                            Create New Research Stream
                        </h1>
                        <div className="bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-700 rounded-lg p-6">
                            <p className="text-red-800 dark:text-red-200">{error}</p>
                            <button
                                onClick={clearError}
                                className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                            >
                                Try Again
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Show profile completion needed
    if (completenessStatus && !completenessStatus.can_create_research_stream) {
        return (
            <div className="max-w-4xl mx-auto p-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
                        Complete Your Profile First
                    </h1>

                    <div className="space-y-6">
                        <div className="text-lg text-gray-700 dark:text-gray-300">
                            Before creating a research stream, we need some information about you and your company.
                        </div>

                        {!completenessStatus.user_profile_complete && (
                            <div className="bg-amber-50 dark:bg-amber-900/50 border border-amber-200 dark:border-amber-700 rounded-lg p-6">
                                <h3 className="text-lg font-semibold text-amber-900 dark:text-amber-100 mb-3">
                                    👤 User Profile Incomplete
                                </h3>
                                <p className="text-amber-800 dark:text-amber-200 mb-3">
                                    Missing required fields:
                                </p>
                                <ul className="list-disc list-inside text-amber-800 dark:text-amber-200 space-y-1">
                                    {completenessStatus.missing_user_fields.map((field) => (
                                        <li key={field}>{field.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {!completenessStatus.company_profile_complete && (
                            <div className="bg-amber-50 dark:bg-amber-900/50 border border-amber-200 dark:border-amber-700 rounded-lg p-6">
                                <h3 className="text-lg font-semibold text-amber-900 dark:text-amber-100 mb-3">
                                    🏢 Company Profile Incomplete
                                </h3>
                                <p className="text-amber-800 dark:text-amber-200 mb-3">
                                    Missing required fields:
                                </p>
                                <ul className="list-disc list-inside text-amber-800 dark:text-amber-200 space-y-1">
                                    {completenessStatus.missing_company_fields.map((field) => (
                                        <li key={field}>{field.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="flex gap-4">
                            <button
                                onClick={() => navigate('/settings')}
                                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                Complete Profile in Settings
                            </button>
                            <button
                                onClick={() => navigate('/dashboard')}
                                className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                                Back to Dashboard
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Show research stream creation flow (when profiles are complete)
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

                    <div className="bg-green-50 dark:bg-green-900/50 border border-green-200 dark:border-green-700 rounded-lg p-6">
                        <h2 className="text-xl font-semibold text-green-900 dark:text-green-100 mb-4">
                            ✅ Prerequisites Complete
                        </h2>
                        <div className="text-green-800 dark:text-green-200 space-y-2">
                            <p>Your profiles are complete! Now we'll set up your research stream:</p>
                            <ul className="list-disc list-inside space-y-1 ml-4">
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
                        <button
                            onClick={() => navigate('/dashboard')}
                            className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            Back to Dashboard
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}