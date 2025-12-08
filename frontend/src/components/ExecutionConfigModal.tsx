import { XMarkIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';

interface ExecutionConfigModalProps {
    reportName: string;
    retrievalParams: Record<string, any>;
    onClose: () => void;
}

export default function ExecutionConfigModal({ reportName, retrievalParams, onClose }: ExecutionConfigModalProps) {
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['dateRange']));

    const toggleSection = (section: string) => {
        setExpandedSections(prev => {
            const newSet = new Set(prev);
            if (newSet.has(section)) {
                newSet.delete(section);
            } else {
                newSet.add(section);
            }
            return newSet;
        });
    };

    const renderQueryConfig = (queries: any[]) => {
        if (!queries || queries.length === 0) return <p className="text-sm text-gray-500">No queries configured</p>;

        return (
            <div className="space-y-4">
                {queries.map((query: any, idx: number) => (
                    <div key={idx} className="border border-gray-300 dark:border-gray-600 rounded-md p-3 bg-gray-50 dark:bg-gray-800">
                        <div className="space-y-2">
                            <div>
                                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Query {idx + 1}</span>
                                <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">{query.query_id}</p>
                            </div>

                            {query.search_terms && (
                                <div>
                                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Search Terms</span>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {query.search_terms.map((term: string, i: number) => (
                                            <span key={i} className="inline-block px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 rounded">
                                                {term}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Query Expression</span>
                                <pre className="text-xs text-gray-700 dark:text-gray-300 mt-1 p-2 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 overflow-x-auto">
                                    {query.query_expression}
                                </pre>
                            </div>

                            {query.semantic_filter && query.semantic_filter.enabled && (
                                <div className="border-t border-gray-200 dark:border-gray-700 pt-2 mt-2">
                                    <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase">Semantic Filter Enabled</span>
                                    <div className="mt-1 space-y-1">
                                        <div className="text-xs text-gray-600 dark:text-gray-400">
                                            Threshold: <span className="font-medium text-gray-900 dark:text-white">{query.semantic_filter.threshold}</span>
                                        </div>
                                        <div className="text-xs text-gray-600 dark:text-gray-400">
                                            Criteria: <span className="text-gray-700 dark:text-gray-300">{query.semantic_filter.criteria}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {query.rationale && (
                                <div>
                                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Rationale</span>
                                    <p className="text-xs text-gray-700 dark:text-gray-300 mt-1">{query.rationale}</p>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const renderCategories = (categories: any[]) => {
        if (!categories || categories.length === 0) return <p className="text-sm text-gray-500">No categories configured</p>;

        return (
            <div className="space-y-3">
                {categories.map((category: any, idx: number) => (
                    <div key={idx} className="border border-gray-300 dark:border-gray-600 rounded-md p-3 bg-gray-50 dark:bg-gray-800">
                        <div className="space-y-2">
                            <div>
                                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Category {idx + 1}</span>
                                <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">{category.name}</p>
                            </div>

                            {category.topics && category.topics.length > 0 && (
                                <div>
                                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Topics</span>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {category.topics.map((topic: string, i: number) => (
                                            <span key={i} className="inline-block px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 rounded">
                                                {topic}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {category.specific_inclusions && category.specific_inclusions.length > 0 && (
                                <div>
                                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Specific Inclusions</span>
                                    <ul className="list-disc list-inside text-xs text-gray-700 dark:text-gray-300 mt-1 space-y-0.5">
                                        {category.specific_inclusions.map((inclusion: string, i: number) => (
                                            <li key={i}>{inclusion}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const renderTopics = (topics: any[]) => {
        if (!topics || topics.length === 0) return <p className="text-sm text-gray-500">No topics defined</p>;

        return (
            <div className="space-y-2">
                {topics.map((topic: any, idx: number) => (
                    <div key={idx} className="border border-gray-300 dark:border-gray-600 rounded-md p-2 bg-gray-50 dark:bg-gray-800">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{topic.topic_id}</p>
                        <p className="text-xs text-gray-700 dark:text-gray-300 mt-1">{topic.description}</p>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[95vw] h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                            Execution Configuration
                        </h2>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            Report: {reportName}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                        <XMarkIcon className="h-6 w-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {/* Date Range */}
                    <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                        <button
                            onClick={() => toggleSection('dateRange')}
                            className="w-full bg-gray-50 dark:bg-gray-700 px-4 py-3 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-650 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                {expandedSections.has('dateRange') ? (
                                    <ChevronDownIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                                ) : (
                                    <ChevronRightIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                                )}
                                <h3 className="font-semibold text-gray-900 dark:text-white">Date Range</h3>
                            </div>
                        </button>
                        {expandedSections.has('dateRange') && (
                            <div className="p-4 bg-white dark:bg-gray-800">
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="text-gray-600 dark:text-gray-400">Start Date:</span>
                                        <p className="font-medium text-gray-900 dark:text-white mt-1">
                                            {retrievalParams.start_date || 'Not specified'}
                                        </p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600 dark:text-gray-400">End Date:</span>
                                        <p className="font-medium text-gray-900 dark:text-white mt-1">
                                            {retrievalParams.end_date || 'Not specified'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Retrieval Configuration */}
                    {retrievalParams.retrieval_config && (
                        <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                            <button
                                onClick={() => toggleSection('retrieval')}
                                className="w-full bg-gray-50 dark:bg-gray-700 px-4 py-3 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-650 transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    {expandedSections.has('retrieval') ? (
                                        <ChevronDownIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                                    ) : (
                                        <ChevronRightIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                                    )}
                                    <h3 className="font-semibold text-gray-900 dark:text-white">Retrieval Configuration</h3>
                                </div>
                            </button>
                            {expandedSections.has('retrieval') && (
                                <div className="p-4 bg-white dark:bg-gray-800">
                                    {retrievalParams.retrieval_config.broad_search?.queries ? (
                                        renderQueryConfig(retrievalParams.retrieval_config.broad_search.queries)
                                    ) : (
                                        <p className="text-sm text-gray-500">No retrieval queries configured</p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Presentation Configuration */}
                    {retrievalParams.presentation_config && (
                        <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                            <button
                                onClick={() => toggleSection('presentation')}
                                className="w-full bg-gray-50 dark:bg-gray-700 px-4 py-3 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-650 transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    {expandedSections.has('presentation') ? (
                                        <ChevronDownIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                                    ) : (
                                        <ChevronRightIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                                    )}
                                    <h3 className="font-semibold text-gray-900 dark:text-white">Presentation Configuration</h3>
                                </div>
                            </button>
                            {expandedSections.has('presentation') && (
                                <div className="p-4 bg-white dark:bg-gray-800">
                                    {renderCategories(retrievalParams.presentation_config.categories)}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Semantic Space */}
                    {retrievalParams.semantic_space && (
                        <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                            <button
                                onClick={() => toggleSection('semanticSpace')}
                                className="w-full bg-gray-50 dark:bg-gray-700 px-4 py-3 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-650 transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    {expandedSections.has('semanticSpace') ? (
                                        <ChevronDownIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                                    ) : (
                                        <ChevronRightIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                                    )}
                                    <h3 className="font-semibold text-gray-900 dark:text-white">Semantic Space</h3>
                                </div>
                            </button>
                            {expandedSections.has('semanticSpace') && (
                                <div className="p-4 bg-white dark:bg-gray-800 space-y-4">
                                    {retrievalParams.semantic_space.purpose && (
                                        <div>
                                            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Purpose</span>
                                            <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{retrievalParams.semantic_space.purpose}</p>
                                        </div>
                                    )}
                                    {retrievalParams.semantic_space.topics && (
                                        <div>
                                            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Topics ({retrievalParams.semantic_space.topics.length})</span>
                                            <div className="mt-2">
                                                {renderTopics(retrievalParams.semantic_space.topics)}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t border-gray-200 dark:border-gray-700 p-4 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
