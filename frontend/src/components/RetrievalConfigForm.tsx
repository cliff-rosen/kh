import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { RetrievalConfig } from '../types';
import { SparklesIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

interface RetrievalConfigFormProps {
    retrievalConfig: RetrievalConfig;
    onChange: (updated: RetrievalConfig) => void;
}

export default function RetrievalConfigForm({
    retrievalConfig,
    onChange
}: RetrievalConfigFormProps) {
    const navigate = useNavigate();
    const { id } = useParams();
    const [expandedConcepts, setExpandedConcepts] = useState<Set<string>>(new Set());

    const toggleConcept = (conceptId: string) => {
        const newExpanded = new Set(expandedConcepts);
        if (newExpanded.has(conceptId)) {
            newExpanded.delete(conceptId);
        } else {
            newExpanded.add(conceptId);
        }
        setExpandedConcepts(newExpanded);
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

            {/* Concept Configuration */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Retrieval Concepts
                    </label>
                    <button
                        type="button"
                        onClick={() => navigate(`/streams/${id}/retrieval-wizard`)}
                        className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-md transition-colors"
                    >
                        <SparklesIcon className="h-4 w-4" />
                        Configure with Wizard
                    </button>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Entity-relationship patterns that cover your topics. Use the wizard to generate and configure concepts.
                </p>

                {(!retrievalConfig.concepts || retrievalConfig.concepts.length === 0) ? (
                    <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
                        <SparklesIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                            No concepts configured
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 mb-4">
                            Use the Retrieval Wizard to generate concept proposals based on your semantic space.
                        </p>
                        <button
                            type="button"
                            onClick={() => navigate(`/streams/${id}/retrieval-wizard`)}
                            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
                        >
                            <SparklesIcon className="h-5 w-5" />
                            Launch Retrieval Wizard
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {retrievalConfig.concepts.map((concept) => {
                            const isExpanded = expandedConcepts.has(concept.concept_id);

                            return (
                                <div
                                    key={concept.concept_id}
                                    className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden"
                                >
                                    {/* Concept Header */}
                                    <div className="bg-gray-50 dark:bg-gray-800 p-4">
                                        <button
                                            type="button"
                                            onClick={() => toggleConcept(concept.concept_id)}
                                            className="flex items-center gap-2 w-full text-left"
                                        >
                                            {isExpanded ? (
                                                <ChevronDownIcon className="h-5 w-5 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                                            ) : (
                                                <ChevronRightIcon className="h-5 w-5 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                                            )}
                                            <div className="flex-1">
                                                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                                                    {concept.name}
                                                </h3>
                                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                                    {concept.entity_pattern.length} entities, covers {concept.covered_topics.length} topics
                                                </p>
                                            </div>
                                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                                concept.volume_status === 'appropriate' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200' :
                                                concept.volume_status === 'too_broad' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200' :
                                                concept.volume_status === 'too_narrow' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200' :
                                                'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                            }`}>
                                                {concept.volume_status}
                                            </span>
                                        </button>
                                    </div>

                                    {/* Concept Details */}
                                    {isExpanded && (
                                        <div className="p-4 space-y-4 bg-white dark:bg-gray-900">
                                            <div>
                                                <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                    Rationale
                                                </h4>
                                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                                    {concept.rationale}
                                                </p>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                        Entity Pattern
                                                    </h4>
                                                    <div className="flex flex-wrap gap-1">
                                                        {concept.entity_pattern.map((entityId, i) => (
                                                            <span
                                                                key={i}
                                                                className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 rounded text-xs"
                                                            >
                                                                {entityId}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div>
                                                    <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                        Covered Topics
                                                    </h4>
                                                    <div className="flex flex-wrap gap-1">
                                                        {concept.covered_topics.map((topicId, i) => (
                                                            <span
                                                                key={i}
                                                                className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded text-xs"
                                                            >
                                                                {topicId}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            {concept.relationship_pattern && (
                                                <div>
                                                    <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                        Relationship Pattern
                                                    </h4>
                                                    <p className="text-sm text-gray-900 dark:text-white font-mono">
                                                        {concept.relationship_pattern}
                                                    </p>
                                                </div>
                                            )}

                                            {Object.keys(concept.source_queries).length > 0 && (
                                                <div>
                                                    <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                        Configured Sources
                                                    </h4>
                                                    <div className="flex flex-wrap gap-2">
                                                        {Object.keys(concept.source_queries).map((sourceId) => (
                                                            <span
                                                                key={sourceId}
                                                                className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded text-xs"
                                                            >
                                                                {sourceId}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
