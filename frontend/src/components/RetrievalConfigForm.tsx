import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { RetrievalConfig, Concept, BroadQuery, VolumeStatus, SemanticFilter } from '../types';
import { SparklesIcon, ChevronDownIcon, ChevronRightIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';

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

    // Detect if a strategy is SELECTED (type check, not content check)
    const conceptsSelected = Array.isArray(retrievalConfig.concepts);
    const broadSearchSelected = retrievalConfig.broad_search !== null && retrievalConfig.broad_search !== undefined;

    // Separately check if the selected strategy HAS CONTENT
    const hasConceptsContent = conceptsSelected && retrievalConfig.concepts.length > 0;
    const hasBroadSearchContent = broadSearchSelected && retrievalConfig.broad_search.queries?.length > 0;

    // Show UI based on SELECTION (not content)
    const showBroadSearch = broadSearchSelected;
    const showConcepts = conceptsSelected && !broadSearchSelected;
    const hasNoConfig = !conceptsSelected && !broadSearchSelected;

    // Strategy selection handlers
    const selectStrategy = (strategy: 'concepts' | 'broad_search') => {
        if (strategy === 'concepts') {
            onChange({
                ...retrievalConfig,
                concepts: [],
                broad_search: null
            });
        } else {
            onChange({
                ...retrievalConfig,
                concepts: null,
                broad_search: {
                    queries: [],
                    strategy_rationale: '',
                    coverage_analysis: {}
                }
            });
        }
    };

    const switchStrategy = () => {
        onChange({
            ...retrievalConfig,
            concepts: null,
            broad_search: null
        });
    };

    // Concept handlers
    const addConcept = () => {
        if (!retrievalConfig.concepts) return;
        const newConcept: Concept = {
            concept_id: `concept_${Date.now()}`,
            name: '',
            entity_pattern: [],
            relationship_edges: [],
            relationship_description: '',
            covered_topics: [],
            vocabulary_terms: {},
            expected_volume: null,
            volume_status: VolumeStatus.UNKNOWN,
            last_volume_check: null,
            source_queries: {},
            semantic_filter: {
                enabled: false,
                criteria: '',
                threshold: 0.7
            },
            exclusions: [],
            exclusion_rationale: null,
            rationale: '',
            human_edited: true
        };
        onChange({
            ...retrievalConfig,
            concepts: [...retrievalConfig.concepts, newConcept]
        });
    };

    const removeConcept = (index: number) => {
        if (!retrievalConfig.concepts) return;
        onChange({
            ...retrievalConfig,
            concepts: retrievalConfig.concepts.filter((_, i) => i !== index)
        });
    };

    const updateConcept = (index: number, field: keyof Concept, value: any) => {
        if (!retrievalConfig.concepts) return;
        const updated = [...retrievalConfig.concepts];
        updated[index] = { ...updated[index], [field]: value };
        onChange({
            ...retrievalConfig,
            concepts: updated
        });
    };

    // Broad Query handlers
    const addBroadQuery = () => {
        if (!retrievalConfig.broad_search) return;
        const newQuery: BroadQuery = {
            query_id: `query_${Date.now()}`,
            search_terms: [],
            query_expression: '',
            rationale: '',
            covered_topics: [],
            estimated_weekly_volume: null,
            semantic_filter: {
                enabled: false,
                criteria: '',
                threshold: 0.7
            }
        };
        onChange({
            ...retrievalConfig,
            broad_search: {
                ...retrievalConfig.broad_search,
                queries: [...retrievalConfig.broad_search.queries, newQuery]
            }
        });
    };

    const removeBroadQuery = (index: number) => {
        if (!retrievalConfig.broad_search) return;
        onChange({
            ...retrievalConfig,
            broad_search: {
                ...retrievalConfig.broad_search,
                queries: retrievalConfig.broad_search.queries.filter((_, i) => i !== index)
            }
        });
    };

    const updateBroadQuery = (index: number, field: keyof BroadQuery, value: any) => {
        if (!retrievalConfig.broad_search) return;
        const updated = [...retrievalConfig.broad_search.queries];
        updated[index] = { ...updated[index], [field]: value };
        onChange({
            ...retrievalConfig,
            broad_search: {
                ...retrievalConfig.broad_search,
                queries: updated
            }
        });
    };

    const updateBroadSearchRationale = (value: string) => {
        if (!retrievalConfig.broad_search) return;
        onChange({
            ...retrievalConfig,
            broad_search: {
                ...retrievalConfig.broad_search,
                strategy_rationale: value
            }
        });
    };

    return (
        <div className="space-y-6">
            {/* Strategy Selection or Configuration Display */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Retrieval Strategy
                        </label>
                        {!hasNoConfig && (
                            <button
                                type="button"
                                onClick={switchStrategy}
                                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                            >
                                Change Strategy
                            </button>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => navigate(`/streams/${id}/retrieval-wizard`)}
                        className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-md transition-colors"
                    >
                        <SparklesIcon className="h-4 w-4" />
                        Launch Wizard
                    </button>
                </div>

                {hasNoConfig ? (
                    /* Strategy Selection */
                    <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 text-center">
                            Choose Retrieval Strategy
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <button
                                type="button"
                                onClick={() => selectStrategy('concepts')}
                                className="p-6 border-2 border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-left"
                            >
                                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">
                                    Concept-Based Retrieval
                                </h4>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    Multiple narrow, specific entity-relationship patterns for precise coverage.
                                </p>
                            </button>
                            <button
                                type="button"
                                onClick={() => selectStrategy('broad_search')}
                                className="p-6 border-2 border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-left"
                            >
                                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">
                                    Broad Search
                                </h4>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    1-3 simple, wide-net queries optimized for weekly monitoring.
                                </p>
                            </button>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-4 text-center">
                            Or use the Retrieval Wizard to automatically generate and configure your strategy
                        </p>
                    </div>
                ) : showConcepts ? (
                    /* Concept-Based Retrieval Configuration */
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Concepts {retrievalConfig.concepts && retrievalConfig.concepts.length > 0 && `(${retrievalConfig.concepts.length})`}
                                </p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    Entity-relationship patterns that cover your topics
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={addConcept}
                                className="flex items-center gap-1 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                            >
                                <PlusIcon className="h-4 w-4" />
                                Add Concept
                            </button>
                        </div>

                        {retrievalConfig.concepts && retrievalConfig.concepts.length === 0 && (
                            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                No concepts defined yet. Click "Add Concept" to get started, or use the wizard to generate concepts automatically.
                            </div>
                        )}

                        {retrievalConfig.concepts && retrievalConfig.concepts.map((concept, index) => (
                            <div key={concept.concept_id} className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                                        Concept {index + 1}
                                    </h4>
                                    <button
                                        type="button"
                                        onClick={() => removeConcept(index)}
                                        className="text-red-600 dark:text-red-400 hover:text-red-700"
                                    >
                                        <TrashIcon className="h-5 w-5" />
                                    </button>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Concept Name
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="e.g., EGFR Testing in Lung Cancer"
                                        value={concept.name}
                                        onChange={(e) => updateConcept(index, 'name', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Rationale
                                    </label>
                                    <textarea
                                        placeholder="Why this concept covers these topics"
                                        rows={2}
                                        value={concept.rationale}
                                        onChange={(e) => updateConcept(index, 'rationale', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                    />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Covered Topics (comma-separated IDs)
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="e.g., topic_1, topic_2"
                                            value={concept.covered_topics.join(', ')}
                                            onChange={(e) => updateConcept(index, 'covered_topics', e.target.value.split(',').map(s => s.trim()).filter(s => s))}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Volume Status
                                        </label>
                                        <select
                                            value={concept.volume_status}
                                            onChange={(e) => updateConcept(index, 'volume_status', e.target.value as VolumeStatus)}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                        >
                                            <option value={VolumeStatus.UNKNOWN}>Unknown</option>
                                            <option value={VolumeStatus.APPROPRIATE}>Appropriate</option>
                                            <option value={VolumeStatus.TOO_BROAD}>Too Broad</option>
                                            <option value={VolumeStatus.TOO_NARROW}>Too Narrow</option>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Relationship Description
                                    </label>
                                    <textarea
                                        placeholder="Natural language description of entity relationships"
                                        rows={2}
                                        value={concept.relationship_description}
                                        onChange={(e) => updateConcept(index, 'relationship_description', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                    />
                                </div>

                                {/* Semantic Filter */}
                                <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                                    <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                                        Semantic Filter
                                    </h5>
                                    <div className="space-y-3">
                                        <div>
                                            <label className="flex items-center space-x-2">
                                                <input
                                                    type="checkbox"
                                                    checked={concept.semantic_filter.enabled}
                                                    onChange={(e) => updateConcept(index, 'semantic_filter', {
                                                        ...concept.semantic_filter,
                                                        enabled: e.target.checked
                                                    })}
                                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                />
                                                <span className="text-sm text-gray-700 dark:text-gray-300">Enable semantic filtering</span>
                                            </label>
                                        </div>

                                        {concept.semantic_filter.enabled && (
                                            <>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                        Filter Criteria
                                                    </label>
                                                    <textarea
                                                        placeholder="Text description of what should pass/fail"
                                                        rows={2}
                                                        value={concept.semantic_filter.criteria}
                                                        onChange={(e) => updateConcept(index, 'semantic_filter', {
                                                            ...concept.semantic_filter,
                                                            criteria: e.target.value
                                                        })}
                                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                    />
                                                </div>

                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                        Confidence Threshold (0.0 to 1.0)
                                                    </label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="1"
                                                        step="0.1"
                                                        value={concept.semantic_filter.threshold}
                                                        onChange={(e) => updateConcept(index, 'semantic_filter', {
                                                            ...concept.semantic_filter,
                                                            threshold: parseFloat(e.target.value)
                                                        })}
                                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                    />
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>

                                <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                                    <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                                        Note: Complex fields (entity_pattern, relationship_edges, vocabulary_terms, source_queries) are best configured via the wizard.
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : showBroadSearch ? (
                    /* Broad Search Configuration */
                    <div className="space-y-4">
                        {/* Strategy Rationale */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Strategy Rationale
                            </label>
                            <textarea
                                placeholder="Overall explanation of why this broad approach covers the domain"
                                rows={2}
                                value={retrievalConfig.broad_search?.strategy_rationale || ''}
                                onChange={(e) => updateBroadSearchRationale(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                            />
                        </div>

                        {/* Queries Section */}
                        <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Queries {retrievalConfig.broad_search && retrievalConfig.broad_search.queries.length > 0 && `(${retrievalConfig.broad_search.queries.length})`}
                                    </p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                        Broad queries for weekly monitoring (typically 1-3 queries)
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={addBroadQuery}
                                    className="flex items-center gap-1 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                                >
                                    <PlusIcon className="h-4 w-4" />
                                    Add Query
                                </button>
                            </div>

                            {retrievalConfig.broad_search && retrievalConfig.broad_search.queries.length === 0 && (
                                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                    No queries defined yet. Click "Add Query" to get started, or use the wizard to generate queries automatically.
                                </div>
                            )}

                            {retrievalConfig.broad_search && retrievalConfig.broad_search.queries.map((query, index) => (
                                <div key={query.query_id} className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                                            Query {index + 1}
                                        </h4>
                                        <button
                                            type="button"
                                            onClick={() => removeBroadQuery(index)}
                                            className="text-red-600 dark:text-red-400 hover:text-red-700"
                                        >
                                            <TrashIcon className="h-5 w-5" />
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                Search Terms (comma-separated)
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="e.g., asbestos, mesothelioma"
                                                value={query.search_terms.join(', ')}
                                                onChange={(e) => updateBroadQuery(index, 'search_terms', e.target.value.split(',').map(s => s.trim()).filter(s => s))}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                Estimated Weekly Volume
                                            </label>
                                            <input
                                                type="number"
                                                placeholder="e.g., 50"
                                                value={query.estimated_weekly_volume || ''}
                                                onChange={(e) => updateBroadQuery(index, 'estimated_weekly_volume', e.target.value ? parseInt(e.target.value) : null)}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Query Expression
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="e.g., (asbestos OR mesothelioma)"
                                            value={query.query_expression}
                                            onChange={(e) => updateBroadQuery(index, 'query_expression', e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-mono"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Rationale
                                        </label>
                                        <textarea
                                            placeholder="Why these terms capture all relevant literature"
                                            rows={2}
                                            value={query.rationale}
                                            onChange={(e) => updateBroadQuery(index, 'rationale', e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Covered Topics (comma-separated IDs)
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="e.g., topic_1, topic_2"
                                            value={query.covered_topics.join(', ')}
                                            onChange={(e) => updateBroadQuery(index, 'covered_topics', e.target.value.split(',').map(s => s.trim()).filter(s => s))}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                        />
                                    </div>

                                    {/* Semantic Filter */}
                                    <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                                        <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                                            Semantic Filter
                                        </h5>
                                        <div className="space-y-3">
                                            <div>
                                                <label className="flex items-center space-x-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={query.semantic_filter.enabled}
                                                        onChange={(e) => updateBroadQuery(index, 'semantic_filter', {
                                                            ...query.semantic_filter,
                                                            enabled: e.target.checked
                                                        })}
                                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                    />
                                                    <span className="text-sm text-gray-700 dark:text-gray-300">Enable semantic filtering</span>
                                                </label>
                                            </div>

                                            {query.semantic_filter.enabled && (
                                                <>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                            Filter Criteria
                                                        </label>
                                                        <textarea
                                                            placeholder="Text description of what should pass/fail"
                                                            rows={2}
                                                            value={query.semantic_filter.criteria}
                                                            onChange={(e) => updateBroadQuery(index, 'semantic_filter', {
                                                                ...query.semantic_filter,
                                                                criteria: e.target.value
                                                            })}
                                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                            Confidence Threshold (0.0 to 1.0)
                                                        </label>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="1"
                                                            step="0.1"
                                                            value={query.semantic_filter.threshold}
                                                            onChange={(e) => updateBroadQuery(index, 'semantic_filter', {
                                                                ...query.semantic_filter,
                                                                threshold: parseFloat(e.target.value)
                                                            })}
                                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                        />
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
