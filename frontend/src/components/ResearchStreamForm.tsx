import { useState, useEffect } from 'react';
import { useResearchStream } from '../context/ResearchStreamContext';
import {
    ReportFrequency,
    Category,
    WorkflowConfig,
    ScoringConfig,
    SemanticSpace,
    Topic,
    Entity,
    ImportanceLevel,
    EntityType,
    PriorityLevel
} from '../types';
import { useNavigate } from 'react-router-dom';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import SemanticSpaceForm from './SemanticSpaceForm';

interface ResearchStreamFormProps {
    onCancel?: () => void;
}

type TabType = 'stream' | 'semantic' | 'workflow';

export default function ResearchStreamForm({ onCancel }: ResearchStreamFormProps) {
    const { createResearchStream, isLoading, error, clearError, availableSources, loadAvailableSources } = useResearchStream();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<TabType>('stream');

    const [form, setForm] = useState({
        stream_name: '',
        purpose: '',
        audience: [''] as string[],
        intended_guidance: [''] as string[],
        global_inclusion: [''] as string[],
        global_exclusion: [''] as string[],
        categories: [
            {
                id: '',
                name: '',
                topics: [] as string[],
                specific_inclusions: [] as string[]
            }
        ] as Category[],
        report_frequency: ReportFrequency.WEEKLY,
        workflow_config: {
            category_configs: {},
            article_limit_per_week: 10
        } as WorkflowConfig,
        scoring_config: {
            relevance_weight: 0.6,
            evidence_weight: 0.4,
            inclusion_threshold: 7.0,
            max_items_per_report: 10
        } as ScoringConfig,
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
                time_sensitivity: ''
            },
            coverage: {
                signal_types: [],
                temporal_scope: {
                    start_date: undefined,
                    end_date: 'present',
                    focus_periods: [],
                    recency_weight: 0.7,
                    rationale: ''
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
                completeness_requirement: 'Comprehensive'
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
        } as SemanticSpace | undefined
    });

    useEffect(() => {
        loadAvailableSources();
    }, [loadAvailableSources]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validate that all categories are complete
        const incompleteCategory = form.categories.find(cat =>
            !cat.id || !cat.name || cat.topics.length === 0
        );

        if (incompleteCategory) {
            alert('Please complete all category fields before submitting');
            return;
        }

        // Prepare clean data for submission
        const cleanedForm = {
            stream_name: form.stream_name,
            purpose: form.purpose,
            audience: form.audience.filter(s => s.trim()),
            intended_guidance: form.intended_guidance.filter(s => s.trim()),
            global_inclusion: form.global_inclusion.filter(s => s.trim()),
            global_exclusion: form.global_exclusion.filter(s => s.trim()),
            categories: form.categories.map(cat => ({
                id: cat.id,
                name: cat.name,
                topics: cat.topics,
                specific_inclusions: cat.specific_inclusions
            })),
            report_frequency: form.report_frequency,
            scoring_config: form.scoring_config,
            semantic_space: form.semantic_space
        };

        console.log('Submitting form data:', cleanedForm);

        try {
            const newStream = await createResearchStream(cleanedForm);
            // Navigate directly to implementation configuration (Workflow 2)
            navigate(`/streams/${newStream.stream_id}/configure`);
        } catch (err) {
            console.error('Failed to create research stream:', err);
        }
    };

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
        setForm({
            ...form,
            categories: form.categories.filter((_, i) => i !== index)
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

    // Array field management
    const addArrayItem = (field: 'audience' | 'intended_guidance' | 'global_inclusion' | 'global_exclusion') => {
        setForm({
            ...form,
            [field]: [...form[field], '']
        });
    };

    const removeArrayItem = (field: 'audience' | 'intended_guidance' | 'global_inclusion' | 'global_exclusion', index: number) => {
        const arr = form[field];
        if (arr.length === 1) return;
        setForm({
            ...form,
            [field]: arr.filter((_, i) => i !== index)
        });
    };

    const updateArrayItem = (field: 'audience' | 'intended_guidance' | 'global_inclusion' | 'global_exclusion', index: number, value: string) => {
        const updated = [...form[field]];
        updated[index] = value;
        setForm({ ...form, [field]: updated });
    };

    // Generate category ID from name
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

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8">
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                    Create Research Stream
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                    Define a comprehensive research scope with categories and inclusion criteria.
                </p>
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

            {/* Tabs */}
            <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
                <nav className="-mb-px flex space-x-8">
                    <button
                        type="button"
                        onClick={() => setActiveTab('stream')}
                        className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                            activeTab === 'stream'
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                        }`}
                    >
                        Scope Definition
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('semantic')}
                        className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                            activeTab === 'semantic'
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                        }`}
                    >
                        Semantic Space
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('workflow')}
                        className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                            activeTab === 'workflow'
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                        }`}
                    >
                        Workflow & Scoring
                    </button>
                </nav>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Scope Definition Tab */}
                {activeTab === 'stream' && (
                    <div className="space-y-6">
                        {/* Stream Name */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Stream Name *
                            </label>
                            <input
                                type="text"
                                placeholder="e.g., Asbestos (Non-Talc) Literature"
                                value={form.stream_name}
                                onChange={(e) => setForm({ ...form, stream_name: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                required
                            />
                        </div>

                        {/* Purpose */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Purpose *
                            </label>
                            <textarea
                                placeholder="Why does this stream exist? What questions will it answer?"
                                rows={3}
                                value={form.purpose}
                                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                required
                            />
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                Example: Enable comprehensive scientific awareness in less than 15 minutes per weekly review
                            </p>
                        </div>

                        {/* Audience */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Audience
                                </label>
                                <button
                                    type="button"
                                    onClick={() => addArrayItem('audience')}
                                    className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                    <PlusIcon className="h-4 w-4" />
                                    Add
                                </button>
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Who will use this research stream?
                            </p>
                            {form.audience.map((item, index) => (
                                <div key={index} className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="e.g., Inside counsel, Litigation support staff"
                                        value={item}
                                        onChange={(e) => updateArrayItem('audience', index, e.target.value)}
                                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                    {form.audience.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removeArrayItem('audience', index)}
                                            className="text-red-600 dark:text-red-400 hover:text-red-700"
                                        >
                                            <TrashIcon className="h-5 w-5" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Intended Guidance */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Intended Guidance
                                </label>
                                <button
                                    type="button"
                                    onClick={() => addArrayItem('intended_guidance')}
                                    className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                    <PlusIcon className="h-4 w-4" />
                                    Add
                                </button>
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                What decisions will this stream inform?
                            </p>
                            {form.intended_guidance.map((item, index) => (
                                <div key={index} className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="e.g., Case strategy development, Daubert challenges"
                                        value={item}
                                        onChange={(e) => updateArrayItem('intended_guidance', index, e.target.value)}
                                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                    {form.intended_guidance.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removeArrayItem('intended_guidance', index)}
                                            className="text-red-600 dark:text-red-400 hover:text-red-700"
                                        >
                                            <TrashIcon className="h-5 w-5" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Global Inclusion Criteria */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Global Inclusion Criteria
                                </label>
                                <button
                                    type="button"
                                    onClick={() => addArrayItem('global_inclusion')}
                                    className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                    <PlusIcon className="h-4 w-4" />
                                    Add
                                </button>
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Stream-wide criteria for what should be included
                            </p>
                            {form.global_inclusion.map((item, index) => (
                                <div key={index} className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="e.g., Asbestos exposure assessment or measurement"
                                        value={item}
                                        onChange={(e) => updateArrayItem('global_inclusion', index, e.target.value)}
                                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                    {form.global_inclusion.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removeArrayItem('global_inclusion', index)}
                                            className="text-red-600 dark:text-red-400 hover:text-red-700"
                                        >
                                            <TrashIcon className="h-5 w-5" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Global Exclusion Criteria */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Global Exclusion Criteria
                                </label>
                                <button
                                    type="button"
                                    onClick={() => addArrayItem('global_exclusion')}
                                    className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                    <PlusIcon className="h-4 w-4" />
                                    Add
                                </button>
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Stream-wide criteria for what should be excluded
                            </p>
                            {form.global_exclusion.map((item, index) => (
                                <div key={index} className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="e.g., Legal case decisions, trial transcripts"
                                        value={item}
                                        onChange={(e) => updateArrayItem('global_exclusion', index, e.target.value)}
                                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                    {form.global_exclusion.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removeArrayItem('global_exclusion', index)}
                                            className="text-red-600 dark:text-red-400 hover:text-red-700"
                                        >
                                            <TrashIcon className="h-5 w-5" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Categories */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Research Categories *
                                </label>
                                <button
                                    type="button"
                                    onClick={addCategory}
                                    className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                    <PlusIcon className="h-4 w-4" />
                                    Add Category
                                </button>
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Define structured topic categories for your research stream
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
                                            placeholder="e.g., Mesothelioma research, Lung cancer research, Disease pathology"
                                            value={category.topics.join(', ')}
                                            onChange={(e) => handleTopicsChange(index, e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                            required
                                        />
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                            Topics covered by this category (comma-separated)
                                        </p>
                                    </div>

                                    {/* Specific Inclusions */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Specific Inclusion Criteria
                                        </label>
                                        <textarea
                                            placeholder="One criterion per line, e.g.:\nAny peer-reviewed research on disease mechanisms\nPopulation-based exposure studies"
                                            rows={3}
                                            value={category.specific_inclusions.join('\n')}
                                            onChange={(e) => handleSpecificInclusionsChange(index, e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                            Category-specific inclusion rules (one per line)
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Report Frequency */}
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
                    </div>
                )}

                {/* Semantic Space Tab */}
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

                {/* Workflow & Scoring Tab */}
                {activeTab === 'workflow' && (
                    <div className="space-y-6">
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                            <p className="text-sm text-blue-800 dark:text-blue-200">
                                Workflow configuration will be available after creating the stream. You'll be guided through source selection and query configuration for each category.
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
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                        Weight for relevance to research programs (default: 0.6)
                                    </p>
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
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                        Weight for evidence quality (default: 0.4)
                                    </p>
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
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                        Minimum integrated score for inclusion (default: 7.0)
                                    </p>
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
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                        Maximum articles to include per report (default: 10)
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Form Actions */}
                <div className="flex justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                        type="button"
                        onClick={onCancel || (() => navigate('/dashboard'))}
                        className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                        {isLoading ? 'Creating...' : 'Create Stream'}
                    </button>
                </div>
            </form>
        </div>
    );
}
