import { useState } from 'react';
import { PlusIcon, TrashIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { SemanticSpace, Topic, Entity, ImportanceLevel, EntityType, PriorityLevel } from '../types';

interface SemanticSpaceFormProps {
    semanticSpace: SemanticSpace | undefined;
    onChange: (semanticSpace: SemanticSpace) => void;
}

export default function SemanticSpaceForm({ semanticSpace, onChange }: SemanticSpaceFormProps) {
    const [topicsExpanded, setTopicsExpanded] = useState(true);
    const [entitiesExpanded, setEntitiesExpanded] = useState(false);

    if (!semanticSpace) return null;

    const updateField = (path: string[], value: any) => {
        const updated = { ...semanticSpace };
        let current: any = updated;

        for (let i = 0; i < path.length - 1; i++) {
            current = current[path[i]];
        }
        current[path[path.length - 1]] = value;

        onChange(updated);
    };

    const addTopic = () => {
        const newTopic: Topic = {
            topic_id: `topic_${Date.now()}`,
            name: '',
            description: '',
            synonyms: [],
            importance: ImportanceLevel.RELEVANT,
            rationale: ''
        };
        updateField(['topics'], [...semanticSpace.topics, newTopic]);
    };

    const removeTopic = (index: number) => {
        updateField(['topics'], semanticSpace.topics.filter((_, i) => i !== index));
    };

    const updateTopic = (index: number, field: keyof Topic, value: any) => {
        const updated = [...semanticSpace.topics];
        updated[index] = { ...updated[index], [field]: value };
        updateField(['topics'], updated);
    };

    const addEntity = () => {
        const newEntity: Entity = {
            entity_id: `entity_${Date.now()}`,
            entity_type: EntityType.DISEASE,
            name: '',
            canonical_forms: [],
            context: ''
        };
        updateField(['entities'], [...semanticSpace.entities, newEntity]);
    };

    const removeEntity = (index: number) => {
        updateField(['entities'], semanticSpace.entities.filter((_, i) => i !== index));
    };

    const updateEntity = (index: number, field: keyof Entity, value: any) => {
        const updated = [...semanticSpace.entities];
        updated[index] = { ...updated[index], [field]: value };
        updateField(['entities'], updated);
    };

    return (
        <div className="space-y-8">
            {/* Domain Section */}
            <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Domain Definition
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Define the high-level information domain this stream covers.
                </p>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Domain Name
                    </label>
                    <input
                        type="text"
                        placeholder="e.g., Asbestos Litigation Science"
                        value={semanticSpace.domain.name}
                        onChange={(e) => updateField(['domain', 'name'], e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Domain Description
                    </label>
                    <textarea
                        placeholder="High-level description of the domain"
                        rows={3}
                        value={semanticSpace.domain.description}
                        onChange={(e) => updateField(['domain', 'description'], e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                </div>
            </div>

            {/* Context Section */}
            <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Context & Purpose
                </h3>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Business Context
                    </label>
                    <textarea
                        placeholder="e.g., Defense litigation support"
                        rows={2}
                        value={semanticSpace.context.business_context}
                        onChange={(e) => updateField(['context', 'business_context'], e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Time Sensitivity
                    </label>
                    <input
                        type="text"
                        placeholder="e.g., Weekly review cadence"
                        value={semanticSpace.context.time_sensitivity}
                        onChange={(e) => updateField(['context', 'time_sensitivity'], e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                </div>
            </div>

            {/* Coverage Requirements */}
            <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Coverage Requirements
                </h3>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Completeness Requirement
                    </label>
                    <input
                        type="text"
                        placeholder="e.g., Comprehensive coverage required"
                        value={semanticSpace.coverage.completeness_requirement}
                        onChange={(e) => updateField(['coverage', 'completeness_requirement'], e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="flex items-center space-x-2">
                            <input
                                type="checkbox"
                                checked={semanticSpace.coverage.quality_criteria.peer_review_required}
                                onChange={(e) => updateField(['coverage', 'quality_criteria', 'peer_review_required'], e.target.checked)}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">Require Peer Review</span>
                        </label>
                    </div>

                    <div>
                        <label className="flex items-center space-x-2">
                            <input
                                type="checkbox"
                                checked={semanticSpace.coverage.quality_criteria.exclude_predatory}
                                onChange={(e) => updateField(['coverage', 'quality_criteria', 'exclude_predatory'], e.target.checked)}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">Exclude Predatory Journals</span>
                        </label>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Recency Weight (0-1)
                    </label>
                    <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.1"
                        value={semanticSpace.coverage.temporal_scope.recency_weight}
                        onChange={(e) => updateField(['coverage', 'temporal_scope', 'recency_weight'], parseFloat(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        How much to weight recent vs. historical content
                    </p>
                </div>
            </div>

            {/* Topics Section - Collapsible */}
            <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-6">
                <div className="flex items-center justify-between">
                    <button
                        type="button"
                        onClick={() => setTopicsExpanded(!topicsExpanded)}
                        className="flex items-center gap-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                        {topicsExpanded ? (
                            <ChevronDownIcon className="h-5 w-5" />
                        ) : (
                            <ChevronRightIcon className="h-5 w-5" />
                        )}
                        <div className="text-left">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Topics {semanticSpace.topics.length > 0 && `(${semanticSpace.topics.length})`}
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Core topics that define what information matters
                            </p>
                        </div>
                    </button>
                    {topicsExpanded && (
                        <button
                            type="button"
                            onClick={addTopic}
                            className="flex items-center gap-1 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                        >
                            <PlusIcon className="h-4 w-4" />
                            Add Topic
                        </button>
                    )}
                </div>

                {topicsExpanded && (
                    <>
                        {semanticSpace.topics.length === 0 && (
                            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                No topics defined yet. Click "Add Topic" to get started.
                            </div>
                        )}

                        {semanticSpace.topics.map((topic, index) => (
                    <div key={topic.topic_id} className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                                Topic {index + 1}
                            </h4>
                            <button
                                type="button"
                                onClick={() => removeTopic(index)}
                                className="text-red-600 dark:text-red-400 hover:text-red-700"
                            >
                                <TrashIcon className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Topic Name
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g., Asbestos-Related Disease Mechanisms"
                                    value={topic.name}
                                    onChange={(e) => updateTopic(index, 'name', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Importance
                                </label>
                                <select
                                    value={topic.importance}
                                    onChange={(e) => updateTopic(index, 'importance', e.target.value as ImportanceLevel)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                >
                                    <option value={ImportanceLevel.CRITICAL}>Critical</option>
                                    <option value={ImportanceLevel.IMPORTANT}>Important</option>
                                    <option value={ImportanceLevel.RELEVANT}>Relevant</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Description
                            </label>
                            <textarea
                                placeholder="What this topic encompasses"
                                rows={2}
                                value={topic.description}
                                onChange={(e) => updateTopic(index, 'description', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Rationale
                            </label>
                            <input
                                type="text"
                                placeholder="Why this topic matters"
                                value={topic.rationale}
                                onChange={(e) => updateTopic(index, 'rationale', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Synonyms (comma-separated)
                            </label>
                            <input
                                type="text"
                                placeholder="e.g., asbestos pathophysiology, asbestos toxicity"
                                value={topic.synonyms.join(', ')}
                                onChange={(e) => updateTopic(index, 'synonyms', e.target.value.split(',').map(s => s.trim()).filter(s => s))}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                            />
                        </div>
                    </div>
                        ))}
                    </>
                )}
            </div>

            {/* Entities Section - Collapsible */}
            <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-6">
                <div className="flex items-center justify-between">
                    <button
                        type="button"
                        onClick={() => setEntitiesExpanded(!entitiesExpanded)}
                        className="flex items-center gap-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                        {entitiesExpanded ? (
                            <ChevronDownIcon className="h-5 w-5" />
                        ) : (
                            <ChevronRightIcon className="h-5 w-5" />
                        )}
                        <div className="text-left">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Entities {semanticSpace.entities.length > 0 && `(${semanticSpace.entities.length})`}
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Named entities (diseases, drugs, organizations, etc.)
                            </p>
                        </div>
                    </button>
                    {entitiesExpanded && (
                        <button
                            type="button"
                            onClick={addEntity}
                            className="flex items-center gap-1 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                        >
                            <PlusIcon className="h-4 w-4" />
                            Add Entity
                        </button>
                    )}
                </div>

                {entitiesExpanded && (
                    <>
                        {semanticSpace.entities.length === 0 && (
                            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                No entities defined yet. Click "Add Entity" to get started.
                            </div>
                        )}

                        {semanticSpace.entities.map((entity, index) => (
                    <div key={entity.entity_id} className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                                Entity {index + 1}
                            </h4>
                            <button
                                type="button"
                                onClick={() => removeEntity(index)}
                                className="text-red-600 dark:text-red-400 hover:text-red-700"
                            >
                                <TrashIcon className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Entity Name
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g., Mesothelioma"
                                    value={entity.name}
                                    onChange={(e) => updateEntity(index, 'name', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Entity Type
                                </label>
                                <select
                                    value={entity.entity_type}
                                    onChange={(e) => updateEntity(index, 'entity_type', e.target.value as EntityType)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                >
                                    <option value={EntityType.DISEASE}>Disease</option>
                                    <option value={EntityType.DRUG}>Drug</option>
                                    <option value={EntityType.SUBSTANCE}>Substance</option>
                                    <option value={EntityType.CHEMICAL}>Chemical</option>
                                    <option value={EntityType.ORGANIZATION}>Organization</option>
                                    <option value={EntityType.REGULATION}>Regulation</option>
                                    <option value={EntityType.BIOMARKER}>Biomarker</option>
                                    <option value={EntityType.GENE}>Gene</option>
                                    <option value={EntityType.PROTEIN}>Protein</option>
                                    <option value={EntityType.PATHWAY}>Pathway</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Context
                            </label>
                            <textarea
                                placeholder="Why this entity matters"
                                rows={2}
                                value={entity.context}
                                onChange={(e) => updateEntity(index, 'context', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Canonical Forms (comma-separated)
                            </label>
                            <input
                                type="text"
                                placeholder="e.g., mesothelioma, malignant mesothelioma"
                                value={entity.canonical_forms.join(', ')}
                                onChange={(e) => updateEntity(index, 'canonical_forms', e.target.value.split(',').map(s => s.trim()).filter(s => s))}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                            />
                        </div>
                    </div>
                        ))}
                    </>
                )}
            </div>
        </div>
    );
}
