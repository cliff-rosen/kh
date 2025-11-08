import { useState, useEffect } from 'react';
import {
    SparklesIcon,
    ArrowPathIcon,
    PencilIcon,
    CheckCircleIcon,
    ArrowRightIcon,
    ArrowLeftIcon,
    ExclamationTriangleIcon,
    XMarkIcon
} from '@heroicons/react/24/outline';
import { SemanticSpace, RetrievalGroup, SemanticFilter } from '../../types';
import { researchStreamApi } from '../../lib/api/researchStreamApi';

interface FilterConfigPhaseProps {
    streamId: number;
    semanticSpace: SemanticSpace;
    groups: RetrievalGroup[];
    onGroupsChange: (groups: RetrievalGroup[]) => void;
    onComplete: (completed: boolean) => void;
    onBack: () => void;
    onNext: () => void;
}

export default function FilterConfigPhase({
    streamId,
    semanticSpace,
    groups,
    onGroupsChange,
    onComplete,
    onBack,
    onNext
}: FilterConfigPhaseProps) {
    const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
    const [generating, setGenerating] = useState<Record<string, boolean>>({});
    const [editingFilter, setEditingFilter] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<SemanticFilter>({
        enabled: false,
        criteria: '',
        threshold: 0.7
    });

    useEffect(() => {
        // Filters are optional, so mark complete if we have groups with queries
        const hasQueries = groups.some(g =>
            Object.values(g.source_queries).some(q => q?.query_expression?.trim())
        );
        onComplete(hasQueries);
    }, [groups]);

    const handleGenerateFilter = async (groupId: string) => {
        setGenerating({ ...generating, [groupId]: true });

        try {
            const group = groups.find(g => g.group_id === groupId);
            if (!group) return;

            // Get topic details for context
            const topics = group.covered_topics.map(topicId => {
                const topic = semanticSpace.topics.find(t => t.topic_id === topicId);
                return topic ? {
                    topic_id: topic.topic_id,
                    name: topic.name,
                    description: topic.description
                } : null;
            }).filter(t => t !== null);

            // Call LLM to generate filter criteria
            const result = await researchStreamApi.generateSemanticFilter(streamId, {
                group_id: groupId,
                topics: topics,
                rationale: group.rationale
            });

            // Update the group with the generated filter
            const updatedGroups = groups.map(g => {
                if (g.group_id === groupId) {
                    return {
                        ...g,
                        semantic_filter: {
                            enabled: true,
                            criteria: result.criteria,
                            threshold: result.threshold || 0.7
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
            alert(err instanceof Error ? err.message : 'Failed to generate filter');
        } finally {
            setGenerating({ ...generating, [groupId]: false });
        }
    };

    const handleEditFilter = (groupId: string) => {
        const group = groups.find(g => g.group_id === groupId);
        if (!group) return;

        setEditingFilter(groupId);
        setEditForm({ ...group.semantic_filter });
    };

    const handleSaveFilter = () => {
        if (!editingFilter) return;

        const updatedGroups = groups.map(g => {
            if (g.group_id === editingFilter) {
                return {
                    ...g,
                    semantic_filter: editForm,
                    metadata: {
                        ...g.metadata!,
                        human_edited: true
                    }
                };
            }
            return g;
        });

        onGroupsChange(updatedGroups);
        setEditingFilter(null);
        setEditForm({ enabled: false, criteria: '', threshold: 0.7 });
    };

    const handleToggleFilter = (groupId: string) => {
        const updatedGroups = groups.map(g => {
            if (g.group_id === groupId) {
                return {
                    ...g,
                    semantic_filter: {
                        ...g.semantic_filter,
                        enabled: !g.semantic_filter.enabled
                    }
                };
            }
            return g;
        });

        onGroupsChange(updatedGroups);
    };

    const handleDisableFilter = (groupId: string) => {
        const updatedGroups = groups.map(g => {
            if (g.group_id === groupId) {
                return {
                    ...g,
                    semantic_filter: {
                        enabled: false,
                        criteria: '',
                        threshold: 0.7
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
                            Phase 3: Configure Semantic Filters (Optional)
                        </h2>
                        <p className="text-gray-600 dark:text-gray-400">
                            Semantic filters use AI to verify that retrieved articles are truly relevant to your topics.
                            This is optional but recommended for high-precision research streams.
                        </p>
                    </div>
                </div>
            </div>

            {/* Info Box */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                    <div className="flex-1">
                        <h3 className="font-semibold text-blue-900 dark:text-blue-200 mb-1">
                            How Semantic Filters Work
                        </h3>
                        <p className="text-sm text-blue-800 dark:text-blue-300">
                            After retrieving articles using queries, semantic filters apply an AI-powered relevance check.
                            Articles that don't meet the specified criteria and confidence threshold are filtered out.
                            This helps ensure only truly relevant content makes it into your reports.
                        </p>
                    </div>
                </div>
            </div>

            {/* Groups with Filter Configuration */}
            <div className="space-y-4">
                {groups.map((group) => {
                    const isExpanded = expandedGroup === group.group_id;
                    const isGenerating = generating[group.group_id];
                    const hasFilter = group.semantic_filter.enabled && group.semantic_filter.criteria.trim();
                    const isEditing = editingFilter === group.group_id;

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
                                        {hasFilter && (
                                            <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
                                        )}
                                        {!hasFilter && (
                                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                                (No filter)
                                            </span>
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

                                    {isEditing ? (
                                        /* Edit Form */
                                        <div className="space-y-4 border border-gray-300 dark:border-gray-600 rounded-lg p-4">
                                            <div>
                                                <label className="flex items-center gap-2 mb-3">
                                                    <input
                                                        type="checkbox"
                                                        checked={editForm.enabled}
                                                        onChange={(e) => setEditForm({ ...editForm, enabled: e.target.checked })}
                                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                    />
                                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                        Enable semantic filtering for this group
                                                    </span>
                                                </label>
                                            </div>

                                            {editForm.enabled && (
                                                <>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                            Filter Criteria
                                                        </label>
                                                        <textarea
                                                            value={editForm.criteria}
                                                            onChange={(e) => setEditForm({ ...editForm, criteria: e.target.value })}
                                                            rows={4}
                                                            placeholder="Describe what makes an article relevant to this group..."
                                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                                        />
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                            Be specific about what content should pass through this filter.
                                                        </p>
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                            Confidence Threshold: {editForm.threshold.toFixed(2)}
                                                        </label>
                                                        <input
                                                            type="range"
                                                            min="0"
                                                            max="1"
                                                            step="0.05"
                                                            value={editForm.threshold}
                                                            onChange={(e) => setEditForm({ ...editForm, threshold: parseFloat(e.target.value) })}
                                                            className="w-full"
                                                        />
                                                        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                            <span>More permissive (0.0)</span>
                                                            <span>More strict (1.0)</span>
                                                        </div>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                            Higher thresholds filter out more borderline content.
                                                        </p>
                                                    </div>
                                                </>
                                            )}

                                            <div className="flex gap-2">
                                                <button
                                                    onClick={handleSaveFilter}
                                                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                                                >
                                                    Save Filter
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setEditingFilter(null);
                                                        setEditForm({ enabled: false, criteria: '', threshold: 0.7 });
                                                    }}
                                                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        /* Display Mode */
                                        <div className="space-y-3">
                                            {hasFilter ? (
                                                <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 space-y-3">
                                                    <div className="flex items-start justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
                                                            <span className="font-medium text-gray-900 dark:text-white">
                                                                Filter Active
                                                            </span>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => handleEditFilter(group.group_id)}
                                                                className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                                                            >
                                                                <PencilIcon className="h-4 w-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDisableFilter(group.group_id)}
                                                                className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                                                            >
                                                                <XMarkIcon className="h-4 w-4" />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                                                            Criteria:
                                                        </p>
                                                        <p className="text-sm text-gray-700 dark:text-gray-300">
                                                            {group.semantic_filter.criteria}
                                                        </p>
                                                    </div>

                                                    <div>
                                                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                                                            Threshold: {group.semantic_filter.threshold.toFixed(2)}
                                                        </p>
                                                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                                            <div
                                                                className="bg-blue-600 h-2 rounded-full"
                                                                style={{ width: `${group.semantic_filter.threshold * 100}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-6 text-center space-y-3">
                                                    <p className="text-gray-600 dark:text-gray-400">
                                                        No semantic filter configured for this group.
                                                    </p>
                                                    <div className="flex gap-2 justify-center">
                                                        <button
                                                            onClick={() => handleGenerateFilter(group.group_id)}
                                                            disabled={isGenerating}
                                                            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                                                        >
                                                            {isGenerating ? (
                                                                <>
                                                                    <ArrowPathIcon className="h-5 w-5 animate-spin" />
                                                                    Generating...
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <SparklesIcon className="h-5 w-5" />
                                                                    Generate Filter with AI
                                                                </>
                                                            )}
                                                        </button>
                                                        <button
                                                            onClick={() => handleEditFilter(group.group_id)}
                                                            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                                                        >
                                                            <PencilIcon className="h-5 w-5" />
                                                            Create Manually
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Navigation */}
            <div className="flex justify-between pt-4">
                <button
                    onClick={onBack}
                    className="inline-flex items-center gap-2 px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 font-medium"
                >
                    <ArrowLeftIcon className="h-5 w-5" />
                    Back to Queries
                </button>
                <button
                    onClick={onNext}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
                >
                    Continue to Validation
                    <ArrowRightIcon className="h-5 w-5" />
                </button>
            </div>
        </div>
    );
}
