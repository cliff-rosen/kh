import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';

import { ReportFrequency, Category, WorkflowConfig, ScoringConfig } from '../types/research-stream';

import { useResearchStream } from '../context/ResearchStreamContext';

type TabType = 'stream' | 'workflow';

export default function StreamDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { researchStreams, loadResearchStreams, updateResearchStream, deleteResearchStream, isLoading, error, clearError } = useResearchStream();

    const [stream, setStream] = useState<any>(null);
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
        is_active: true,
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
                setForm({
                    stream_name: foundStream.stream_name,
                    purpose: foundStream.purpose || '',
                    audience: foundStream.audience && foundStream.audience.length > 0 ? foundStream.audience : [''],
                    intended_guidance: foundStream.intended_guidance && foundStream.intended_guidance.length > 0 ? foundStream.intended_guidance : [''],
                    global_inclusion: foundStream.global_inclusion && foundStream.global_inclusion.length > 0 ? foundStream.global_inclusion : [''],
                    global_exclusion: foundStream.global_exclusion && foundStream.global_exclusion.length > 0 ? foundStream.global_exclusion : [''],
                    categories: foundStream.categories || [{
                        id: '',
                        name: '',
                        topics: [],
                        specific_inclusions: []
                    }],
                    report_frequency: foundStream.report_frequency,
                    is_active: foundStream.is_active,
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

        const updates = {
            stream_name: form.stream_name,
            purpose: form.purpose,
            audience: form.audience.filter(s => s.trim()),
            intended_guidance: form.intended_guidance.filter(s => s.trim()),
            global_inclusion: form.global_inclusion.filter(s => s.trim()),
            global_exclusion: form.global_exclusion.filter(s => s.trim()),
            categories: form.categories,
            report_frequency: form.report_frequency,
            is_active: form.is_active,
            workflow_config: form.workflow_config,
            scoring_config: form.scoring_config
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
                                    rows={3}
                                    value={form.purpose}
                                    onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    required
                                />
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
                                {form.intended_guidance.map((item, index) => (
                                    <div key={index} className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="e.g., Case strategy development"
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

                            {/* Global Inclusion */}
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
                                {form.global_inclusion.map((item, index) => (
                                    <div key={index} className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="e.g., Asbestos exposure assessment"
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

                            {/* Global Exclusion */}
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
                                {form.global_exclusion.map((item, index) => (
                                    <div key={index} className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="e.g., Legal case decisions"
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

                            {/* Active Status */}
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
                    )}

                    {/* Workflow & Scoring Tab */}
                    {activeTab === 'workflow' && (
                        <div className="space-y-6">
                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                                <p className="text-sm text-blue-800 dark:text-blue-200">
                                    To configure workflow settings (sources and semantic filters), please use the dedicated Implementation Configuration page for this stream.
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
