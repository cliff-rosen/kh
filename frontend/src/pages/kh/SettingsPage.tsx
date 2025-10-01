import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function SettingsPage() {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState('profile');

    const tabs = [
        { id: 'profile', name: 'Profile', icon: '👤' },
        { id: 'mandate', name: 'Curation Mandate', icon: '🎯' },
        { id: 'notifications', name: 'Notifications', icon: '🔔' },
        { id: 'sources', name: 'Information Sources', icon: '📡' },
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
                        {activeTab === 'profile' && (
                            <div className="p-6">
                                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                                    Profile Information
                                </h2>
                                <div className="space-y-6">
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
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Full Name
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="Enter your full name"
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Job Title
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="e.g., VP of Clinical Development"
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Company
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="Enter your company name"
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'mandate' && (
                            <div className="p-6">
                                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                                    Curation Mandate
                                </h2>
                                <div className="bg-yellow-50 dark:bg-yellow-900/50 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4 mb-6">
                                    <p className="text-yellow-800 dark:text-yellow-200">
                                        ⚠️ Your curation mandate defines what information we prioritize for you.
                                        Complete your onboarding to generate a personalized mandate.
                                    </p>
                                </div>
                                <button className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                                    Complete Onboarding
                                </button>
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

                        {activeTab === 'sources' && (
                            <div className="p-6">
                                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                                    Information Sources
                                </h2>
                                <p className="text-gray-600 dark:text-gray-400 mb-6">
                                    Configure which sources we monitor for your intelligence reports.
                                </p>
                                <div className="bg-blue-50 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-700 rounded-lg p-6">
                                    <h3 className="text-lg font-medium text-blue-900 dark:text-blue-100 mb-2">
                                        🚧 Source Configuration Coming Soon
                                    </h3>
                                    <p className="text-blue-800 dark:text-blue-200">
                                        We'll automatically configure relevant sources based on your mandate.
                                        Advanced source customization will be available in a future update.
                                    </p>
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

                        {/* Save Button */}
                        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 flex justify-end">
                            <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}