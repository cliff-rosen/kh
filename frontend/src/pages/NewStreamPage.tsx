import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { useNavigate } from 'react-router-dom';
import ProfileCompletion from '../components/ProfileCompletion';
import ResearchStreamForm from '../components/ResearchStreamForm';

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
    const [showCreateForm, setShowCreateForm] = useState(false);

    useEffect(() => {
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

    // Show research stream creation form (when profiles are complete or user completed them)
    return (
        <div className="max-w-4xl mx-auto p-6">
            <ResearchStreamForm />
        </div>
    );
}