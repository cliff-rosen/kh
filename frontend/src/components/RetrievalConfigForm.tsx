import { useState } from 'react';
import { RetrievalConfig, RetrievalGroup, SemanticSpace, SourceQuery } from '../types';
import { PlusIcon, TrashIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

interface RetrievalConfigFormProps {
    retrievalConfig: RetrievalConfig;
    semanticSpace: SemanticSpace;
    onChange: (updated: RetrievalConfig) => void;
}

export default function RetrievalConfigForm({
    retrievalConfig,
    semanticSpace,
    onChange
}: RetrievalConfigFormProps) {
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    const toggleGroup = (groupId: string) => {
        const newExpanded = new Set(expandedGroups);
        if (newExpanded.has(groupId)) {
            newExpanded.delete(groupId);
        } else {
            newExpanded.add(groupId);
        }
        setExpandedGroups(newExpanded);
    };

    const addGroup = () => {
        const newGroup: RetrievalGroup = {
            group_id: `group_${Date.now()}`,
            name: '',
            covered_topics: [],
            rationale: '',
            source_queries: {},
            semantic_filter: {
                enabled: false,
                criteria: '',
                threshold: 0.7
            }
        };

        onChange({
            ...retrievalConfig,
            retrieval_groups: [...retrievalConfig.retrieval_groups, newGroup]
        });

        // Auto-expand the new group
        setExpandedGroups(new Set([...expandedGroups, newGroup.group_id]));
    };

    const removeGroup = (groupId: string) => {
        if (retrievalConfig.retrieval_groups.length === 1) {
            alert('At least one retrieval group is required');
            return;
        }

        onChange({
            ...retrievalConfig,
            retrieval_groups: retrievalConfig.retrieval_groups.filter(g => g.group_id !== groupId)
        });
    };

    const updateGroup = (groupId: string, updates: Partial<RetrievalGroup>) => {
        onChange({
            ...retrievalConfig,
            retrieval_groups: retrievalConfig.retrieval_groups.map(g =>
                g.group_id === groupId ? { ...g, ...updates } : g
            )
        });
    };

    const handleTopicsChange = (groupId: string, value: string) => {
        const topics = value.split(',').map(s => s.trim()).filter(s => s);
        updateGroup(groupId, { covered_topics: topics });
    };

    const handleSourceQueriesChange = (groupId: string, value: string) => {
        // Parse format: "source_id: query_expression" per line
        const lines = value.split('\n').filter(l => l.trim());
        const queries: Record<string, SourceQuery> = {};

        lines.forEach(line => {
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0) {
                const sourceId = line.substring(0, colonIndex).trim();
                const queryExpression = line.substring(colonIndex + 1).trim();
                if (sourceId && queryExpression) {
                    queries[sourceId] = {
                        query_expression: queryExpression,
                        enabled: true
                    };
                }
            }
        });

        updateGroup(groupId, { source_queries: queries });
    };

    const formatSourceQueries = (queries: Record<string, SourceQuery | null>): string => {
        return Object.entries(queries)
            .filter(([_, q]) => q && q.enabled)
            .map(([sourceId, query]) => `${sourceId}: ${query!.query_expression}`)
            .join('\n');
    };

    const updateSemanticFilter = (groupId: string, field: 'enabled' | 'criteria' | 'threshold', value: any) => {
        const group = retrievalConfig.retrieval_groups.find(g => g.group_id === groupId);
        if (!group) return;

        updateGroup(groupId, {
            semantic_filter: {
                ...group.semantic_filter,
                [field]: value
            }
        });
    };

    return (
        <div className="space-y-6">
            {/* Article Limit */}
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Article Limit per Week
                </label>
                <input
                    type="number"
                    min="1"
                    value={retrievalConfig.article_limit_per_week || 10}
                    onChange={(e) => onChange({
                        ...retrievalConfig,
                        article_limit_per_week: parseInt(e.target.value) || 10
                    })}
                    className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Maximum number of articles to retrieve per week
                </p>
            </div>

            {/* Retrieval Groups */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Retrieval Groups *
                    </label>
                    <button
                        type="button"
                        onClick={addGroup}
                        className="flex items-center gap-1 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                    >
                        <PlusIcon className="h-4 w-4" />
                        Add Group
                    </button>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Groups organize topics for efficient retrieval and filtering
                </p>

                {retrievalConfig.retrieval_groups.map((group, index) => {
                    const isExpanded = expandedGroups.has(group.group_id);

                    return (
                        <div
                            key={group.group_id}
                            className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden"
                        >
                            {/* Group Header */}
                            <div className="bg-gray-50 dark:bg-gray-800 p-4">
                                <div className="flex items-center justify-between">
                                    <button
                                        type="button"
                                        onClick={() => toggleGroup(group.group_id)}
                                        className="flex items-center gap-2 flex-1 text-left"
                                    >
                                        {isExpanded ? (
                                            <ChevronDownIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                                        ) : (
                                            <ChevronRightIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                                        )}
                                        <div>
                                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                                                {group.name || `Group ${index + 1}`}
                                            </h3>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                                {group.covered_topics.length} topics, {Object.keys(group.source_queries).length} sources
                                            </p>
                                        </div>
                                    </button>
                                    {retrievalConfig.retrieval_groups.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removeGroup(group.group_id)}
                                            className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 p-1"
                                        >
                                            <TrashIcon className="h-5 w-5" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Group Content */}
                            {isExpanded && (
                                <div className="p-4 space-y-4 bg-white dark:bg-gray-900">
                                    {/* Group Name */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Group Name *
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="e.g., Medical Research"
                                            value={group.name}
                                            onChange={(e) => updateGroup(group.group_id, { name: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                            required
                                        />
                                    </div>

                                    {/* Rationale */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Rationale
                                        </label>
                                        <textarea
                                            placeholder="Why these topics are grouped together for retrieval"
                                            rows={2}
                                            value={group.rationale}
                                            onChange={(e) => updateGroup(group.group_id, { rationale: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                    </div>

                                    {/* Covered Topics */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Covered Topics *
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="topic_id_1, topic_id_2, topic_id_3"
                                            value={group.covered_topics.join(', ')}
                                            onChange={(e) => handleTopicsChange(group.group_id, e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                            required
                                        />
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                            Topic IDs from semantic space (comma-separated)
                                        </p>
                                        {semanticSpace.topics.length > 0 && (
                                            <div className="mt-2 flex flex-wrap gap-1">
                                                <span className="text-xs text-gray-500 dark:text-gray-400">Available:</span>
                                                {semanticSpace.topics.map(topic => (
                                                    <span
                                                        key={topic.topic_id}
                                                        className="text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200 px-2 py-0.5 rounded"
                                                    >
                                                        {topic.topic_id}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Source Queries */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Source Queries
                                        </label>
                                        <textarea
                                            placeholder="One query per line, format: source_id: query_expression&#10;pubmed: (mesothelioma OR asbestos) AND cancer&#10;scopus: TITLE-ABS-KEY(asbestos)"
                                            rows={4}
                                            value={formatSourceQueries(group.source_queries)}
                                            onChange={(e) => handleSourceQueriesChange(group.group_id, e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                                        />
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                            Source-specific queries (one per line, format: source_id: query)
                                        </p>
                                    </div>

                                    {/* Semantic Filter */}
                                    <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                                Semantic Filter
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={group.semantic_filter.enabled}
                                                    onChange={(e) => updateSemanticFilter(group.group_id, 'enabled', e.target.checked)}
                                                    className="rounded border-gray-300 dark:border-gray-600"
                                                />
                                                <span className="text-sm text-gray-700 dark:text-gray-300">Enable</span>
                                            </label>
                                        </div>

                                        {group.semantic_filter.enabled && (
                                            <div className="space-y-3 bg-gray-50 dark:bg-gray-800 p-3 rounded-md">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                        Filter Criteria
                                                    </label>
                                                    <textarea
                                                        placeholder="Description of what makes an article relevant to this group"
                                                        rows={3}
                                                        value={group.semantic_filter.criteria}
                                                        onChange={(e) => updateSemanticFilter(group.group_id, 'criteria', e.target.value)}
                                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                                    />
                                                </div>

                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                        Threshold (0.0 - 1.0)
                                                    </label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="1"
                                                        step="0.1"
                                                        value={group.semantic_filter.threshold}
                                                        onChange={(e) => updateSemanticFilter(group.group_id, 'threshold', parseFloat(e.target.value))}
                                                        className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                                    />
                                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                                        Confidence threshold for filtering
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
