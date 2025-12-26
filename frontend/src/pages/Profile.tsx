import { useState, useEffect } from 'react';
import { UserIcon, BuildingOfficeIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthContext';
import { userApi, type UserUpdateRequest } from '../lib/api/userApi';
import { handleApiError } from '../lib/api';
import type { User } from '../types/user';

// Import org components for org admins
import { OrgDetailsForm } from '../components/org/OrgDetailsForm';
import { MemberList } from '../components/org/MemberList';
import { GlobalStreamSubscriptions } from '../components/org/GlobalStreamSubscriptions';
import { OrganizationProvider } from '../context/OrganizationContext';

type ProfileTab = 'user' | 'organization';

export default function Profile() {
    const { user: authUser, isOrgAdmin, isPlatformAdmin } = useAuth();
    const [activeTab, setActiveTab] = useState<ProfileTab>('user');

    // Only show Organization tab for org admins who actually belong to an org
    // Platform admins don't have an org_id, so they shouldn't see this tab
    const showOrgTab = isOrgAdmin && !isPlatformAdmin && authUser?.org_id;
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Form state
    const [form, setForm] = useState({
        full_name: '',
        job_title: ''
    });

    // Load user profile
    useEffect(() => {
        loadProfile();
    }, []);

    const loadProfile = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const userData = await userApi.getMe();
            setUser(userData);
            setForm({
                full_name: userData.full_name || '',
                job_title: userData.job_title || ''
            });
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setError(null);
        setSuccessMessage(null);

        try {
            const updates: UserUpdateRequest = {};
            if (form.full_name !== user?.full_name) {
                updates.full_name = form.full_name;
            }
            if (form.job_title !== user?.job_title) {
                updates.job_title = form.job_title;
            }

            if (Object.keys(updates).length > 0) {
                const updatedUser = await userApi.updateMe(updates);
                setUser(updatedUser);
                setSuccessMessage('Profile updated successfully');
            }
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsSaving(false);
        }
    };

    const tabs = [
        { id: 'user' as const, name: 'Profile', icon: UserIcon },
        ...(showOrgTab ? [{ id: 'organization' as const, name: 'Organization', icon: BuildingOfficeIcon }] : [])
    ];

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto p-6">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                    Settings
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mt-2">
                    Manage your profile{showOrgTab ? ' and organization' : ''}
                </p>
            </div>

            {/* Tab Navigation */}
            {tabs.length > 1 && (
                <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
                    <nav className="-mb-px flex space-x-8">
                        {tabs.map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`
                                        group inline-flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm
                                        ${isActive
                                            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                                        }
                                    `}
                                >
                                    <Icon className={`h-5 w-5 ${isActive ? 'text-blue-500' : 'text-gray-400'}`} />
                                    {tab.name}
                                </button>
                            );
                        })}
                    </nav>
                </div>
            )}

            {/* User Profile Tab */}
            {activeTab === 'user' && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                        Your Profile
                    </h2>

                    {error && (
                        <div className="mb-4 bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-700 rounded-lg p-4">
                            <p className="text-red-800 dark:text-red-200">{error}</p>
                        </div>
                    )}

                    {successMessage && (
                        <div className="mb-4 bg-green-50 dark:bg-green-900/50 border border-green-200 dark:border-green-700 rounded-lg p-4">
                            <p className="text-green-800 dark:text-green-200">{successMessage}</p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Email Address
                            </label>
                            <input
                                type="email"
                                value={authUser?.email || ''}
                                disabled
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                            />
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                Email cannot be changed
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Full Name
                            </label>
                            <input
                                type="text"
                                placeholder="Enter your full name"
                                value={form.full_name}
                                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Job Title
                            </label>
                            <input
                                type="text"
                                placeholder="e.g., VP of Clinical Development"
                                value={form.job_title}
                                onChange={(e) => setForm({ ...form, job_title: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>

                        <div className="flex justify-end">
                            <button
                                type="submit"
                                disabled={isSaving}
                                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                            >
                                {isSaving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </form>

                    {/* Account Info */}
                    <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
                            Account Information
                        </h3>
                        <dl className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <dt className="text-gray-500 dark:text-gray-400">Role</dt>
                                <dd className="text-gray-900 dark:text-white capitalize">
                                    {user?.role?.replace('_', ' ')}
                                </dd>
                            </div>
                            {user?.org_id && (
                                <div className="flex justify-between">
                                    <dt className="text-gray-500 dark:text-gray-400">Organization ID</dt>
                                    <dd className="text-gray-900 dark:text-white">{user.org_id}</dd>
                                </div>
                            )}
                            <div className="flex justify-between">
                                <dt className="text-gray-500 dark:text-gray-400">Member since</dt>
                                <dd className="text-gray-900 dark:text-white">
                                    {user?.registration_date ? new Date(user.registration_date).toLocaleDateString() : '-'}
                                </dd>
                            </div>
                        </dl>
                    </div>
                </div>
            )}

            {/* Organization Tab (for org admins who belong to an org) */}
            {activeTab === 'organization' && showOrgTab && (
                <OrganizationProvider>
                    <div className="space-y-6">
                        <OrgDetailsForm />
                        <MemberList />
                        <GlobalStreamSubscriptions />
                    </div>
                </OrganizationProvider>
            )}
        </div>
    );
}
