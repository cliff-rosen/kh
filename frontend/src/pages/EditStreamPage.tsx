import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, CogIcon, ArrowRightIcon } from '@heroicons/react/24/outline';

import {
    ReportFrequency,
    Category,
    SemanticSpace,
    Topic,
    Entity,
    RetrievalConfig,
    RetrievalGroup
} from '../types';

import { useResearchStream } from '../context/ResearchStreamContext';
import SemanticSpaceForm from '../components/SemanticSpaceForm';
import PresentationForm from '../components/PresentationForm';
import RetrievalConfigForm from '../components/RetrievalConfigForm';

type TabType = 'semantic' | 'retrieval' | 'presentation';

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

        // === LAYER 2: RETRIEVAL CONFIG ===
        retrieval_config: {
            retrieval_groups: [] as RetrievalGroup[],
            article_limit_per_week: 10
        } as RetrievalConfig,

        // === LAYER 3: PRESENTATION TAXONOMY ===
        categories: [
            {
                id: '',
                name: '',
                topics: [] as string[],
                specific_inclusions: [] as string[]
            }
        ] as Category[],

    });

    useEffect(() => {
        loadResearchStreams();
    }, [loadResearchStreams]);

    useEffect(() => {
        if (id && researchStreams.length > 0) {
            const foundStream = researchStreams.find(s => s.stream_id === Number(id));
            if (foundStream) {
                setStream(foundStream);

                // Use current three-layer architecture
                setForm({
                    stream_name: foundStream.stream_name,
                    report_frequency: foundStream.report_frequency,
                    is_active: foundStream.is_active,
                    semantic_space: foundStream.semantic_space,
                    retrieval_config: foundStream.retrieval_config || {
                        retrieval_groups: [],
                        article_limit_per_week: 10
                    },
                    categories: foundStream.presentation_config.categories.length > 0
                        ? foundStream.presentation_config.categories
                        : [{
                            id: '',
                            name: '',
                            topics: [],
                            specific_inclusions: []
                        }]
                });
            }
        }
    }, [id, researchStreams]);


    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!id) return;

        // Filter out empty categories (ones that haven't been filled out)
        const filledCategories = form.categories.filter(cat =>
            cat.id || cat.name || cat.topics.length > 0
        );

        // Check if any filled category is incomplete
        const incompleteCategory = filledCategories.find(cat =>
            !cat.id || !cat.name || cat.topics.length === 0
        );

        if (incompleteCategory) {
            alert('Please complete all category fields before submitting');
            return;
        }

        const updates = {
            stream_name: form.stream_name,
            report_frequency: form.report_frequency,
            is_active: form.is_active,
            // Layer 1: Semantic space (ground truth)
            semantic_space: form.semantic_space,
            // Layer 2: Retrieval config (edited via wizard)
            retrieval_config: form.retrieval_config,
            // Layer 3: Presentation config
            presentation_config: {
                categories: filledCategories
            }
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
        <div className="h-[calc(100vh-4rem)] flex flex-col max-w-7xl mx-auto">
            {/* Header - Fixed */}
            <div className="p-6 pb-0">
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
                <div className="mx-6 mt-4 bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-700 rounded-lg p-4">
                    <p className="text-red-800 dark:text-red-200">{error}</p>
                    <button
                        onClick={clearError}
                        className="mt-2 text-sm text-red-600 dark:text-red-400 hover:underline"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
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
                            onClick={() => setActiveTab('retrieval')}
                            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'retrieval'
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                                }`}
                        >
                            <div className="flex flex-col items-start">
                                <span>Layer 2: Retrieval Config</span>
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

                <form id="edit-stream-form" onSubmit={handleSubmit} className="space-y-6">
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

                    {/* Layer 2: Retrieval Configuration Tab */}
                    {activeTab === 'retrieval' && (
                        <div className="space-y-6">
                            {/* Wizard Option */}
                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-1">
                                            AI-Assisted Wizard Available
                                        </h3>
                                        <p className="text-xs text-blue-800 dark:text-blue-300 mb-3">
                                            Use the wizard for AI-assisted retrieval group setup, query generation, and filter configuration.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => navigate(`/streams/${id}/configure-retrieval`)}
                                            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium shadow-sm"
                                        >
                                            <CogIcon className="h-4 w-4" />
                                            Open Wizard
                                            <ArrowRightIcon className="h-3 w-3" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Manual Form */}
                            <RetrievalConfigForm
                                retrievalConfig={form.retrieval_config}
                                semanticSpace={form.semantic_space}
                                onChange={(updated) => setForm({ ...form, retrieval_config: updated })}
                            />
                        </div>
                    )}

                    {/* Layer 3: Presentation Taxonomy Tab */}
                    {activeTab === 'presentation' && (
                        <PresentationForm
                            categories={form.categories}
                            onChange={(updated) => setForm({ ...form, categories: updated })}
                        />
                    )}

                </form>
                </div>
            </div>

            {/* Pinned Footer Actions */}
            <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-4">
                <div className="max-w-7xl mx-auto flex justify-between">
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
                            form="edit-stream-form"
                            disabled={isLoading}
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                            {isLoading ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
