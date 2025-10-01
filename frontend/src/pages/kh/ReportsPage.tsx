import { useState } from 'react';
import { CalendarIcon, DocumentTextIcon, StarIcon } from '@heroicons/react/24/outline';

export default function ReportsPage() {
    const [selectedStream, setSelectedStream] = useState('');

    // TODO: Replace with actual data from API
    const researchStreams = [
        { id: '1', name: 'Oncology Competitive Intelligence' },
        { id: '2', name: 'FDA Regulatory Updates' },
        { id: '3', name: 'Immunotherapy Research' }
    ];

    const hasStreams = researchStreams.length > 0;

    return (
        <div className="max-w-7xl mx-auto p-6">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                        Reports
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-2">
                        Generated reports from your research streams
                    </p>
                </div>

                {hasStreams && (
                    <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                        Generate New Report
                    </button>
                )}
            </div>

            {hasStreams ? (
                <>
                    {/* Research Stream Selector */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
                        <div className="flex items-center gap-4">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                Research Stream:
                            </label>
                            <select
                                value={selectedStream}
                                onChange={(e) => setSelectedStream(e.target.value)}
                                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white min-w-64"
                            >
                                <option value="">Select a research stream...</option>
                                {researchStreams.map(stream => (
                                    <option key={stream.id} value={stream.id}>
                                        {stream.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </>
            ) : null}

            {/* Reports List */}
            <div className="space-y-4">
                {!hasStreams ? (
                    /* No Research Streams */
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                        <DocumentTextIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            No Research Streams Created
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-2xl mx-auto">
                            You need to create a research stream before reports can be generated.
                            Set up your first stream to start receiving personalized intelligence reports.
                        </p>
                        <button className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                            Create Your First Stream
                        </button>
                    </div>
                ) : !selectedStream ? (
                    /* No Stream Selected */
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                        <DocumentTextIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            Select a Research Stream
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 mb-6">
                            Choose a research stream above to view its reports.
                        </p>
                    </div>
                ) : (
                    /* Reports for Selected Stream */
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                        <DocumentTextIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            No Reports Yet
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 mb-6">
                            No reports have been generated for this research stream yet.
                        </p>
                        <button className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                            Generate First Report
                        </button>
                    </div>
                )}

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