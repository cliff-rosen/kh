import { useState, useEffect } from 'react';
import {
    CheckCircleIcon,
    ExclamationTriangleIcon,
    ArrowLeftIcon,
    ArrowPathIcon,
    XCircleIcon
} from '@heroicons/react/24/outline';
import { SemanticSpace, RetrievalGroup } from '../../types';
import { researchStreamApi } from '../../lib/api/researchStreamApi';

interface ValidationPhaseProps {
    streamId: number;
    semanticSpace: SemanticSpace;
    groups: RetrievalGroup[];
    onBack: () => void;
    onFinalize: () => Promise<void>;
    saving: boolean;
}

interface ValidationResult {
    is_complete: boolean;
    coverage: {
        total_topics: number;
        covered_topics: number;
        coverage_percentage: number;
        uncovered: Array<{ topic_id: string; name: string; importance: string }>;
        over_covered: Array<{ topic_id: string; topic_name: string; group_count: number }>;
        warnings: string[];
        is_complete: boolean;
    };
    configuration_status: {
        groups_without_queries: string[];
        groups_without_filters: string[];
    };
    warnings: string[];
    ready_to_activate: boolean;
}

export default function ValidationPhase({
    streamId,
    semanticSpace,
    groups,
    onBack,
    onFinalize,
    saving
}: ValidationPhaseProps) {
    const [validating, setValidating] = useState(false);
    const [validation, setValidation] = useState<ValidationResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Run validation automatically when phase loads
        handleValidate();
    }, []);

    const handleValidate = async () => {
        setValidating(true);
        setError(null);

        try {
            const result = await researchStreamApi.validateRetrievalGroups(streamId, {
                groups: groups
            });

            setValidation(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to validate configuration');
        } finally {
            setValidating(false);
        }
    };

    const getGroupTopicNames = (group: RetrievalGroup) => {
        return group.covered_topics
            .map(topicId => {
                const topic = semanticSpace.topics.find(t => t.topic_id === topicId);
                return topic?.name || topicId;
            })
            .join(', ');
    };

    const countConfiguredQueries = (group: RetrievalGroup) => {
        return Object.values(group.source_queries).filter(q => q?.query_expression?.trim()).length;
    };

    return (
        <div className="space-y-6">
            {/* Phase Header */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                            Phase 4: Validate & Finalize
                        </h2>
                        <p className="text-gray-600 dark:text-gray-400">
                            Review your retrieval configuration for completeness and readiness.
                            Once validated, you can activate this configuration for your research stream.
                        </p>
                    </div>
                    <button
                        onClick={handleValidate}
                        disabled={validating}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                    >
                        {validating ? (
                            <>
                                <ArrowPathIcon className="h-5 w-5 animate-spin" />
                                Validating...
                            </>
                        ) : (
                            <>
                                <ArrowPathIcon className="h-5 w-5" />
                                Re-validate
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Error State */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                        <XCircleIcon className="h-6 w-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                        <div>
                            <h3 className="font-semibold text-red-900 dark:text-red-200 mb-1">
                                Validation Failed
                            </h3>
                            <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Validation Results */}
            {validation && (
                <div className="space-y-4">
                    {/* Overall Status */}
                    <div className={`rounded-lg border p-6 ${
                        validation.ready_to_activate
                            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                            : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                    }`}>
                        <div className="flex items-start gap-4">
                            {validation.ready_to_activate ? (
                                <CheckCircleIcon className="h-8 w-8 text-green-600 dark:text-green-400 flex-shrink-0" />
                            ) : (
                                <ExclamationTriangleIcon className="h-8 w-8 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
                            )}
                            <div className="flex-1">
                                <h3 className={`text-lg font-semibold mb-2 ${
                                    validation.ready_to_activate
                                        ? 'text-green-900 dark:text-green-200'
                                        : 'text-yellow-900 dark:text-yellow-200'
                                }`}>
                                    {validation.ready_to_activate
                                        ? 'Configuration Ready to Activate'
                                        : 'Configuration Needs Attention'
                                    }
                                </h3>
                                <p className={`text-sm ${
                                    validation.ready_to_activate
                                        ? 'text-green-800 dark:text-green-300'
                                        : 'text-yellow-800 dark:text-yellow-300'
                                }`}>
                                    {validation.ready_to_activate
                                        ? 'All checks passed. Your retrieval configuration is complete and ready to use.'
                                        : 'Some issues were found. Please review the details below and make necessary adjustments.'
                                    }
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Coverage Analysis */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            Topic Coverage
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        {validation.coverage.covered_topics} of {validation.coverage.total_topics} topics covered
                                    </span>
                                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                                        {validation.coverage.coverage_percentage}%
                                    </span>
                                </div>
                                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                                    <div
                                        className={`h-3 rounded-full ${
                                            validation.coverage.is_complete
                                                ? 'bg-green-600'
                                                : 'bg-yellow-600'
                                        }`}
                                        style={{ width: `${validation.coverage.coverage_percentage}%` }}
                                    />
                                </div>
                            </div>

                            {validation.coverage.uncovered.length > 0 && (
                                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                                    <h4 className="text-sm font-semibold text-yellow-900 dark:text-yellow-200 mb-2">
                                        Uncovered Topics ({validation.coverage.uncovered.length})
                                    </h4>
                                    <ul className="space-y-1">
                                        {validation.coverage.uncovered.map((topic) => (
                                            <li key={topic.topic_id} className="text-sm text-yellow-800 dark:text-yellow-300">
                                                • <span className="font-medium">{topic.name}</span>
                                                <span className="ml-2 text-xs">({topic.importance})</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {validation.coverage.over_covered.length > 0 && (
                                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                                    <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
                                        Topics in Multiple Groups ({validation.coverage.over_covered.length})
                                    </h4>
                                    <ul className="space-y-1">
                                        {validation.coverage.over_covered.map((topic) => (
                                            <li key={topic.topic_id} className="text-sm text-blue-800 dark:text-blue-300">
                                                • <span className="font-medium">{topic.topic_name}</span>
                                                <span className="ml-2 text-xs">(in {topic.group_count} groups)</span>
                                            </li>
                                        ))}
                                    </ul>
                                    <p className="text-xs text-blue-700 dark:text-blue-400 mt-2">
                                        Topics can appear in multiple groups. This may result in duplicate articles.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Configuration Status */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            Configuration Status
                        </h3>

                        <div className="space-y-4">
                            {/* Groups without queries */}
                            {validation.configuration_status.groups_without_queries.length > 0 ? (
                                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                                    <div className="flex items-start gap-3">
                                        <XCircleIcon className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                                        <div>
                                            <h4 className="text-sm font-semibold text-red-900 dark:text-red-200 mb-2">
                                                Groups Without Queries ({validation.configuration_status.groups_without_queries.length})
                                            </h4>
                                            <ul className="text-sm text-red-800 dark:text-red-300 space-y-1">
                                                {validation.configuration_status.groups_without_queries.map((groupName) => (
                                                    <li key={groupName}>• {groupName}</li>
                                                ))}
                                            </ul>
                                            <p className="text-xs text-red-700 dark:text-red-400 mt-2">
                                                Each group must have at least one source query configured.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-start gap-3 text-green-700 dark:text-green-300">
                                    <CheckCircleIcon className="h-5 w-5 flex-shrink-0 mt-0.5" />
                                    <span className="text-sm">All groups have queries configured</span>
                                </div>
                            )}

                            {/* Groups without filters */}
                            {validation.configuration_status.groups_without_filters.length > 0 ? (
                                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                                    <div className="flex items-start gap-3">
                                        <ExclamationTriangleIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                                        <div>
                                            <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
                                                Groups Without Semantic Filters ({validation.configuration_status.groups_without_filters.length})
                                            </h4>
                                            <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
                                                {validation.configuration_status.groups_without_filters.map((groupName) => (
                                                    <li key={groupName}>• {groupName}</li>
                                                ))}
                                            </ul>
                                            <p className="text-xs text-blue-700 dark:text-blue-400 mt-2">
                                                Semantic filters are optional but recommended for higher precision.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-start gap-3 text-green-700 dark:text-green-300">
                                    <CheckCircleIcon className="h-5 w-5 flex-shrink-0 mt-0.5" />
                                    <span className="text-sm">All groups have semantic filters configured</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Group Summary */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            Retrieval Groups Summary ({groups.length})
                        </h3>

                        <div className="space-y-3">
                            {groups.map((group) => {
                                const queryCount = countConfiguredQueries(group);
                                const hasFilter = group.semantic_filter.enabled && group.semantic_filter.criteria.trim();

                                return (
                                    <div
                                        key={group.group_id}
                                        className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                                    >
                                        <div className="flex items-start justify-between mb-2">
                                            <h4 className="font-semibold text-gray-900 dark:text-white">
                                                {group.name}
                                            </h4>
                                            <div className="flex gap-2">
                                                {queryCount > 0 && (
                                                    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200">
                                                        {queryCount} {queryCount === 1 ? 'query' : 'queries'}
                                                    </span>
                                                )}
                                                {hasFilter && (
                                                    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200">
                                                        Filtered
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">
                                            {getGroupTopicNames(group)}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Warnings */}
                    {validation.warnings.length > 0 && (
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                            <div className="flex items-start gap-3">
                                <ExclamationTriangleIcon className="h-6 w-6 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    <h3 className="font-semibold text-yellow-900 dark:text-yellow-200 mb-2">
                                        Warnings
                                    </h3>
                                    <ul className="text-sm text-yellow-800 dark:text-yellow-300 space-y-1">
                                        {validation.warnings.map((warning, idx) => (
                                            <li key={idx}>• {warning}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between pt-4">
                <button
                    onClick={onBack}
                    className="inline-flex items-center gap-2 px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 font-medium"
                >
                    <ArrowLeftIcon className="h-5 w-5" />
                    Back to Filters
                </button>
                <button
                    onClick={onFinalize}
                    disabled={!validation?.ready_to_activate || saving}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                    {saving ? (
                        <>
                            <ArrowPathIcon className="h-5 w-5 animate-spin" />
                            Saving Configuration...
                        </>
                    ) : (
                        <>
                            <CheckCircleIcon className="h-5 w-5" />
                            Finalize & Activate
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
