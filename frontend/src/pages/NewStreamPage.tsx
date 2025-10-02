import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '../context/ProfileContext';
import ProfileCompletion from '../components/ProfileCompletion';
import ResearchStreamForm from '../components/ResearchStreamForm';
import { ChatBubbleLeftRightIcon, DocumentTextIcon } from '@heroicons/react/24/outline';

export default function NewStreamPage() {
    const navigate = useNavigate();
    const {
        completenessStatus,
        checkCompleteness,
        isLoading,
        error,
        clearError
    } = useProfile();
    const [isCheckingPrerequisites, setIsCheckingPrerequisites] = useState(true);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [showMethodChoice, setShowMethodChoice] = useState(true);

    useEffect(() => {
        console.log('checking prerequisites');
        const checkPrerequisites = async () => {
            try {
                await checkCompleteness();
            } finally {
                setIsCheckingPrerequisites(false);
            }
        };

        checkPrerequisites();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleProfileComplete = async () => {
        // Re-check completeness after profile update
        await checkCompleteness();
        setShowCreateForm(true);
    };

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
    if (completenessStatus && !completenessStatus.can_create_research_stream && !showCreateForm) {
        return (
            <div className="max-w-4xl mx-auto p-6">
                <ProfileCompletion
                    completenessStatus={completenessStatus}
                    onComplete={handleProfileComplete}
                />
            </div>
        );
    }

    // Show method choice or research stream creation form
    return (
        <div className="max-w-4xl mx-auto p-6">
            {showMethodChoice ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
                        Create New Research Stream
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mb-8">
                        Choose how you'd like to create your research stream
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* AI-Guided Interview */}
                        <button
                            onClick={() => navigate('/new-stream/chat')}
                            className="p-6 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-600 dark:hover:border-blue-500 hover:shadow-lg transition-all text-left group"
                        >
                            <ChatBubbleLeftRightIcon className="h-12 w-12 text-blue-600 dark:text-blue-400 mb-4" />
                            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                                AI-Guided Interview
                            </h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                                Have a conversation with our AI assistant to build your research stream.
                                The AI will ask questions and suggest relevant options based on your answers.
                            </p>
                            <span className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                                Recommended for first-time users →
                            </span>
                        </button>

                        {/* Manual Form */}
                        <button
                            onClick={() => setShowMethodChoice(false)}
                            className="p-6 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-600 dark:hover:border-blue-500 hover:shadow-lg transition-all text-left group"
                        >
                            <DocumentTextIcon className="h-12 w-12 text-gray-600 dark:text-gray-400 mb-4" />
                            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                                Manual Form
                            </h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                                Fill out a traditional form if you already know exactly what you want to create.
                                Faster if you have all the details ready.
                            </p>
                            <span className="text-sm text-gray-600 dark:text-gray-400 font-medium group-hover:text-blue-600 dark:group-hover:text-blue-400">
                                For experienced users →
                            </span>
                        </button>
                    </div>
                </div>
            ) : (
                <div>
                    <button
                        onClick={() => setShowMethodChoice(true)}
                        className="mb-4 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                        ← Back to options
                    </button>
                    <ResearchStreamForm />
                </div>
            )}
        </div>
    );
}