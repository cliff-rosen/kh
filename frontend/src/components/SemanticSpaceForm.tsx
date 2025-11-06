import { useState } from 'react';
import { PlusIcon, TrashIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import {
    SemanticSpace,
    Topic,
    Entity,
    Relationship,
    SignalType,
    InclusionCriterion,
    ExclusionCriterion,
    EdgeCase,
    ImportanceLevel,
    EntityType,
    PriorityLevel,
    RelationshipType,
    RelationshipStrength,
    EdgeCaseResolution
} from '../types';

interface SemanticSpaceFormProps {
    semanticSpace: SemanticSpace | undefined;
    onChange: (semanticSpace: SemanticSpace) => void;
}

export default function SemanticSpaceForm({ semanticSpace, onChange }: SemanticSpaceFormProps) {
    // Collapse state for major sections
    const [topicsExpanded, setTopicsExpanded] = useState(true);
    const [entitiesExpanded, setEntitiesExpanded] = useState(false);
    const [relationshipsExpanded, setRelationshipsExpanded] = useState(false);
    const [coverageExpanded, setCoverageExpanded] = useState(false);
    const [boundariesExpanded, setBoundariesExpanded] = useState(false);
    const [signalTypesExpanded, setSignalTypesExpanded] = useState(false);
    const [inclusionsExpanded, setInclusionsExpanded] = useState(false);
    const [exclusionsExpanded, setExclusionsExpanded] = useState(false);
    const [edgeCasesExpanded, setEdgeCasesExpanded] = useState(false);

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

    // Relationship handlers
    const addRelationship = () => {
        const newRelationship: Relationship = {
            relationship_id: `rel_${Date.now()}`,
            type: RelationshipType.CORRELATIONAL,
            subject: '',
            object: '',
            description: '',
            strength: 'moderate'
        };
        updateField(['relationships'], [...semanticSpace.relationships, newRelationship]);
    };

    const removeRelationship = (index: number) => {
        updateField(['relationships'], semanticSpace.relationships.filter((_, i) => i !== index));
    };

    const updateRelationship = (index: number, field: keyof Relationship, value: any) => {
        const updated = [...semanticSpace.relationships];
        updated[index] = { ...updated[index], [field]: value };
        updateField(['relationships'], updated);
    };

    // Signal Type handlers
    const addSignalType = () => {
        const newSignal: SignalType = {
            signal_id: `signal_${Date.now()}`,
            name: '',
            description: '',
            priority: PriorityLevel.SHOULD_HAVE,
            examples: []
        };
        updateField(['coverage', 'signal_types'], [...semanticSpace.coverage.signal_types, newSignal]);
    };

    const removeSignalType = (index: number) => {
        updateField(['coverage', 'signal_types'], semanticSpace.coverage.signal_types.filter((_, i) => i !== index));
    };

    const updateSignalType = (index: number, field: keyof SignalType, value: any) => {
        const updated = [...semanticSpace.coverage.signal_types];
        updated[index] = { ...updated[index], [field]: value };
        updateField(['coverage', 'signal_types'], updated);
    };

    // Inclusion Criterion handlers
    const addInclusion = () => {
        const newInclusion: InclusionCriterion = {
            criterion_id: `inc_${Date.now()}`,
            description: '',
            rationale: '',
            mandatory: true,
            related_topics: [],
            related_entities: []
        };
        updateField(['boundaries', 'inclusions'], [...semanticSpace.boundaries.inclusions, newInclusion]);
    };

    const removeInclusion = (index: number) => {
        updateField(['boundaries', 'inclusions'], semanticSpace.boundaries.inclusions.filter((_, i) => i !== index));
    };

    const updateInclusion = (index: number, field: keyof InclusionCriterion, value: any) => {
        const updated = [...semanticSpace.boundaries.inclusions];
        updated[index] = { ...updated[index], [field]: value };
        updateField(['boundaries', 'inclusions'], updated);
    };

    // Exclusion Criterion handlers
    const addExclusion = () => {
        const newExclusion: ExclusionCriterion = {
            criterion_id: `exc_${Date.now()}`,
            description: '',
            rationale: '',
            strict: true,
            exceptions: []
        };
        updateField(['boundaries', 'exclusions'], [...semanticSpace.boundaries.exclusions, newExclusion]);
    };

    const removeExclusion = (index: number) => {
        updateField(['boundaries', 'exclusions'], semanticSpace.boundaries.exclusions.filter((_, i) => i !== index));
    };

    const updateExclusion = (index: number, field: keyof ExclusionCriterion, value: any) => {
        const updated = [...semanticSpace.boundaries.exclusions];
        updated[index] = { ...updated[index], [field]: value };
        updateField(['boundaries', 'exclusions'], updated);
    };

    // Edge Case handlers
    const addEdgeCase = () => {
        const newEdgeCase: EdgeCase = {
            case_id: `edge_${Date.now()}`,
            description: '',
            resolution: 'conditional',
            conditions: '',
            rationale: ''
        };
        updateField(['boundaries', 'edge_cases'], [...semanticSpace.boundaries.edge_cases, newEdgeCase]);
    };

    const removeEdgeCase = (index: number) => {
        updateField(['boundaries', 'edge_cases'], semanticSpace.boundaries.edge_cases.filter((_, i) => i !== index));
    };

    const updateEdgeCase = (index: number, field: keyof EdgeCase, value: any) => {
        const updated = [...semanticSpace.boundaries.edge_cases];
        updated[index] = { ...updated[index], [field]: value };
        updateField(['boundaries', 'edge_cases'], updated);
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

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Decision Types (one per line)
                    </label>
                    <textarea
                        placeholder="e.g., Case acceptance decisions, Expert witness selection"
                        rows={3}
                        value={semanticSpace.context.decision_types.join('\n')}
                        onChange={(e) => updateField(['context', 'decision_types'], e.target.value.split('\n').map(s => s.trim()).filter(s => s))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        What decisions does this stream inform?
                    </p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Stakeholders (one per line)
                    </label>
                    <textarea
                        placeholder="e.g., Inside counsel, Outside counsel, Expert witnesses"
                        rows={3}
                        value={semanticSpace.context.stakeholders.join('\n')}
                        onChange={(e) => updateField(['context', 'stakeholders'], e.target.value.split('\n').map(s => s.trim()).filter(s => s))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Who uses this information?
                    </p>
                </div>
            </div>

            {/* Coverage Requirements - Collapsible */}
            <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-6">
                <div className="flex items-center">
                    <button
                        type="button"
                        onClick={() => setCoverageExpanded(!coverageExpanded)}
                        className="flex items-center gap-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                        {coverageExpanded ? (
                            <ChevronDownIcon className="h-5 w-5" />
                        ) : (
                            <ChevronRightIcon className="h-5 w-5" />
                        )}
                        <div className="text-left">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Coverage Requirements
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Define coverage, quality, and temporal requirements
                            </p>
                        </div>
                    </button>
                </div>

                {coverageExpanded && (
                    <>
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

                {/* Signal Types - Collapsible Subsection */}
                <div className="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-4">
                    <div className="flex items-center justify-between">
                        <button
                            type="button"
                            onClick={() => setSignalTypesExpanded(!signalTypesExpanded)}
                            className="flex items-center gap-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                            {signalTypesExpanded ? (
                                <ChevronDownIcon className="h-4 w-4" />
                            ) : (
                                <ChevronRightIcon className="h-4 w-4" />
                            )}
                            <div className="text-left">
                                <h4 className="text-md font-semibold text-gray-900 dark:text-white">
                                    Signal Types {semanticSpace.coverage.signal_types.length > 0 && `(${semanticSpace.coverage.signal_types.length})`}
                                </h4>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    Types of information sources that matter
                                </p>
                            </div>
                        </button>
                        {signalTypesExpanded && (
                            <button
                                type="button"
                                onClick={addSignalType}
                                className="flex items-center gap-1 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                            >
                                <PlusIcon className="h-4 w-4" />
                                Add Signal Type
                            </button>
                        )}
                    </div>

                    {signalTypesExpanded && (
                        <>
                            {semanticSpace.coverage.signal_types.length === 0 && (
                                <div className="text-center py-6 text-gray-500 dark:text-gray-400 text-sm">
                                    No signal types defined yet. Click "Add Signal Type" to get started.
                                </div>
                            )}

                            {semanticSpace.coverage.signal_types.map((signal, index) => (
                                <div key={signal.signal_id} className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h5 className="text-sm font-semibold text-gray-900 dark:text-white">
                                            Signal Type {index + 1}
                                        </h5>
                                        <button
                                            type="button"
                                            onClick={() => removeSignalType(index)}
                                            className="text-red-600 dark:text-red-400 hover:text-red-700"
                                        >
                                            <TrashIcon className="h-4 w-4" />
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                Name
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="e.g., Peer-reviewed research"
                                                value={signal.name}
                                                onChange={(e) => updateSignalType(index, 'name', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                Priority
                                            </label>
                                            <select
                                                value={signal.priority}
                                                onChange={(e) => updateSignalType(index, 'priority', e.target.value as PriorityLevel)}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                            >
                                                <option value={PriorityLevel.MUST_HAVE}>Must Have</option>
                                                <option value={PriorityLevel.SHOULD_HAVE}>Should Have</option>
                                                <option value={PriorityLevel.NICE_TO_HAVE}>Nice to Have</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Description
                                        </label>
                                        <textarea
                                            placeholder="What constitutes this signal type"
                                            rows={2}
                                            value={signal.description}
                                            onChange={(e) => updateSignalType(index, 'description', e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Examples (comma-separated)
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="e.g., Journal of Thoracic Oncology, NEJM"
                                            value={signal.examples.join(', ')}
                                            onChange={(e) => updateSignalType(index, 'examples', e.target.value.split(',').map(s => s.trim()).filter(s => s))}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                        />
                                    </div>
                                </div>
                            ))}
                        </>
                    )}
                </div>
                    </>
                )}
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

            {/* Relationships Section - Collapsible */}
            <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-6">
                <div className="flex items-center justify-between">
                    <button
                        type="button"
                        onClick={() => setRelationshipsExpanded(!relationshipsExpanded)}
                        className="flex items-center gap-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                        {relationshipsExpanded ? (
                            <ChevronDownIcon className="h-5 w-5" />
                        ) : (
                            <ChevronRightIcon className="h-5 w-5" />
                        )}
                        <div className="text-left">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Relationships {semanticSpace.relationships.length > 0 && `(${semanticSpace.relationships.length})`}
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Semantic relationships between topics and entities
                            </p>
                        </div>
                    </button>
                    {relationshipsExpanded && (
                        <button
                            type="button"
                            onClick={addRelationship}
                            className="flex items-center gap-1 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                        >
                            <PlusIcon className="h-4 w-4" />
                            Add Relationship
                        </button>
                    )}
                </div>

                {relationshipsExpanded && (
                    <>
                        {semanticSpace.relationships.length === 0 && (
                            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                No relationships defined yet. Click "Add Relationship" to get started.
                            </div>
                        )}

                        {semanticSpace.relationships.map((relationship, index) => (
                            <div key={relationship.relationship_id} className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                                        Relationship {index + 1}
                                    </h4>
                                    <button
                                        type="button"
                                        onClick={() => removeRelationship(index)}
                                        className="text-red-600 dark:text-red-400 hover:text-red-700"
                                    >
                                        <TrashIcon className="h-5 w-5" />
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Type
                                        </label>
                                        <select
                                            value={relationship.type}
                                            onChange={(e) => updateRelationship(index, 'type', e.target.value as RelationshipType)}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                        >
                                            <option value={RelationshipType.CAUSAL}>Causal</option>
                                            <option value={RelationshipType.CORRELATIONAL}>Correlational</option>
                                            <option value={RelationshipType.REGULATORY}>Regulatory</option>
                                            <option value={RelationshipType.METHODOLOGICAL}>Methodological</option>
                                            <option value={RelationshipType.TEMPORAL}>Temporal</option>
                                            <option value={RelationshipType.HIERARCHICAL}>Hierarchical</option>
                                            <option value={RelationshipType.THERAPEUTIC}>Therapeutic</option>
                                            <option value={RelationshipType.INHIBITORY}>Inhibitory</option>
                                            <option value={RelationshipType.INTERACTIVE}>Interactive</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Subject (topic/entity ID)
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="e.g., topic_1 or entity_1"
                                            value={relationship.subject}
                                            onChange={(e) => updateRelationship(index, 'subject', e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Object (topic/entity ID)
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="e.g., topic_2 or entity_2"
                                            value={relationship.object}
                                            onChange={(e) => updateRelationship(index, 'object', e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Description
                                    </label>
                                    <textarea
                                        placeholder="Describe the relationship"
                                        rows={2}
                                        value={relationship.description}
                                        onChange={(e) => updateRelationship(index, 'description', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Strength
                                    </label>
                                    <select
                                        value={relationship.strength}
                                        onChange={(e) => updateRelationship(index, 'strength', e.target.value as RelationshipStrength)}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                    >
                                        <option value="strong">Strong</option>
                                        <option value="moderate">Moderate</option>
                                        <option value="weak">Weak</option>
                                    </select>
                                </div>
                            </div>
                        ))}
                    </>
                )}
            </div>

            {/* Boundaries Section - Collapsible with Subsections */}
            <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-6">
                <div className="flex items-center">
                    <button
                        type="button"
                        onClick={() => setBoundariesExpanded(!boundariesExpanded)}
                        className="flex items-center gap-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                        {boundariesExpanded ? (
                            <ChevronDownIcon className="h-5 w-5" />
                        ) : (
                            <ChevronRightIcon className="h-5 w-5" />
                        )}
                        <div className="text-left">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Boundaries
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Define what's in scope and out of scope
                            </p>
                        </div>
                    </button>
                </div>

                {boundariesExpanded && (
                    <div className="space-y-6 pl-4">
                        {/* Inclusions Subsection */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <button
                                    type="button"
                                    onClick={() => setInclusionsExpanded(!inclusionsExpanded)}
                                    className="flex items-center gap-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                >
                                    {inclusionsExpanded ? (
                                        <ChevronDownIcon className="h-4 w-4" />
                                    ) : (
                                        <ChevronRightIcon className="h-4 w-4" />
                                    )}
                                    <div className="text-left">
                                        <h4 className="text-md font-semibold text-gray-900 dark:text-white">
                                            Inclusions {semanticSpace.boundaries.inclusions.length > 0 && `(${semanticSpace.boundaries.inclusions.length})`}
                                        </h4>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                            What should be included in the information space
                                        </p>
                                    </div>
                                </button>
                                {inclusionsExpanded && (
                                    <button
                                        type="button"
                                        onClick={addInclusion}
                                        className="flex items-center gap-1 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                                    >
                                        <PlusIcon className="h-4 w-4" />
                                        Add Inclusion
                                    </button>
                                )}
                            </div>

                            {inclusionsExpanded && (
                                <>
                                    {semanticSpace.boundaries.inclusions.length === 0 && (
                                        <div className="text-center py-6 text-gray-500 dark:text-gray-400 text-sm">
                                            No inclusions defined yet. Click "Add Inclusion" to get started.
                                        </div>
                                    )}

                                    {semanticSpace.boundaries.inclusions.map((inclusion, index) => (
                                        <div key={inclusion.criterion_id} className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <h5 className="text-sm font-semibold text-gray-900 dark:text-white">
                                                    Inclusion {index + 1}
                                                </h5>
                                                <button
                                                    type="button"
                                                    onClick={() => removeInclusion(index)}
                                                    className="text-red-600 dark:text-red-400 hover:text-red-700"
                                                >
                                                    <TrashIcon className="h-4 w-4" />
                                                </button>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                    Description
                                                </label>
                                                <textarea
                                                    placeholder="What to include"
                                                    rows={2}
                                                    value={inclusion.description}
                                                    onChange={(e) => updateInclusion(index, 'description', e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                    Rationale
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="Why this is in scope"
                                                    value={inclusion.rationale}
                                                    onChange={(e) => updateInclusion(index, 'rationale', e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                />
                                            </div>

                                            <div>
                                                <label className="flex items-center space-x-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={inclusion.mandatory}
                                                        onChange={(e) => updateInclusion(index, 'mandatory', e.target.checked)}
                                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                    />
                                                    <span className="text-sm text-gray-700 dark:text-gray-300">Mandatory (must-have)</span>
                                                </label>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                        Related Topics (comma-separated IDs)
                                                    </label>
                                                    <input
                                                        type="text"
                                                        placeholder="e.g., topic_1, topic_2"
                                                        value={inclusion.related_topics.join(', ')}
                                                        onChange={(e) => updateInclusion(index, 'related_topics', e.target.value.split(',').map(s => s.trim()).filter(s => s))}
                                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                    />
                                                </div>

                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                        Related Entities (comma-separated IDs)
                                                    </label>
                                                    <input
                                                        type="text"
                                                        placeholder="e.g., entity_1, entity_2"
                                                        value={inclusion.related_entities.join(', ')}
                                                        onChange={(e) => updateInclusion(index, 'related_entities', e.target.value.split(',').map(s => s.trim()).filter(s => s))}
                                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>

                        {/* Exclusions Subsection */}
                        <div className="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-4">
                            <div className="flex items-center justify-between">
                                <button
                                    type="button"
                                    onClick={() => setExclusionsExpanded(!exclusionsExpanded)}
                                    className="flex items-center gap-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                >
                                    {exclusionsExpanded ? (
                                        <ChevronDownIcon className="h-4 w-4" />
                                    ) : (
                                        <ChevronRightIcon className="h-4 w-4" />
                                    )}
                                    <div className="text-left">
                                        <h4 className="text-md font-semibold text-gray-900 dark:text-white">
                                            Exclusions {semanticSpace.boundaries.exclusions.length > 0 && `(${semanticSpace.boundaries.exclusions.length})`}
                                        </h4>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                            What should be excluded from the information space
                                        </p>
                                    </div>
                                </button>
                                {exclusionsExpanded && (
                                    <button
                                        type="button"
                                        onClick={addExclusion}
                                        className="flex items-center gap-1 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                                    >
                                        <PlusIcon className="h-4 w-4" />
                                        Add Exclusion
                                    </button>
                                )}
                            </div>

                            {exclusionsExpanded && (
                                <>
                                    {semanticSpace.boundaries.exclusions.length === 0 && (
                                        <div className="text-center py-6 text-gray-500 dark:text-gray-400 text-sm">
                                            No exclusions defined yet. Click "Add Exclusion" to get started.
                                        </div>
                                    )}

                                    {semanticSpace.boundaries.exclusions.map((exclusion, index) => (
                                        <div key={exclusion.criterion_id} className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <h5 className="text-sm font-semibold text-gray-900 dark:text-white">
                                                    Exclusion {index + 1}
                                                </h5>
                                                <button
                                                    type="button"
                                                    onClick={() => removeExclusion(index)}
                                                    className="text-red-600 dark:text-red-400 hover:text-red-700"
                                                >
                                                    <TrashIcon className="h-4 w-4" />
                                                </button>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                    Description
                                                </label>
                                                <textarea
                                                    placeholder="What to exclude"
                                                    rows={2}
                                                    value={exclusion.description}
                                                    onChange={(e) => updateExclusion(index, 'description', e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                    Rationale
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="Why this is out of scope"
                                                    value={exclusion.rationale}
                                                    onChange={(e) => updateExclusion(index, 'rationale', e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                />
                                            </div>

                                            <div>
                                                <label className="flex items-center space-x-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={exclusion.strict}
                                                        onChange={(e) => updateExclusion(index, 'strict', e.target.checked)}
                                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                    />
                                                    <span className="text-sm text-gray-700 dark:text-gray-300">Strict (hard boundary)</span>
                                                </label>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                    Exceptions (comma-separated)
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="When this exclusion might not apply"
                                                    value={exclusion.exceptions.join(', ')}
                                                    onChange={(e) => updateExclusion(index, 'exceptions', e.target.value.split(',').map(s => s.trim()).filter(s => s))}
                                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>

                        {/* Edge Cases Subsection */}
                        <div className="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-4">
                            <div className="flex items-center justify-between">
                                <button
                                    type="button"
                                    onClick={() => setEdgeCasesExpanded(!edgeCasesExpanded)}
                                    className="flex items-center gap-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                >
                                    {edgeCasesExpanded ? (
                                        <ChevronDownIcon className="h-4 w-4" />
                                    ) : (
                                        <ChevronRightIcon className="h-4 w-4" />
                                    )}
                                    <div className="text-left">
                                        <h4 className="text-md font-semibold text-gray-900 dark:text-white">
                                            Edge Cases {semanticSpace.boundaries.edge_cases.length > 0 && `(${semanticSpace.boundaries.edge_cases.length})`}
                                        </h4>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                            Ambiguous cases and how to handle them
                                        </p>
                                    </div>
                                </button>
                                {edgeCasesExpanded && (
                                    <button
                                        type="button"
                                        onClick={addEdgeCase}
                                        className="flex items-center gap-1 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                                    >
                                        <PlusIcon className="h-4 w-4" />
                                        Add Edge Case
                                    </button>
                                )}
                            </div>

                            {edgeCasesExpanded && (
                                <>
                                    {semanticSpace.boundaries.edge_cases.length === 0 && (
                                        <div className="text-center py-6 text-gray-500 dark:text-gray-400 text-sm">
                                            No edge cases defined yet. Click "Add Edge Case" to get started.
                                        </div>
                                    )}

                                    {semanticSpace.boundaries.edge_cases.map((edgeCase, index) => (
                                        <div key={edgeCase.case_id} className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <h5 className="text-sm font-semibold text-gray-900 dark:text-white">
                                                    Edge Case {index + 1}
                                                </h5>
                                                <button
                                                    type="button"
                                                    onClick={() => removeEdgeCase(index)}
                                                    className="text-red-600 dark:text-red-400 hover:text-red-700"
                                                >
                                                    <TrashIcon className="h-4 w-4" />
                                                </button>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                    Description
                                                </label>
                                                <textarea
                                                    placeholder="Describe the ambiguous case"
                                                    rows={2}
                                                    value={edgeCase.description}
                                                    onChange={(e) => updateEdgeCase(index, 'description', e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                    Resolution
                                                </label>
                                                <select
                                                    value={edgeCase.resolution}
                                                    onChange={(e) => updateEdgeCase(index, 'resolution', e.target.value as EdgeCaseResolution)}
                                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                >
                                                    <option value="include">Include</option>
                                                    <option value="exclude">Exclude</option>
                                                    <option value="conditional">Conditional</option>
                                                </select>
                                            </div>

                                            {edgeCase.resolution === 'conditional' && (
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                        Conditions
                                                    </label>
                                                    <textarea
                                                        placeholder="Conditions for inclusion/exclusion"
                                                        rows={2}
                                                        value={edgeCase.conditions || ''}
                                                        onChange={(e) => updateEdgeCase(index, 'conditions', e.target.value)}
                                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                    />
                                                </div>
                                            )}

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                    Rationale
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="Reasoning for this resolution"
                                                    value={edgeCase.rationale}
                                                    onChange={(e) => updateEdgeCase(index, 'rationale', e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
