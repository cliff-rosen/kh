import { CheckCircleIcon } from '@heroicons/react/24/outline';
import { RetrievalConfig, SemanticSpace } from '../types';

interface RetrievalConfigDisplayProps {
    retrievalConfig: RetrievalConfig;
    semanticSpace: SemanticSpace;
}

export default function RetrievalConfigDisplay({
    retrievalConfig,
    semanticSpace
}: RetrievalConfigDisplayProps) {
    if (!retrievalConfig.retrieval_groups || retrievalConfig.retrieval_groups.length === 0) {
        return null;
    }

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Configured Retrieval Groups ({retrievalConfig.retrieval_groups.length})
            </h3>

            <div className="space-y-4">
                {retrievalConfig.retrieval_groups.map((group) => (
                    <div
                        key={group.group_id}
                        className="bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-600 p-4"
                    >
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                                <h4 className="font-semibold text-gray-900 dark:text-white">
                                    {group.name}
                                </h4>
                                {group.rationale && (
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                        {group.rationale}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Topics covered */}
                        <div className="mb-3">
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
                                Topics ({group.covered_topics.length})
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {group.covered_topics.map((topicId) => {
                                    const topic = semanticSpace.topics.find(t => t.topic_id === topicId);
                                    return (
                                        <span
                                            key={topicId}
                                            className="px-2 py-1 text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200 rounded-md"
                                        >
                                            {topic?.name || topicId}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Source queries */}
                        <div className="mb-3">
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
                                Source Queries
                            </p>
                            {Object.keys(group.source_queries).length > 0 ? (
                                <div className="space-y-2">
                                    {Object.entries(group.source_queries).map(([sourceId, query]) => {
                                        if (!query || !query.enabled) return null;
                                        return (
                                            <div
                                                key={sourceId}
                                                className="flex items-start gap-2 text-sm"
                                            >
                                                <CheckCircleIcon className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                                                <div className="flex-1 min-w-0">
                                                    <span className="font-medium text-gray-900 dark:text-gray-100">
                                                        {sourceId}:
                                                    </span>
                                                    <div className="mt-1">
                                                        <code className="block text-xs bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-2 py-1 rounded border border-gray-200 dark:border-gray-600 break-all">
                                                            {query.query_expression}
                                                        </code>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                                    No queries configured yet
                                </p>
                            )}
                        </div>

                        {/* Semantic filter */}
                        {group.semantic_filter.enabled && (
                            <div>
                                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
                                    Semantic Filter
                                </p>
                                <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-600 p-3">
                                    <p className="text-sm text-gray-900 dark:text-gray-100">
                                        {group.semantic_filter.criteria}
                                    </p>
                                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                        Threshold: {group.semantic_filter.threshold}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {retrievalConfig.article_limit_per_week && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                        <span className="font-medium text-gray-900 dark:text-white">Article Limit:</span>{' '}
                        {retrievalConfig.article_limit_per_week} articles per week
                    </p>
                </div>
            )}
        </div>
    );
}
