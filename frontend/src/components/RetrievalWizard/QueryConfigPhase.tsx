import { useState, useEffect } from 'react';
import {
    SparklesIcon,
    ArrowPathIcon,
    PencilIcon,
    CheckCircleIcon,
    BeakerIcon,
    ExclamationTriangleIcon,
    CalendarIcon
} from '@heroicons/react/24/outline';
import { SemanticSpace, RetrievalGroup, InformationSource } from '../../types';
import { researchStreamApi } from '../../lib/api/researchStreamApi';

interface QueryConfigPhaseProps {
    streamId: number;
    semanticSpace: SemanticSpace;
    groups: RetrievalGroup[];
    sources: InformationSource[];
    onGroupsChange: (groups: RetrievalGroup[]) => void;
    onComplete: (completed: boolean) => void;
}

interface QueryTestResult {
    source_id: string;
    article_count: number;
    sample_titles: string[];
}

// Calculate default dates (last 7 days)
const getDefaultDates = () => {
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    return {
        startDate: weekAgo.toISOString().split('T')[0], // YYYY-MM-DD
        endDate: today.toISOString().split('T')[0]
    };
};

export default function QueryConfigPhase({
    streamId,
    semanticSpace,
    groups,
    sources,
    onGroupsChange,
    onComplete
}: QueryConfigPhaseProps) {
    const defaults = getDefaultDates();
    const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
    const [generating, setGenerating] = useState<Record<string, boolean>>({});
    const [testing, setTesting] = useState<Record<string, boolean>>({});
    const [testResults, setTestResults] = useState<Record<string, QueryTestResult>>({});
    const [editingQuery, setEditingQuery] = useState<{ groupId: string; sourceId: string } | null>(null);
    const [editForm, setEditForm] = useState<string>('');
    const [startDate, setStartDate] = useState(defaults.startDate);
    const [endDate, setEndDate] = useState(defaults.endDate);
    const [showDateFilter, setShowDateFilter] = useState(false);

    // Filter to only show PubMed and Google Scholar
    const filteredSources = sources.filter(
        source => source.source_id === 'pubmed' || source.source_id === 'google_scholar'
    );

    useEffect(() => {
        // Mark complete if all groups have at least one configured query
        const allHaveQueries = groups.every(group => {
            return Object.values(group.source_queries).some(q => q?.query_expression?.trim());
        });
        onComplete(allHaveQueries);
    }, [groups]);

    const handleGenerateQueries = async (groupId: string, sourceId: string) => {
        const key = `${groupId}_${sourceId}`;
        setGenerating({ ...generating, [key]: true });

        try {
            const group = groups.find(g => g.group_id === groupId);
            if (!group) return;

            const result = await researchStreamApi.generateGroupQueries(streamId, {
                group_id: groupId,
                source_id: sourceId,
                covered_topics: group.covered_topics
            });

            // Update the group with the generated query
            const updatedGroups = groups.map(g => {
                if (g.group_id === groupId) {
                    return {
                        ...g,
                        source_queries: {
                            ...g.source_queries,
                            [sourceId]: {
                                query_expression: result.query_expression,
                                enabled: true
                            }
                        },
                        metadata: {
                            ...g.metadata!,
                            human_edited: false
                        }
                    };
                }
                return g;
            });

            onGroupsChange(updatedGroups);
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to generate queries');
        } finally {
            setGenerating({ ...generating, [key]: false });
        }
    };

    const handleTestQuery = async (groupId: string, sourceId: string) => {
        const key = `${groupId}_${sourceId}`;
        setTesting({ ...testing, [key]: true });

        try {
            const group = groups.find(g => g.group_id === groupId);
            if (!group) return;

            const query = group.source_queries[sourceId];
            if (!query?.query_expression) return;

            // Convert YYYY-MM-DD to YYYY/MM/DD for backend
            const formattedStartDate = startDate.replace(/-/g, '/');
            const formattedEndDate = endDate.replace(/-/g, '/');

            const result = await researchStreamApi.testSourceQuery(streamId, {
                source_id: sourceId,
                query_expression: query.query_expression,
                start_date: formattedStartDate,
                end_date: formattedEndDate,
                date_type: 'entry',
                sort_by: 'relevance',
                max_results: 10
            });

            // Extract titles from sample_articles
            const sampleTitles = result.sample_articles?.map(article => article.title || 'Untitled') || [];

            setTestResults({
                ...testResults,
                [key]: {
                    source_id: sourceId,
                    article_count: result.article_count,
                    sample_titles: sampleTitles
                }
            });
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to test query');
        } finally {
            setTesting({ ...testing, [key]: false });
        }
    };

    const handleEditQuery = (groupId: string, sourceId: string) => {
        const group = groups.find(g => g.group_id === groupId);
        const query = group?.source_queries[sourceId];
        setEditingQuery({ groupId, sourceId });
        setEditForm(query?.query_expression || '');
    };

    const handleSaveQuery = () => {
        if (!editingQuery) return;

        const updatedGroups = groups.map(g => {
            if (g.group_id === editingQuery.groupId) {
                return {
                    ...g,
                    source_queries: {
                        ...g.source_queries,
                        [editingQuery.sourceId]: {
                            query_expression: editForm,
                            enabled: true
                        }
                    },
                    metadata: {
                        ...g.metadata!,
                        human_edited: true
                    }
                };
            }
            return g;
        });

        onGroupsChange(updatedGroups);
        setEditingQuery(null);
        setEditForm('');
    };

    const handleToggleSource = (groupId: string, sourceId: string) => {
        const updatedGroups = groups.map(g => {
            if (g.group_id === groupId) {
                const currentQuery = g.source_queries[sourceId];
                return {
                    ...g,
                    source_queries: {
                        ...g.source_queries,
                        [sourceId]: currentQuery
                            ? { ...currentQuery, enabled: !currentQuery.enabled }
                            : { query_expression: '', enabled: true }
                    }
                };
            }
            return g;
        });

        onGroupsChange(updatedGroups);
    };

    const getGroupTopicNames = (group: RetrievalGroup) => {
        return group.covered_topics
            .map(topicId => {
                const topic = semanticSpace.topics.find(t => t.topic_id === topicId);
                return topic?.name || topicId;
            })
            .join(', ');
    };

    return (
        <div className="space-y-6">
            {/* Phase Header */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                            Phase 2: Configure Source Queries
                        </h2>
                        <p className="text-gray-600 dark:text-gray-400">
                            For each retrieval group, select information sources and generate optimized queries.
                            Test queries to verify they return relevant results.
                        </p>
                    </div>
                </div>
            </div>

            {/* Date Range Filter */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                <button
                    onClick={() => setShowDateFilter(!showDateFilter)}
                    className="w-full flex items-center justify-between text-left"
                >
                    <div className="flex items-center gap-2">
                        <CalendarIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                        <h3 className="font-medium text-gray-900 dark:text-white">
                            Date Range for Query Testing
                        </h3>
                    </div>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                        {showDateFilter ? '▼' : '▶'}
                    </span>
                </button>

                {showDateFilter && (
                    <div className="mt-4 space-y-3">
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            Test queries against articles that entered PubMed during this date range.
                            This helps verify your queries will find recent, relevant articles.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Start Date
                                </label>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    End Date
                                </label>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Currently testing: {startDate} to {endDate} (last 7 days by default)
                        </p>
                    </div>
                )}
            </div>

            {/* Groups with Query Configuration */}
            <div className="space-y-4">
                {groups.map((group) => {
                    const isExpanded = expandedGroup === group.group_id;
                    const hasQueries = Object.values(group.source_queries).some(q => q?.query_expression?.trim());

                    return (
                        <div
                            key={group.group_id}
                            className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
                        >
                            {/* Group Header */}
                            <button
                                onClick={() => setExpandedGroup(isExpanded ? null : group.group_id)}
                                className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                                <div className="flex-1 text-left">
                                    <div className="flex items-center gap-3">
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                            {group.name}
                                        </h3>
                                        {hasQueries && (
                                            <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                        Topics: {getGroupTopicNames(group)}
                                    </p>
                                </div>
                                <div className="text-gray-400">
                                    {isExpanded ? '▼' : '▶'}
                                </div>
                            </button>

                            {/* Expanded Content */}
                            {isExpanded && (
                                <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-4">
                                    <p className="text-sm text-gray-700 dark:text-gray-300">
                                        {group.rationale}
                                    </p>

                                    {/* Sources */}
                                    <div className="space-y-3">
                                        <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                                            Information Sources
                                        </h4>

                                        {filteredSources.map((source) => {
                                            const query = group.source_queries[source.source_id];
                                            const key = `${group.group_id}_${source.source_id}`;
                                            const isGenerating = generating[key];
                                            const isTesting = testing[key];
                                            const testResult = testResults[key];
                                            const isEditing = editingQuery?.groupId === group.group_id && editingQuery?.sourceId === source.source_id;

                                            return (
                                                <div
                                                    key={source.source_id}
                                                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3"
                                                >
                                                    {/* Source Header */}
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <input
                                                                type="checkbox"
                                                                checked={query?.enabled || false}
                                                                onChange={() => handleToggleSource(group.group_id, source.source_id)}
                                                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                            />
                                                            <div>
                                                                <h5 className="font-medium text-gray-900 dark:text-white">
                                                                    {source.name}
                                                                </h5>
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                                    {source.source_type}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        {query?.enabled && (
                                                            <button
                                                                onClick={() => handleGenerateQueries(group.group_id, source.source_id)}
                                                                disabled={isGenerating}
                                                                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                                                            >
                                                                {isGenerating ? (
                                                                    <>
                                                                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                                                        Generating...
                                                                    </>
                                                                ) : query?.query_expression ? (
                                                                    <>
                                                                        <ArrowPathIcon className="h-4 w-4" />
                                                                        Regenerate
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <SparklesIcon className="h-4 w-4" />
                                                                        Generate Query
                                                                    </>
                                                                )}
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Query Display/Edit */}
                                                    {query?.enabled && query.query_expression && (
                                                        <div className="space-y-2">
                                                            {isEditing ? (
                                                                <div className="space-y-2">
                                                                    <textarea
                                                                        value={editForm}
                                                                        onChange={(e) => setEditForm(e.target.value)}
                                                                        rows={4}
                                                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                                                                    />
                                                                    <div className="flex gap-2">
                                                                        <button
                                                                            onClick={handleSaveQuery}
                                                                            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                                                                        >
                                                                            Save
                                                                        </button>
                                                                        <button
                                                                            onClick={() => {
                                                                                setEditingQuery(null);
                                                                                setEditForm('');
                                                                            }}
                                                                            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                                                                        >
                                                                            Cancel
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-start gap-2">
                                                                    <div className="flex-1 bg-gray-50 dark:bg-gray-900 p-3 rounded-md">
                                                                        <code className="text-sm text-gray-900 dark:text-white">
                                                                            {query.query_expression}
                                                                        </code>
                                                                    </div>
                                                                    <div className="flex gap-1">
                                                                        <button
                                                                            onClick={() => handleEditQuery(group.group_id, source.source_id)}
                                                                            className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                                                                        >
                                                                            <PencilIcon className="h-4 w-4" />
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleTestQuery(group.group_id, source.source_id)}
                                                                            disabled={isTesting}
                                                                            className="p-2 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded disabled:opacity-50"
                                                                        >
                                                                            {isTesting ? (
                                                                                <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                                                            ) : (
                                                                                <BeakerIcon className="h-4 w-4" />
                                                                            )}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Test Results */}
                                                            {testResult && (
                                                                testResult.article_count === 0 ? (
                                                                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-3">
                                                                        <div className="flex items-start gap-2">
                                                                            <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                                                                            <div className="flex-1">
                                                                                <p className="text-sm font-medium text-yellow-900 dark:text-yellow-200">
                                                                                    No articles found
                                                                                </p>
                                                                                <p className="text-xs text-yellow-800 dark:text-yellow-300 mt-1">
                                                                                    The query may be too restrictive or there may be no matching results in {source.name}. Try adjusting the query or checking the source.
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md p-3">
                                                                        <div className="flex items-start gap-2">
                                                                            <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                                                                            <div className="flex-1">
                                                                                <p className="text-sm font-medium text-green-900 dark:text-green-200">
                                                                                    Found {testResult.article_count} articles
                                                                                </p>
                                                                                {testResult.sample_titles.length > 0 && (
                                                                                    <div className="mt-2">
                                                                                        <p className="text-xs font-medium text-green-800 dark:text-green-300 mb-1">
                                                                                            Sample titles:
                                                                                        </p>
                                                                                        <ul className="text-xs text-green-700 dark:text-green-400 space-y-1">
                                                                                            {testResult.sample_titles.map((title, idx) => (
                                                                                                <li key={idx}>• {title}</li>
                                                                                            ))}
                                                                                        </ul>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Warning if no queries configured */}
            {groups.length > 0 && !groups.some(g => Object.values(g.source_queries).some(q => q?.query_expression?.trim())) && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                        <ExclamationTriangleIcon className="h-6 w-6 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                        <div>
                            <h3 className="font-semibold text-yellow-900 dark:text-yellow-200 mb-1">
                                No queries configured
                            </h3>
                            <p className="text-sm text-yellow-800 dark:text-yellow-300">
                                Each retrieval group needs at least one source query configured. Expand groups above and generate queries.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
