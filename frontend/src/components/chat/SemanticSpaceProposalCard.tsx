import { CheckIcon, XMarkIcon, SparklesIcon } from '@heroicons/react/24/solid';

interface Topic {
    topic_id: string;
    name: string;
    description: string;
    importance: 'critical' | 'important' | 'relevant';
    rationale: string;
    parent_topic?: string | null;
}

interface EntityItem {
    entity_id: string;
    entity_type: string;
    name: string;
    canonical_forms: string[];
    context: string;
}

export interface SemanticSpaceProposalData {
    semantic_space: {
        domain: { name: string; description: string };
        topics: Topic[];
        entities: EntityItem[];
        relationships?: unknown[];
        context: {
            business_context: string;
            decision_types: string[];
            stakeholders: string[];
            time_sensitivity: string;
        };
        coverage: {
            signal_types?: unknown[];
            temporal_scope?: {
                start_date?: string | null;
                end_date?: string | null;
                focus_periods?: string[];
                recency_weight?: number;
                rationale?: string;
            };
            quality_criteria?: {
                peer_review_required?: boolean;
                study_types?: string[];
                exclude_predatory?: boolean;
                language_restrictions?: string[];
            };
            completeness_requirement?: string;
        };
        boundaries: {
            inclusions?: unknown[];
            exclusions?: unknown[];
            edge_cases?: unknown[];
        };
        extraction_metadata?: unknown;
    };
    reasoning: string;
}

interface SemanticSpaceProposalCardProps {
    data: SemanticSpaceProposalData;
    onAccept?: (data: SemanticSpaceProposalData) => void;
    onReject?: () => void;
}

export default function SemanticSpaceProposalCard({ data, onAccept, onReject }: SemanticSpaceProposalCardProps) {
    const ss = data.semantic_space;

    const importanceBadge = (importance: string) => {
        const colors: Record<string, string> = {
            critical: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200',
            important: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200',
            relevant: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
        };
        return colors[importance] || colors.relevant;
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div>
                <div className="flex items-center gap-2 mb-2">
                    <SparklesIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    <h4 className="font-semibold text-gray-900 dark:text-white">
                        Semantic Space Proposal
                    </h4>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    AI-generated semantic space from your description
                </p>
            </div>

            {/* Reasoning */}
            {data.reasoning && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide mb-1">
                        Reasoning
                    </p>
                    <p className="text-sm text-blue-900 dark:text-blue-100 italic">
                        {data.reasoning}
                    </p>
                </div>
            )}

            {/* Domain */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">
                    Domain
                </p>
                <p className="font-semibold text-gray-900 dark:text-white mb-1">
                    {ss.domain.name}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    {ss.domain.description}
                </p>
            </div>

            {/* Topics */}
            {ss.topics && ss.topics.length > 0 && (
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">
                        Topics ({ss.topics.length})
                    </p>
                    <div className="space-y-3">
                        {ss.topics.map((topic, idx) => (
                            <div key={idx} className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
                                <div className="flex items-start justify-between mb-1">
                                    <p className="font-medium text-gray-900 dark:text-white">
                                        {topic.name}
                                    </p>
                                    <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ml-2 ${importanceBadge(topic.importance)}`}>
                                        {topic.importance}
                                    </span>
                                </div>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    {topic.description}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Entities */}
            {ss.entities && ss.entities.length > 0 && (
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">
                        Entities ({ss.entities.length})
                    </p>
                    <div className="space-y-3">
                        {ss.entities.map((entity, idx) => (
                            <div key={idx} className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
                                <div className="flex items-start justify-between mb-1">
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-white">
                                            {entity.name}
                                        </p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            {entity.entity_type}
                                        </p>
                                    </div>
                                </div>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    {entity.context}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Context Summary */}
            {ss.context && (
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">
                        Context
                    </p>
                    <p className="text-sm text-gray-900 dark:text-white mb-2">
                        {ss.context.business_context}
                    </p>
                    <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                        <p>Time sensitivity: {ss.context.time_sensitivity}</p>
                        {ss.context.stakeholders.length > 0 && (
                            <p>Stakeholders: {ss.context.stakeholders.join(', ')}</p>
                        )}
                    </div>
                </div>
            )}

            {/* Coverage Summary */}
            {ss.coverage && (
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">
                        Coverage
                    </p>
                    <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                        {ss.coverage.completeness_requirement && (
                            <p>{ss.coverage.completeness_requirement}</p>
                        )}
                        {ss.coverage.quality_criteria?.study_types && ss.coverage.quality_criteria.study_types.length > 0 && (
                            <p>Study types: {ss.coverage.quality_criteria.study_types.join(', ')}</p>
                        )}
                        {ss.coverage.quality_criteria?.language_restrictions && ss.coverage.quality_criteria.language_restrictions.length > 0 && (
                            <p>Languages: {ss.coverage.quality_criteria.language_restrictions.join(', ')}</p>
                        )}
                    </div>
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
                {onAccept && (
                    <button
                        onClick={() => onAccept(data)}
                        className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm"
                    >
                        <CheckIcon className="h-5 w-5" />
                        Accept Semantic Space
                    </button>
                )}
                {onReject && (
                    <button
                        onClick={onReject}
                        className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm"
                    >
                        <XMarkIcon className="h-5 w-5" />
                        Dismiss
                    </button>
                )}
            </div>
        </div>
    );
}
