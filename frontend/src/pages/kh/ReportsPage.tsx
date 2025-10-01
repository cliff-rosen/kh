import { useState } from 'react';
import { CalendarIcon, DocumentTextIcon, StarIcon } from '@heroicons/react/24/outline';

export default function ReportsPage() {
    const [selectedPeriod, setSelectedPeriod] = useState('weekly');

    return (
        <div className="max-w-7xl mx-auto p-6">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                        Intelligence Reports
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-2">
                        Curated insights and horizon scanning reports
                    </p>
                </div>

                <div className="flex gap-4">
                    <select
                        value={selectedPeriod}
                        onChange={(e) => setSelectedPeriod(e.target.value)}
                        className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                    </select>
                    <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                        Generate Report
                    </button>
                </div>
            </div>

            {/* Report Filters */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    📋 Report Filters
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Therapeutic Areas
                        </label>
                        <select className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                            <option>All Areas</option>
                            <option>Oncology</option>
                            <option>Immunology</option>
                            <option>Neurology</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Source Types
                        </label>
                        <select className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                            <option>All Sources</option>
                            <option>Clinical Trials</option>
                            <option>Publications</option>
                            <option>Regulatory</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Date Range
                        </label>
                        <select className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                            <option>Last 7 days</option>
                            <option>Last 30 days</option>
                            <option>Last 90 days</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Reports List */}
            <div className="space-y-4">
                {/* Placeholder for when no reports exist */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                    <DocumentTextIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                        No Reports Generated Yet
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-2xl mx-auto">
                        Once you complete your onboarding and set up your curation mandate,
                        we'll start generating personalized intelligence reports based on your interests.
                    </p>
                    <div className="flex justify-center gap-4">
                        <button className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                            Complete Setup
                        </button>
                        <button className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                            View Sample Report
                        </button>
                    </div>
                </div>

                {/* Sample report structure (commented out for now) */}
                {/*
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <div className="flex items-start justify-between mb-4">
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Weekly Intelligence Report - Week of Jan 15, 2025
                            </h3>
                            <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mt-2">
                                <span className="flex items-center gap-1">
                                    <CalendarIcon className="h-4 w-4" />
                                    Generated Jan 22, 2025
                                </span>
                                <span>25 articles reviewed</span>
                                <span>3 key insights</span>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button className="p-2 text-gray-400 hover:text-yellow-500">
                                <StarIcon className="h-5 w-5" />
                            </button>
                            <button className="px-4 py-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/50 rounded-lg">
                                View Report
                            </button>
                        </div>
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                            <strong>Executive Summary:</strong> Significant developments in CAR-T therapy for solid tumors,
                            new checkpoint inhibitor combinations showing promise in Phase II trials, and regulatory
                            updates from FDA on accelerated approval pathways...
                        </p>
                    </div>
                </div>
                */}
            </div>
        </div>
    );
}