import { useState, useEffect } from 'react';
import { useProfile } from '../context/ProfileContext';
import { ProfileCompletenessStatus } from '../types';

interface ProfileCompletionProps {
    completenessStatus: ProfileCompletenessStatus;
    onComplete: () => void;
}

export default function ProfileCompletion({ completenessStatus, onComplete }: ProfileCompletionProps) {
    const {
        userProfile,
        companyProfile,
        updateUserProfile,
        updateCompanyProfile,
        loadAllProfiles,
        isLoading,
        error,
        clearError
    } = useProfile();

    const [step, setStep] = useState<'user' | 'company'>('user');
    const [userForm, setUserForm] = useState({
        full_name: '',
        job_title: ''
    });
    const [companyForm, setCompanyForm] = useState({
        company_name: '',
        therapeutic_areas: [] as string[],
        competitors: [] as string[]
    });

    // Load profiles and populate forms
    useEffect(() => {
        loadAllProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (userProfile) {
            setUserForm({
                full_name: userProfile.full_name || '',
                job_title: userProfile.job_title || ''
            });
        }
    }, [userProfile]);

    useEffect(() => {
        if (companyProfile) {
            setCompanyForm({
                company_name: companyProfile.company_name || '',
                therapeutic_areas: companyProfile.therapeutic_areas || [],
                competitors: companyProfile.competitors || []
            });
        }
    }, [companyProfile]);

    // Determine which step to show first
    useEffect(() => {
        if (!completenessStatus.user_profile_complete) {
            setStep('user');
        } else if (!completenessStatus.company_profile_complete) {
            setStep('company');
        }
    }, [completenessStatus]);

    const handleUserSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await updateUserProfile(userForm);
            if (completenessStatus.company_profile_complete) {
                onComplete();
            } else {
                setStep('company');
            }
        } catch (err) {
            console.error('Failed to update user profile:', err);
        }
    };

    const handleCompanySubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await updateCompanyProfile(companyForm);
            onComplete();
        } catch (err) {
            console.error('Failed to update company profile:', err);
        }
    };

    const handleTherapeuticAreasChange = (value: string) => {
        const areas = value.split(',').map(s => s.trim()).filter(s => s);
        setCompanyForm({ ...companyForm, therapeutic_areas: areas });
    };

    const handleCompetitorsChange = (value: string) => {
        const competitors = value.split(',').map(s => s.trim()).filter(s => s);
        setCompanyForm({ ...companyForm, competitors });
    };

    if (step === 'user') {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8">
                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                        Complete Your User Profile
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400">
                        We need some basic information about you to personalize your research streams.
                    </p>
                </div>

                {error && (
                    <div className="mb-4 bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-700 rounded-lg p-4">
                        <p className="text-red-800 dark:text-red-200">{error}</p>
                        <button
                            onClick={clearError}
                            className="mt-2 text-sm text-red-600 dark:text-red-400 hover:underline"
                        >
                            Dismiss
                        </button>
                    </div>
                )}

                <form onSubmit={handleUserSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Full Name *
                        </label>
                        <input
                            type="text"
                            placeholder="Enter your full name"
                            value={userForm.full_name}
                            onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Job Title *
                        </label>
                        <input
                            type="text"
                            placeholder="e.g., VP of Clinical Development"
                            value={userForm.job_title}
                            onChange={(e) => setUserForm({ ...userForm, job_title: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            required
                        />
                    </div>

                    <div className="flex justify-between">
                        <button
                            type="button"
                            onClick={() => window.history.back()}
                            className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            Back
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                            {isLoading ? 'Saving...' : 'Continue'}
                        </button>
                    </div>
                </form>
            </div>
        );
    }

    if (step === 'company') {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8">
                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                        Complete Your Company Profile
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400">
                        Tell us about your company so we can tailor your research streams.
                    </p>
                </div>

                {error && (
                    <div className="mb-4 bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-700 rounded-lg p-4">
                        <p className="text-red-800 dark:text-red-200">{error}</p>
                        <button
                            onClick={clearError}
                            className="mt-2 text-sm text-red-600 dark:text-red-400 hover:underline"
                        >
                            Dismiss
                        </button>
                    </div>
                )}

                <form onSubmit={handleCompanySubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Company Name *
                        </label>
                        <input
                            type="text"
                            placeholder="Enter your company name"
                            value={companyForm.company_name}
                            onChange={(e) => setCompanyForm({ ...companyForm, company_name: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Therapeutic Areas *
                        </label>
                        <input
                            type="text"
                            placeholder="e.g., Oncology, Immunology, Neurology"
                            value={companyForm.therapeutic_areas.join(', ')}
                            onChange={(e) => handleTherapeuticAreasChange(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            required
                        />
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Separate multiple areas with commas
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Key Competitors *
                        </label>
                        <input
                            type="text"
                            placeholder="e.g., Roche, Merck, Pfizer"
                            value={companyForm.competitors.join(', ')}
                            onChange={(e) => handleCompetitorsChange(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            required
                        />
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Companies you want to monitor
                        </p>
                    </div>

                    <div className="flex justify-between">
                        <button
                            type="button"
                            onClick={() => setStep('user')}
                            className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            Back
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                            {isLoading ? 'Saving...' : 'Complete Profile'}
                        </button>
                    </div>
                </form>
            </div>
        );
    }

    return null;
}