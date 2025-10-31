import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';

import {
    ReportFrequency,
    Category,
    WorkflowConfig,
    ScoringConfig,
    SemanticSpace,
    Topic,
    Entity,
    ImportanceLevel,
    EntityType
} from '../types';

import { useResearchStream } from '../context/ResearchStreamContext';
import SemanticSpaceForm from '../components/SemanticSpaceForm';

type TabType = 'semantic' | 'presentation' | 'workflow';

export default function EditStreamPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { researchStreams, loadResearchStreams, updateResearchStream, deleteResearchStream, isLoading, error, clearError } = useResearchStream();

    const [stream, setStream] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<TabType>('semantic');
    const [form, setForm] = useState({
        stream_name: '',
        report_frequency: ReportFrequency.WEEKLY,
        is_active: true,

        // === LAYER 1: SEMANTIC SPACE ===
        semantic_space: {
            domain: {
                name: '',
                description: ''
            },
            topics: [] as Topic[],
            entities: [] as Entity[],
            relationships: [],
            context: {
                business_context: '',
                decision_types: [''],
                stakeholders: [''],
                time_sensitivity: 'Weekly review'
            },
            coverage: {
                signal_types: [],
                temporal_scope: {
                    start_date: undefined,
                    end_date: 'present',
                    focus_periods: [],
                    recency_weight: 0.7,
                    rationale: 'Recent research prioritized'
                },
                quality_criteria: {
                    peer_review_required: true,
                    minimum_citation_count: undefined,
                    journal_quality: [],
                    study_types: [],
                    exclude_predatory: true,
                    language_restrictions: ['English'],
                    other_criteria: []
                },
                completeness_requirement: 'Comprehensive coverage'
            },
            boundaries: {
                inclusions: [],
                exclusions: [],
                edge_cases: []
            },
            extraction_metadata: {
                extracted_from: 'manual_entry',
                extracted_at: new Date().toISOString(),
                human_reviewed: true,
                derivation_method: 'manual' as const
            }
        } as SemanticSpace,

        // === LAYER 3: PRESENTATION TAXONOMY ===
        categories: [
            {
                id: '',
                name: '',
                topics: [] as string[],
                specific_inclusions: [] as string[]
            }
        ] as Category[],

        // === LAYER 2: RETRIEVAL TAXONOMY ===
        workflow_config: {
            category_configs: {},
            article_limit_per_week: 10
        } as WorkflowConfig,
        scoring_config: {
            relevance_weight: 0.6,
            evidence_weight: 0.4,
            inclusion_threshold: 7.0,
            max_items_per_report: 10
        } as ScoringConfig
    });

    useEffect(() => {
        loadResearchStreams();
    }, [loadResearchStreams]);

    useEffect(() => {
        if (id && researchStreams.length > 0) {
            const foundStream = researchStreams.find(s => s.stream_id === Number(id));
            if (foundStream) {
                setStream(foundStream);

                // Initialize semantic_space from existing data or legacy fields
                let semanticSpace: SemanticSpace;
                if (foundStream.semantic_space) {
                    semanticSpace = foundStream.semantic_space;
                } else {
                    // Migrate from legacy fields to semantic space structure
                    semanticSpace = {
                        domain: {
                            name: foundStream.stream_name || '',
                            description: foundStream.purpose || ''
                        },
                        topics: [],
                        entities: [],
                        relationships: [],
                        context: {
                            business_context: foundStream.purpose || '',
                            decision_types: foundStream.intended_guidance || [''],
                            stakeholders: foundStream.audience || [''],
                            time_sensitivity: 'Weekly review'
                        },
                        coverage: {
                            signal_types: [],
                            temporal_scope: {
                                start_date: undefined,
                                end_date: 'present',
                                focus_periods: [],
                                recency_weight: 0.7,
                                rationale: 'Recent research prioritized'
                            },
                            quality_criteria: {
                                peer_review_required: true,
                                minimum_citation_count: undefined,
                                journal_quality: [],
                                study_types: [],
                                exclude_predatory: true,
                                language_restrictions: ['English'],
                                other_criteria: []
                            },
                            completeness_requirement: 'Comprehensive coverage'
                        },
                        boundaries: {
                            inclusions: (foundStream.global_inclusion || []).map((desc: string, idx: number) => ({
                                criterion_id: `inc_${idx}`,
                                description: desc,
                                rationale: '',
                                mandatory: true,
                                related_topics: [],
                                related_entities: []
                            })),
                            exclusions: (foundStream.global_exclusion || []).map((desc: string, idx: number) => ({
                                criterion_id: `exc_${idx}`,
                                description: desc,
                                rationale: '',
                                strict: true,
                                exceptions: []
                            })),
                            edge_cases: []
                        },
                        extraction_metadata: {
                            extracted_from: 'legacy_migration',
                            extracted_at: new Date().toISOString(),
                            human_reviewed: false,
                            derivation_method: 'manual' as const
                        }
                    };
                }

                setForm({
                    stream_name: foundStream.stream_name,
                    report_frequency: foundStream.report_frequency,
                    is_active: foundStream.is_active,
                    semantic_space: semanticSpace,
                    categories: foundStream.categories || [{
                        id: '',
                        name: '',
                        topics: [],
                        specific_inclusions: []
                    }],
                    workflow_config: foundStream.workflow_config || {
                        category_configs: {},
                        article_limit_per_week: 10
                    },
                    scoring_config: foundStream.scoring_config || {
                        relevance_weight: 0.6,
                        evidence_weight: 0.4,
                        inclusion_threshold: 7.0,
                        max_items_per_report: 10
                    }
                });
            }
        }
    }, [id, researchStreams]);

    // Category management functions
    const addCategory = () => {
        setForm({
            ...form,
            categories: [
                ...form.categories,
                {
                    id: '',
                    name: '',
                    topics: [],
                    specific_inclusions: []
                }
            ]
        });
    };

    const removeCategory = (index: number) => {
        if (form.categories.length === 1) {
            alert('At least one category is required');
            return;
        }

        const removedCategory = form.categories[index];
        const updatedCategories = form.categories.filter((_, i) => i !== index);

        // Also remove from workflow_config.category_configs
        const updatedCategoryConfigs = { ...form.workflow_config.category_configs };
        delete updatedCategoryConfigs[removedCategory.id];

        setForm({
            ...form,
            categories: updatedCategories,
            workflow_config: {
                ...form.workflow_config,
                category_configs: updatedCategoryConfigs
            }
        });
    };

    const updateCategory = (index: number, field: keyof Category, value: any) => {
        const updated = [...form.categories];
        updated[index] = { ...updated[index], [field]: value };
        setForm({ ...form, categories: updated });
    };

    const handleTopicsChange = (index: number, value: string) => {
        const topics = value.split(',').map(s => s.trim()).filter(s => s);
        updateCategory(index, 'topics', topics);
    };

    const handleSpecificInclusionsChange = (index: number, value: string) => {
        const inclusions = value.split('\n').map(s => s.trim()).filter(s => s);
        updateCategory(index, 'specific_inclusions', inclusions);
    };

    const generateCategoryId = (name: string): string => {
        return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    };

    const handleCategoryNameChange = (index: number, value: string) => {
        const updated = [...form.categories];
        updated[index] = {
            ...updated[index],
            name: value,
            id: generateCategoryId(value)
        };
        setForm({ ...form, categories: updated });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!id) return;

        const incompleteCategory = form.categories.find(cat =>
            !cat.id || !cat.name || cat.topics.length === 0
        );

        if (incompleteCategory) {
            alert('Please complete all category fields before submitting');
            return;
        }

        // Derive legacy fields from semantic_space for backward compatibility
        const legacyAudience = form.semantic_space.context.stakeholders.filter(s => s.trim());
        const legacyIntendedGuidance = form.semantic_space.context.decision_types.filter(s => s.trim());
        const legacyGlobalInclusion = form.semantic_space.boundaries.inclusions.map(inc => inc.description);
        const legacyGlobalExclusion = form.semantic_space.boundaries.exclusions.map(exc => exc.description);
        const purpose = form.semantic_space.domain.description || form.semantic_space.context.business_context;

        const updates = {
            stream_name: form.stream_name,
            purpose: purpose,
            // Legacy fields derived from semantic space
            audience: legacyAudience,
            intended_guidance: legacyIntendedGuidance,
            global_inclusion: legacyGlobalInclusion,
            global_exclusion: legacyGlobalExclusion,
            // Layer 3: Presentation taxonomy
            categories: form.categories,
            report_frequency: form.report_frequency,
            is_active: form.is_active,
            // Layer 2: Retrieval taxonomy
            workflow_config: form.workflow_config,
            scoring_config: form.scoring_config,
            // Layer 1: Semantic space (ground truth)
            semantic_space: form.semantic_space
        };

        try {
            await updateResearchStream(Number(id), updates);
            navigate('/streams');
        } catch (err) {
            console.error('Failed to update stream:', err);
        }
    };

    const handleDelete = async () => {
        if (!id) return;

        const confirmDelete = window.confirm(
            `Are you sure you want to delete "${form.stream_name}"? This action cannot be undone.`
        );

        if (confirmDelete) {
            try {
                await deleteResearchStream(Number(id));
                navigate('/streams');
            } catch (err) {
                console.error('Failed to delete stream:', err);
            }
        }
    };

    if (isLoading) {
        return (
            <div className="max-w-7xl mx-auto p-6">
                <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
            </div>
        );
    }

    if (!stream) {
        return (
            <div className="max-w-7xl mx-auto p-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                        Stream Not Found
                    </h3>
                    <button
                        onClick={() => navigate('/streams')}
                        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        Back to Streams
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto p-6">
            <div className="mb-6">
                <button
                    onClick={() => navigate('/streams')}
                    className="flex items-center text-sm text-blue-600 dark:text-blue-400 hover:underline mb-4"
                >
                    <ArrowLeftIcon className="h-4 w-4 mr-1" />
                    Back to Streams
                </button>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                    Edit Research Stream
                </h1>
            </div>

            {error && (
                <div className="mb-4 bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-700 rounded-lg p-4">
                    <p className="text-red-800 dark:text-red-200">{error}</p>
                    <button
                        onClick={clearError}
                        className="mt-2 text-sm text-red-600 dark:text-red-400 hover:underline"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8">
                {/* Basic Stream Info */}
                <div className="space-y-4 mb-6 pb-6 border-b border-gray-200 dark:border-gray-700">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Stream Name *
                        </label>
                        <input
                            type="text"
                            value={form.stream_name}
                            onChange={(e) => setForm({ ...form, stream_name: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Report Frequency *
                        </label>
                        <select
                            value={form.report_frequency}
                            onChange={(e) => setForm({ ...form, report_frequency: e.target.value as ReportFrequency })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                            <option value={ReportFrequency.DAILY}>Daily</option>
                            <option value={ReportFrequency.WEEKLY}>Weekly</option>
                            <option value={ReportFrequency.BIWEEKLY}>Bi-weekly</option>
                            <option value={ReportFrequency.MONTHLY}>Monthly</option>
                        </select>
                    </div>

                    <div className="flex items-center">
                        <input
                            type="checkbox"
                            id="is_active"
                            checked={form.is_active}
                            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                            className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                        />
                        <label htmlFor="is_active" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                            Stream is active
                        </label>
                    </div>
                </div>

                {/* Three-Layer Architecture Tabs */}
                <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
                    <nav className="-mb-px flex space-x-8">
                        <button
                            type="button"
                            onClick={() => setActiveTab('semantic')}
                            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'semantic'
                                ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                                }`}
                        >
                            <div className="flex flex-col items-start">
                                <span>Layer 1: Semantic Space</span>
                                <span className="text-xs font-normal text-gray-500 dark:text-gray-400">What information matters</span>
                            </div>
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('workflow')}
                            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'workflow'
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                                }`}
                        >
                            <div className="flex flex-col items-start">
                                <span>Layer 2: Retrieval & Scoring</span>
                                <span className="text-xs font-normal text-gray-500 dark:text-gray-400">How to find & filter</span>
                            </div>
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('presentation')}
                            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'presentation'
                                ? 'border-green-500 text-green-600 dark:text-green-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                                }`}
                        >
                            <div className="flex flex-col items-start">
                                <span>Layer 3: Presentation</span>
                                <span className="text-xs font-normal text-gray-500 dark:text-gray-400">How to organize results</span>
                            </div>
                        </button>
                    </nav>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Layer 1: Semantic Space Tab */}
                    {activeTab === 'semantic' && (
                        <div className="space-y-6">
                            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4 mb-6">
                                <h3 className="text-sm font-semibold text-purple-900 dark:text-purple-200 mb-2">
                                    Layer 1: Semantic Space
                                </h3>
                                <p className="text-sm text-purple-800 dark:text-purple-300">
                                    Define the canonical, source-agnostic representation of what information matters. This is the ground truth that both retrieval strategies and presentation categories will derive from.
                                </p>
                            </div>

                            <SemanticSpaceForm
                                semanticSpace={form.semantic_space}
                                onChange={(updated) => setForm({ ...form, semantic_space: updated })}
                            />
                        </div>
                    )}

                    {/* Layer 3: Presentation Taxonomy Tab */}
                    {activeTab === 'presentation' && (
                        <div className="space-y-6">
                            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-6">
                                <h3 className="text-sm font-semibold text-green-900 dark:text-green-200 mb-2">
                                    Layer 3: Presentation Taxonomy
                                </h3>
                                <p className="text-sm text-green-800 dark:text-green-300">
                                    Define categories for organizing results in reports. These should be derived from your semantic space and optimized for how users consume information.
                                </p>
                            </div>

                            {/* Categories */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Presentation Categories *
                                    </label>
                                    <button
                                        type="button"
                                        onClick={addCategory}
                                        className="flex items-center gap-1 px-3 py-2 text-sm text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-md transition-colors"
                                    >
                                        <PlusIcon className="h-4 w-4" />
                                        Add Category
                                    </button>
                                </div>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    Categories organize results for user consumption and decision-making
                                </p>

                                {form.categories.map((category, index) => (
                                    <div key={index} className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 space-y-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                                                Category {index + 1}
                                            </h3>
                                            {form.categories.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => removeCategory(index)}
                                                    className="text-red-600 dark:text-red-400 hover:text-red-700"
                                                >
                                                    <TrashIcon className="h-5 w-5" />
                                                </button>
                                            )}
                                        </div>

                                        {/* Category Name */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                Category Name *
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="e.g., Medical & Health Sciences"
                                                value={category.name}
                                                onChange={(e) => handleCategoryNameChange(index, e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                                required
                                            />
                                            {category.id && (
                                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                    ID: {category.id}
                                                </p>
                                            )}
                                        </div>

                                        {/* Topics */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                Topics *
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="e.g., Mesothelioma research, Lung cancer research"
                                                value={category.topics.join(', ')}
                                                onChange={(e) => handleTopicsChange(index, e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                                required
                                            />
                                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                                Comma-separated list of topics
                                            </p>
                                        </div>

                                        {/* Specific Inclusions */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                Specific Inclusion Criteria
                                            </label>
                                            <textarea
                                                placeholder="One criterion per line"
                                                rows={3}
                                                value={category.specific_inclusions.join('\n')}
                                                onChange={(e) => handleSpecificInclusionsChange(index, e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Layer 2: Retrieval & Scoring Tab */}
                    {activeTab === 'workflow' && (
                        <div className="space-y-6">
                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
                                <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
                                    Layer 2: Retrieval & Scoring
                                </h3>
                                <p className="text-sm text-blue-800 dark:text-blue-200">
                                    Configure how content is retrieved and filtered. This should be derived from your semantic space to ensure comprehensive coverage.
                                </p>
                            </div>

                            {/* Scoring Configuration */}
                            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                    Scoring Configuration
                                </h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Relevance Weight (0-1)
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            max="1"
                                            step="0.1"
                                            value={form.scoring_config?.relevance_weight || 0.6}
                                            onChange={(e) => setForm({
                                                ...form,
                                                scoring_config: {
                                                    ...form.scoring_config!,
                                                    relevance_weight: parseFloat(e.target.value)
                                                }
                                            })}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Evidence Weight (0-1)
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            max="1"
                                            step="0.1"
                                            value={form.scoring_config?.evidence_weight || 0.4}
                                            onChange={(e) => setForm({
                                                ...form,
                                                scoring_config: {
                                                    ...form.scoring_config!,
                                                    evidence_weight: parseFloat(e.target.value)
                                                }
                                            })}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Inclusion Threshold (1-10)
                                        </label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="10"
                                            step="0.5"
                                            value={form.scoring_config?.inclusion_threshold || 7.0}
                                            onChange={(e) => setForm({
                                                ...form,
                                                scoring_config: {
                                                    ...form.scoring_config!,
                                                    inclusion_threshold: parseFloat(e.target.value)
                                                }
                                            })}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Max Items per Report
                                        </label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={form.scoring_config?.max_items_per_report || 10}
                                            onChange={(e) => setForm({
                                                ...form,
                                                scoring_config: {
                                                    ...form.scoring_config!,
                                                    max_items_per_report: parseInt(e.target.value)
                                                }
                                            })}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Form Actions */}
                    <div className="flex justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
                        <button
                            type="button"
                            onClick={handleDelete}
                            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                        >
                            Delete Stream
                        </button>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => navigate('/streams')}
                                className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                            >
                                {isLoading ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
