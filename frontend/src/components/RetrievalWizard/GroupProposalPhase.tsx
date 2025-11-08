import { useState, useEffect } from 'react';
import {
    SparklesIcon,
    ArrowPathIcon,
    PlusIcon,
    PencilIcon,
    TrashIcon,
    ExclamationTriangleIcon,
    CheckCircleIcon,
    ArrowRightIcon
} from '@heroicons/react/24/outline';
import { SemanticSpace, RetrievalGroup } from '../../types';
import { researchStreamApi } from '../../lib/api/researchStreamApi';

interface GroupProposalPhaseProps {
    streamId: number;
    semanticSpace: SemanticSpace;
    groups: RetrievalGroup[];
    onGroupsChange: (groups: RetrievalGroup[]) => void;
    onComplete: (completed: boolean) => void;
    onNext: () => void;
}

export default function GroupProposalPhase({
    streamId,
    semanticSpace,
    groups,
    onGroupsChange,
    onComplete,
    onNext
}: GroupProposalPhaseProps) {
    const [generating, setGenerating] = useState(false);
    const [coverage, setCoverage] = useState<any>(null);
    const [editingGroup, setEditingGroup] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<RetrievalGroup>>({});

    useEffect(() => {
        // Mark complete if we have groups with good coverage
        const hasGroups = groups.length > 0;
        const goodCoverage = coverage && coverage.coverage_percentage >= 100;
        onComplete(hasGroups && goodCoverage);
    }, [groups, coverage]);

    const handleGenerate = async () => {
        setGenerating(true);
        try {
            const result = await researchStreamApi.proposeRetrievalGroups(streamId);

            // Convert proposed groups to RetrievalGroup objects
            const proposedGroups: RetrievalGroup[] = result.proposed_groups.map((g: any) => ({
                ...g,
                source_queries: {},
                semantic_filter: {
                    enabled: false,
                    criteria: '',
                    threshold: 0.7
                }
            }));

            onGroupsChange(proposedGroups);
            setCoverage(result.coverage_analysis);
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to generate groups');
        } finally {
            setGenerating(false);
        }
    };

    const handleAddGroup = () => {
        const newGroup: RetrievalGroup = {
            group_id: `grp_manual_${Date.now()}`,
            name: 'New Group',
            covered_topics: [],
            rationale: '',
            source_queries: {},
            semantic_filter: { enabled: false, criteria: '', threshold: 0.7 },
            metadata: {
                generated_at: new Date().toISOString(),
                generated_by: 'user:manual',
                reasoning: 'Manually created by user',
                inputs_considered: [],
                human_edited: true
            }
        };

        onGroupsChange([...groups, newGroup]);
    };

    const handleEditGroup = (groupId: string) => {
        const group = groups.find(g => g.group_id === groupId);
        if (group) {
            setEditingGroup(groupId);
            setEditForm({ ...group });
        }
    };

    const handleSaveEdit = () => {
        if (!editingGroup || !editForm) return;

        const updatedGroups = groups.map(g =>
            g.group_id === editingGroup
                ? {
                      ...g,
                      ...editForm,
                      metadata: {
                          ...g.metadata,
                          generated_at: g.metadata?.generated_at || new Date().toISOString(),
                          generated_by: g.metadata?.generated_by || 'user:manual',
                          reasoning: g.metadata?.reasoning || '',
                          inputs_considered: g.metadata?.inputs_considered || [],
                          human_edited: true
                      }
                  }
                : g
        );

        onGroupsChange(updatedGroups);
        setEditingGroup(null);
        setEditForm({});
    };

    const handleDeleteGroup = (groupId: string) => {
        if (confirm('Are you sure you want to delete this group?')) {
            onGroupsChange(groups.filter(g => g.group_id !== groupId));
        }
    };

    const toggleTopicInGroup = (groupId: string, topicId: string) => {
        const updatedGroups = groups.map(g => {
            if (g.group_id === groupId) {
                const covered_topics = g.covered_topics.includes(topicId)
                    ? g.covered_topics.filter(t => t !== topicId)
                    : [...g.covered_topics, topicId];

                return {
                    ...g,
                    covered_topics,
                    metadata: {
                        ...g.metadata,
                        generated_at: g.metadata?.generated_at || new Date().toISOString(),
                        generated_by: g.metadata?.generated_by || 'user:manual',
                        reasoning: g.metadata?.reasoning || '',
                        inputs_considered: g.metadata?.inputs_considered || [],
                        human_edited: true
                    }
                };
            }
            return g;
        });

        onGroupsChange(updatedGroups);
    };

    return (
        <div className="space-y-6">
            {/* Phase Header */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                            Phase 1: Propose Retrieval Groups
                        </h2>
                        <p className="text-gray-600 dark:text-gray-400 mb-4">
                            Let AI analyze your semantic space and propose optimal groupings for retrieval,
                            or create groups manually. Groups should organize topics that retrieve well together.
                        </p>
                        <button
                            onClick={handleGenerate}
                            disabled={generating}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-md hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 font-medium shadow-sm"
                        >
                            {generating ? (
                                <>
                                    <ArrowPathIcon className="h-5 w-5 animate-spin" />
                                    Analyzing Semantic Space...
                                </>
                            ) : (
                                <>
                                    <SparklesIcon className="h-5 w-5" />
                                    Generate Groups with AI
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Coverage Analysis */}
            {coverage && (
                <div className={`rounded-lg border p-4 ${
                    coverage.is_complete
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                        : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                }`}>
                    <div className="flex items-start gap-3">
                        {coverage.is_complete ? (
                            <CheckCircleIcon className="h-6 w-6 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                        ) : (
                            <ExclamationTriangleIcon className="h-6 w-6 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1">
                            <h3 className={`font-semibold mb-1 ${
                                coverage.is_complete
                                    ? 'text-green-900 dark:text-green-200'
                                    : 'text-yellow-900 dark:text-yellow-200'
                            }`}>
                                Coverage: {coverage.coverage_percentage}% ({coverage.covered_topics}/{coverage.total_topics} topics)
                            </h3>
                            {coverage.warnings && coverage.warnings.length > 0 && (
                                <ul className="text-sm space-y-1">
                                    {coverage.warnings.map((warning: string, idx: number) => (
                                        <li key={idx} className="text-yellow-800 dark:text-yellow-300">
                                            • {warning}
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {coverage.uncovered && coverage.uncovered.length > 0 && (
                                <div className="mt-2">
                                    <p className="text-sm font-medium text-yellow-900 dark:text-yellow-200">
                                        Uncovered topics:
                                    </p>
                                    <ul className="text-sm text-yellow-800 dark:text-yellow-300 ml-4 mt-1">
                                        {coverage.uncovered.map((topic: any) => (
                                            <li key={topic.topic_id}>
                                                • {topic.name} ({topic.importance})
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Groups List */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Retrieval Groups ({groups.length})
                    </h3>
                    <button
                        onClick={handleAddGroup}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md"
                    >
                        <PlusIcon className="h-4 w-4" />
                        Add Group Manually
                    </button>
                </div>

                {groups.length === 0 && (
                    <div className="bg-white dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 p-12 text-center">
                        <SparklesIcon className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                        <p className="text-gray-600 dark:text-gray-400">
                            No groups defined yet. Use AI to generate groups or add them manually.
                        </p>
                    </div>
                )}

                {groups.map((group) => (
                    <div
                        key={group.group_id}
                        className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
                    >
                        {editingGroup === group.group_id ? (
                            <div className="p-4 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Group Name
                                    </label>
                                    <input
                                        type="text"
                                        value={editForm.name || ''}
                                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Rationale
                                    </label>
                                    <textarea
                                        value={editForm.rationale || ''}
                                        onChange={(e) => setEditForm({ ...editForm, rationale: e.target.value })}
                                        rows={3}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Topics in this Group
                                    </label>
                                    <div className="space-y-1 max-h-48 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-md p-3">
                                        {semanticSpace.topics.map((topic) => (
                                            <label key={topic.topic_id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 p-1 rounded">
                                                <input
                                                    type="checkbox"
                                                    checked={editForm.covered_topics?.includes(topic.topic_id) || false}
                                                    onChange={() => {
                                                        const covered = editForm.covered_topics || [];
                                                        setEditForm({
                                                            ...editForm,
                                                            covered_topics: covered.includes(topic.topic_id)
                                                                ? covered.filter(t => t !== topic.topic_id)
                                                                : [...covered, topic.topic_id]
                                                        });
                                                    }}
                                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                />
                                                <span className="text-sm text-gray-900 dark:text-white">{topic.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <button
                                        onClick={handleSaveEdit}
                                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                                    >
                                        Save Changes
                                    </button>
                                    <button
                                        onClick={() => {
                                            setEditingGroup(null);
                                            setEditForm({});
                                        }}
                                        className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="p-4">
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex-1">
                                            <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                                                {group.name}
                                            </h4>
                                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                                {group.covered_topics.length} topics
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleEditGroup(group.group_id)}
                                                className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                                            >
                                                <PencilIcon className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteGroup(group.group_id)}
                                                className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                                            >
                                                <TrashIcon className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                                        {group.rationale}
                                    </p>

                                    <div>
                                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                                            Topics:
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {group.covered_topics.map((topicId) => {
                                                const topic = semanticSpace.topics.find(t => t.topic_id === topicId);
                                                return topic ? (
                                                    <span
                                                        key={topicId}
                                                        className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200"
                                                    >
                                                        {topic.name}
                                                    </span>
                                                ) : null;
                                            })}
                                        </div>
                                    </div>

                                    {group.metadata && (
                                        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                Generated by: {group.metadata.generated_by}
                                                {group.metadata.confidence && ` • Confidence: ${(group.metadata.confidence * 100).toFixed(0)}%`}
                                                {group.metadata.human_edited && ' • Edited by user'}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </div>

            {/* Navigation */}
            {groups.length > 0 && (
                <div className="flex justify-end pt-4">
                    <button
                        onClick={onNext}
                        disabled={!coverage || !coverage.is_complete}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                        Continue to Query Configuration
                        <ArrowRightIcon className="h-5 w-5" />
                    </button>
                </div>
            )}
        </div>
    );
}
