import { XMarkIcon, CalendarIcon, DocumentTextIcon, FunnelIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';

interface ExecutionConfigModalProps {
    reportName: string;
    retrievalParams: Record<string, any>;
    onClose: () => void;
}

interface BroadQueryConfig {
    query_expression: string;
    semantic_filter?: {
        enabled: boolean;
        criteria: string;
        threshold?: number;
    };
}

interface ConceptConfig {
    concept_id: string;
    name: string;
    source_queries?: Record<string, { query_expression: string; enabled: boolean }>;
    semantic_filter?: {
        enabled: boolean;
        criteria: string;
        threshold?: number;
    };
}

export default function ExecutionConfigModal({ reportName, retrievalParams, onClose }: ExecutionConfigModalProps) {
    const [showRaw, setShowRaw] = useState(false);

    const config = retrievalParams.retrieval_config || {};

    // Extract from broad_search (one retrieval method)
    const broadSearch = config.broad_search as { queries: BroadQueryConfig[] } | undefined;
    const broadQueries = broadSearch?.queries || [];

    // Extract from concepts (alternative retrieval method)
    const concepts = config.concepts as ConceptConfig[] | undefined;

    // Get query expressions from broad_search
    let pubmedQuery = broadQueries.map(q => q.query_expression).filter(Boolean).join('\n\nOR\n\n');

    // If no broad_search, try to get queries from concepts
    if (!pubmedQuery && concepts && concepts.length > 0) {
        const conceptQueries = concepts
            .filter(c => c.source_queries?.pubmed?.enabled && c.source_queries?.pubmed?.query_expression)
            .map(c => `# ${c.name}\n${c.source_queries!.pubmed.query_expression}`)
            .filter(Boolean);
        pubmedQuery = conceptQueries.join('\n\n---\n\n');
    }

    // Get semantic filters from broad_search
    let semanticFilter = broadQueries
        .filter(q => q.semantic_filter?.enabled && q.semantic_filter?.criteria)
        .map(q => q.semantic_filter!.criteria)
        .join('\n\n---\n\n');

    // If no broad_search filters, try to get filters from concepts
    if (!semanticFilter && concepts && concepts.length > 0) {
        const conceptFilters = concepts
            .filter(c => c.semantic_filter?.enabled && c.semantic_filter?.criteria)
            .map(c => `# ${c.name}\n${c.semantic_filter!.criteria}`)
            .filter(Boolean);
        semanticFilter = conceptFilters.join('\n\n---\n\n');
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                            Run Configuration
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                            {reportName}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                    >
                        <XMarkIcon className="h-5 w-5 text-gray-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Date Range Section */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                            <CalendarIcon className="h-4 w-4 text-green-600" />
                            Date Range
                        </h3>
                        <div className="flex gap-6 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                            <div>
                                <span className="text-xs text-gray-500 dark:text-gray-400">Start Date</span>
                                <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
                                    {retrievalParams.start_date || 'Not specified'}
                                </p>
                            </div>
                            <div>
                                <span className="text-xs text-gray-500 dark:text-gray-400">End Date</span>
                                <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
                                    {retrievalParams.end_date || 'Not specified'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* PubMed Query Section */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                            <DocumentTextIcon className="h-4 w-4 text-purple-600" />
                            PubMed Query
                        </h3>
                        {pubmedQuery ? (
                            <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                                {pubmedQuery}
                            </pre>
                        ) : (
                            <p className="text-sm text-gray-400 italic">No PubMed query configured</p>
                        )}
                    </div>

                    {/* Semantic Filter Section */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                            <FunnelIcon className="h-4 w-4 text-blue-600" />
                            Semantic Filter
                        </h3>
                        {semanticFilter ? (
                            <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                                {semanticFilter}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-400 italic">No semantic filter configured</p>
                        )}
                    </div>

                    {/* Raw Config Toggle */}
                    <div>
                        <button
                            type="button"
                            onClick={() => setShowRaw(!showRaw)}
                            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        >
                            {showRaw ? '− Hide' : '+ Show'} raw configuration
                        </button>
                        {showRaw && (
                            <pre className="mt-2 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 overflow-auto max-h-60">
                                {JSON.stringify(retrievalParams, null, 2)}
                            </pre>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
