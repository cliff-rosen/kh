import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';

export default function SettingsPage() {
    const { user } = useAuth();
    const {
        userProfile,
        companyProfile,
        loadAllProfiles,
        updateUserProfile,
        updateCompanyProfile,
        isLoading,
        error,
        clearError
    } = useProfile();
    const [activeTab, setActiveTab] = useState('user');

    // Form state
    const [userForm, setUserForm] = useState({
        full_name: '',
        job_title: '',
        preferences: ''
    });

    const [companyForm, setCompanyForm] = useState({
        company_name: '',
        therapeutic_areas: [] as string[],
        competitors: [] as string[],
        pipeline_products: ''
    });

    // Load profiles on mount
    useEffect(() => {
        loadAllProfiles();
    }, [loadAllProfiles]);

    // Update form state when profiles load
    useEffect(() => {
        if (userProfile) {
            setUserForm({
                full_name: userProfile.full_name || '',
                job_title: userProfile.job_title || '',
                preferences: userProfile.preferences || ''
            });
        }
    }, [userProfile]);

    useEffect(() => {
        if (companyProfile) {
            setCompanyForm({
                company_name: companyProfile.company_name || '',
                therapeutic_areas: companyProfile.therapeutic_areas || [],
                competitors: companyProfile.competitors || [],
                pipeline_products: companyProfile.pipeline_products || ''
            });
        }
    }, [companyProfile]);

    const handleUserFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await updateUserProfile(userForm);
    };

    const handleCompanyFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await updateCompanyProfile(companyForm);
    };

    const tabs = [
        { id: 'user', name: 'User Profile', icon: '👤' },
        { id: 'company', name: 'Company Profile', icon: '🏢' },
        { id: 'notifications', name: 'Notifications', icon: '🔔' },
        { id: 'schedule', name: 'Report Schedule', icon: '📅' },
    ];

    return (
        <div className="max-w-7xl mx-auto p-6">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                    Settings
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mt-2">
                    Manage your Knowledge Horizon preferences and configuration
                </p>
            </div>

            <div className="flex flex-col lg:flex-row gap-6">
                {/* Sidebar */}
                <div className="lg:w-64">
                    <nav className="space-y-1">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`w-full flex items-center px-4 py-3 text-left rounded-lg transition-colors ${
                                    activeTab === tab.id
                                        ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                                }`}
                            >
                                <span className="mr-3">{tab.icon}</span>
                                {tab.name}
                            </button>
                        ))}
                    </nav>
                </div>

                {/* Main Content */}
                <div className="flex-1">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                        {activeTab === 'user' && (
                            <div className="p-6">
                                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                                    User Profile
                                </h2>
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
                                <form onSubmit={handleUserFormSubmit} className="space-y-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Email Address
                                        </label>
                                        <input
                                            type="email"
                                            value={user?.email || ''}
                                            disabled
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                            Email cannot be changed after registration
                                        </p>
                                    </div>
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
                                            Role/Job Title *
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
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Preferences
                                        </label>
                                        <textarea
                                            placeholder="Any specific preferences or notes about your information needs..."
                                            rows={3}
                                            value={userForm.preferences}
                                            onChange={(e) => setUserForm({ ...userForm, preferences: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                    </div>
                                    <div className="flex justify-end">
                                        <button
                                            type="submit"
                                            disabled={isLoading}
                                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                                        >
                                            {isLoading ? 'Saving...' : 'Save User Profile'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}

                        {activeTab === 'company' && (
                            <div className="p-6">
                                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                                    Company Profile
                                </h2>
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
                                <form onSubmit={handleCompanyFormSubmit} className="space-y-6">
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
                                            onChange={(e) => setCompanyForm({
                                                ...companyForm,
                                                therapeutic_areas: e.target.value.split(',').map(s => s.trim()).filter(s => s)
                                            })}
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
                                            onChange={(e) => setCompanyForm({
                                                ...companyForm,
                                                competitors: e.target.value.split(',').map(s => s.trim()).filter(s => s)
                                            })}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                            required
                                        />
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                            Companies you want to monitor
                                        </p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Pipeline Products
                                        </label>
                                        <textarea
                                            placeholder="Key products in your pipeline that you want to monitor competitive landscape for..."
                                            rows={3}
                                            value={companyForm.pipeline_products}
                                            onChange={(e) => setCompanyForm({ ...companyForm, pipeline_products: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                    </div>
                                    <div className="flex justify-end">
                                        <button
                                            type="submit"
                                            disabled={isLoading}
                                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                                        >
                                            {isLoading ? 'Saving...' : 'Save Company Profile'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}


                        {activeTab === 'notifications' && (
                            <div className="p-6">
                                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                                    Notification Preferences
                                </h2>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-600">
                                        <div>
                                            <h3 className="font-medium text-gray-900 dark:text-white">Email Reports</h3>
                                            <p className="text-sm text-gray-600 dark:text-gray-400">Receive weekly intelligence reports via email</p>
                                        </div>
                                        <input type="checkbox" className="h-4 w-4 text-blue-600" defaultChecked />
                                    </div>
                                    <div className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-600">
                                        <div>
                                            <h3 className="font-medium text-gray-900 dark:text-white">Breaking News Alerts</h3>
                                            <p className="text-sm text-gray-600 dark:text-gray-400">Immediate notifications for critical developments</p>
                                        </div>
                                        <input type="checkbox" className="h-4 w-4 text-blue-600" />
                                    </div>
                                    <div className="flex items-center justify-between py-3">
                                        <div>
                                            <h3 className="font-medium text-gray-900 dark:text-white">Weekly Digest</h3>
                                            <p className="text-sm text-gray-600 dark:text-gray-400">Summary of all activity and insights</p>
                                        </div>
                                        <input type="checkbox" className="h-4 w-4 text-blue-600" defaultChecked />
                                    </div>
                                </div>
                            </div>
                        )}


                        {activeTab === 'schedule' && (
                            <div className="p-6">
                                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                                    Report Schedule
                                </h2>
                                <div className="space-y-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Report Frequency
                                        </label>
                                        <select className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                                            <option value="daily">Daily</option>
                                            <option value="weekly" selected>Weekly</option>
                                            <option value="biweekly">Bi-weekly</option>
                                            <option value="monthly">Monthly</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Delivery Time
                                        </label>
                                        <select className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                                            <option value="08:00">8:00 AM</option>
                                            <option value="09:00" selected>9:00 AM</option>
                                            <option value="10:00">10:00 AM</option>
                                            <option value="17:00">5:00 PM</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Time Zone
                                        </label>
                                        <select className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                                            <option value="UTC">UTC</option>
                                            <option value="EST" selected>Eastern Time</option>
                                            <option value="PST">Pacific Time</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            </div>
        </div>
    );
}