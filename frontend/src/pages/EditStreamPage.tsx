import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeftIcon, CogIcon, ArrowRightIcon } from '@heroicons/react/24/outline';

import {
    ReportFrequency,
    Category,
    SemanticSpace,
    Topic,
    Entity,
    RetrievalConfig,
    Concept
} from '../types';

import { useResearchStream } from '../context/ResearchStreamContext';
import SemanticSpaceForm from '../components/SemanticSpaceForm';
import PresentationForm from '../components/PresentationForm';
import RetrievalConfigForm from '../components/RetrievalConfigForm';
import TestRefineTab from '../components/TestRefineTab';
import ContentEnrichmentForm from '../components/ContentEnrichmentForm';
import ChatTray from '../components/chat/ChatTray';
import { promptWorkbenchApi, PromptTemplate, SlugInfo } from '../lib/api/promptWorkbenchApi';
import SchemaProposalCard from '../components/chat/SchemaProposalCard';
import PresentationCategoriesCard from '../components/chat/PresentationCategoriesCard';
import PromptSuggestionsCard from '../components/chat/PromptSuggestionsCard';
import RetrievalProposalCard from '../components/chat/RetrievalProposalCard';

type TabType = 'semantic' | 'retrieval' | 'presentation' | 'enrichment' | 'execute';

interface PromptSuggestion {
    target: 'system_prompt' | 'user_prompt_template';
    current_issue: string;
    suggested_text: string;
    reasoning: string;
}

interface AppliedPromptSuggestions {
    prompt_type: 'executive_summary' | 'category_summary';
    suggestions: PromptSuggestion[];
}

export default function EditStreamPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { researchStreams, loadResearchStreams, loadResearchStream, updateResearchStream, deleteResearchStream, isLoading, error, clearError } = useResearchStream();

    const [stream, setStream] = useState<any>(null);

    // Enrichment config state for chat context
    const [enrichmentConfig, setEnrichmentConfig] = useState<{
        prompts: Record<string, PromptTemplate>;
        defaults: Record<string, PromptTemplate>;
        availableSlugs: Record<string, SlugInfo[]>;
        isUsingDefaults: boolean;
    } | null>(null);

    // State for prompt suggestions from chat
    const [appliedPromptSuggestions, setAppliedPromptSuggestions] = useState<AppliedPromptSuggestions | null>(null);

    // Check URL params for initial tab
    const initialTab = (searchParams.get('tab') as TabType) || 'semantic';
    const [activeTab, setActiveTab] = useState<TabType>(initialTab);
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
            concepts: [] as Concept[],
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
                        concepts: [],
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

    // Load enrichment config for chat context when on enrichment tab
    useEffect(() => {
        const loadEnrichmentConfig = async () => {
            if (!id || activeTab !== 'enrichment') return;

            try {
                const [defaultsResponse, configResponse] = await Promise.all([
                    promptWorkbenchApi.getDefaults(),
                    promptWorkbenchApi.getStreamEnrichmentConfig(Number(id))
                ]);

                const currentPrompts = configResponse.enrichment_config?.prompts
                    ? { ...defaultsResponse.prompts, ...configResponse.enrichment_config.prompts }
                    : defaultsResponse.prompts;

                setEnrichmentConfig({
                    prompts: currentPrompts,
                    defaults: defaultsResponse.prompts,
                    availableSlugs: defaultsResponse.available_slugs,
                    isUsingDefaults: configResponse.is_using_defaults
                });
            } catch (err) {
                console.error('Failed to load enrichment config for chat:', err);
            }
        };

        loadEnrichmentConfig();
    }, [id, activeTab]);

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

    // Payload handlers for chat
    const handleSchemaProposalAccept = (proposalData: any) => {
        const changes = proposalData.proposed_changes || {};

        console.log('Applying schema proposal changes:', changes);

        // Create a new form object with the proposed changes applied
        const updatedForm = { ...form };

        // Apply each proposed change
        Object.entries(changes).forEach(([key, value]) => {
            if (key === 'stream_name') {
                updatedForm.stream_name = value as string;
            } else if (key === 'purpose') {
                // Purpose is on the stream level, not in semantic_space
                console.log('Purpose change proposed:', value);
            } else if (key.startsWith('semantic_space.')) {
                // Handle nested semantic_space fields
                const path = key.replace('semantic_space.', '').split('.');
                let target: any = updatedForm.semantic_space;

                // Navigate to the nested property
                for (let i = 0; i < path.length - 1; i++) {
                    if (!target[path[i]]) {
                        target[path[i]] = {};
                    }
                    target = target[path[i]];
                }

                // Set the value
                target[path[path.length - 1]] = value;
            }
        });

        // Update the form state
        setForm(updatedForm);

        // Show a success message
        alert('Schema changes have been applied to the form. Click "Save Changes" to persist them.');
    };

    const handleSchemaProposalReject = () => {
        console.log('Schema proposal rejected');
    };

    const handlePresentationCategoriesAccept = (proposalData: any) => {
        const categories = proposalData.categories || [];

        console.log('Applying presentation categories:', categories);

        // Update the form with the proposed categories
        setForm({
            ...form,
            categories: categories
        });

        // Show a success message
        alert('Presentation categories have been applied to the form. Click "Save Changes" to persist them.');
    };

    const handlePresentationCategoriesReject = () => {
        console.log('Presentation categories proposal rejected');
    };

    const handlePromptSuggestionsAccept = (payload: AppliedPromptSuggestions) => {
        console.log('Applying prompt suggestions:', payload);
        setAppliedPromptSuggestions(payload);
        // Switch to enrichment tab if not already there
        if (activeTab !== 'enrichment') {
            setActiveTab('enrichment');
        }
    };

    const handlePromptSuggestionsReject = () => {
        console.log('Prompt suggestions rejected');
    };

    const handlePromptSuggestionsApplied = () => {
        // Clear the applied suggestions after they've been applied
        setAppliedPromptSuggestions(null);
    };

    const handleRetrievalProposalAccept = (proposalData: any) => {
        console.log('Applying retrieval proposal:', proposalData);

        const isBroadSearch = proposalData.proposal_type === 'broad_search';

        if (isBroadSearch && proposalData.broad_search) {
            // Apply broad search strategy
            setForm(prev => ({
                ...prev,
                retrieval_config: {
                    ...prev.retrieval_config,
                    broad_search: {
                        queries: proposalData.broad_search.queries.map((q: any) => ({
                            query_id: q.query_id,
                            name: q.name,
                            query: q.query_string,
                            covered_topics: q.covered_topics,
                            rationale: q.rationale
                        })),
                        strategy_rationale: proposalData.broad_search.strategy_rationale,
                        coverage_analysis: {}
                    },
                    concepts: null  // Clear concepts if switching to broad search
                }
            }));
        } else if (proposalData.concepts) {
            // Apply concepts strategy
            setForm(prev => ({
                ...prev,
                retrieval_config: {
                    ...prev.retrieval_config,
                    concepts: proposalData.concepts.map((c: any) => ({
                        concept_id: c.concept_id,
                        name: c.name,
                        search_query: c.search_query,
                        covered_topics: c.covered_topics,
                        entity_pattern: [],
                        relationship_edges: [],
                        relationship_description: c.rationale || ''
                    })),
                    broad_search: null  // Clear broad search if switching to concepts
                }
            }));
        }

        alert('Retrieval configuration has been applied to the form. Click "Save Changes" to persist.');
    };

    const handleRetrievalProposalReject = () => {
        console.log('Retrieval proposal rejected');
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
                    <div className="mb-6 pb-6 border-b border-gray-200 dark:border-gray-700">
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                            <div className="md:col-span-6">
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

                            <div className="md:col-span-3">
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

                            <div className="md:col-span-3 flex items-center h-[42px]">
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
                            <button
                                type="button"
                                onClick={() => setActiveTab('enrichment')}
                                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'enrichment'
                                    ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                                    }`}
                            >
                                <div className="flex flex-col items-start">
                                    <span>Layer 4: Content Enrichment</span>
                                    <span className="text-xs font-normal text-gray-500 dark:text-gray-400">Customize summary prompts</span>
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('execute')}
                                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'execute'
                                    ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                                    }`}
                            >
                                <div className="flex flex-col items-start">
                                    <span>Layer 5: Test & Refine</span>
                                    <span className="text-xs font-normal text-gray-500 dark:text-gray-400">Refine queries and run pipeline</span>
                                </div>
                            </button>
                        </nav>
                    </div>

                    <form id="edit-stream-form" onSubmit={handleSubmit} className="space-y-6">
                        {/* Layer 1: Semantic Space Tab */}
                        {activeTab === 'semantic' && (
                            <div className="space-y-6">
                                <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                                    <h3 className="text-sm font-semibold text-purple-900 dark:text-purple-200 mb-2">
                                        Layer 1: Semantic Space
                                    </h3>
                                    <p className="text-sm text-purple-800 dark:text-purple-300">
                                        Define what information matters. This is the canonical, source-agnostic ground truth that both retrieval strategies and presentation categories derive from.
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
                                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                                            Layer 2: Retrieval Configuration
                                        </h3>
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
                                    <p className="text-sm text-blue-800 dark:text-blue-300">
                                        Define how to find and filter content. Use the wizard for AI-assisted setup, or configure manually below.
                                    </p>
                                </div>

                                <RetrievalConfigForm
                                    retrievalConfig={form.retrieval_config}
                                    onChange={(updated) => setForm({ ...form, retrieval_config: updated })}
                                />
                            </div>
                        )}

                        {/* Layer 3: Presentation Taxonomy Tab */}
                        {activeTab === 'presentation' && (
                            <div className="space-y-6">
                                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                                    <h3 className="text-sm font-semibold text-green-900 dark:text-green-200 mb-2">
                                        Layer 3: Presentation Configuration
                                    </h3>
                                    <p className="text-sm text-green-800 dark:text-green-300">
                                        Define how to organize results. Create categories that group topics for report presentation.
                                    </p>
                                </div>

                                <PresentationForm
                                    categories={form.categories}
                                    onChange={(updated) => setForm({ ...form, categories: updated })}
                                />
                            </div>
                        )}

                        {/* Layer 4: Content Enrichment Tab */}
                        {activeTab === 'enrichment' && stream && (
                            <ContentEnrichmentForm
                                streamId={parseInt(id!)}
                                onSave={() => loadResearchStream(parseInt(id!))}
                                appliedSuggestions={appliedPromptSuggestions}
                                onSuggestionsApplied={handlePromptSuggestionsApplied}
                            />
                        )}

                        {/* Layer 5: Test & Refine Tab */}
                        {activeTab === 'execute' && stream && (
                            <TestRefineTab
                                streamId={parseInt(id!)}
                                stream={stream}
                                onStreamUpdate={() => loadResearchStream(parseInt(id!))}
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
                        {/* Hide main save button on enrichment tab - it has its own save */}
                        {activeTab !== 'enrichment' && (
                            <button
                                type="submit"
                                form="edit-stream-form"
                                disabled={isLoading}
                                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                            >
                                {isLoading ? 'Saving...' : 'Save Changes'}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Chat Tray */}
            <ChatTray
                key={activeTab}  // Force re-mount when tab changes to ensure context updates
                initialContext={{
                    current_page: "edit_research_stream",
                    entity_type: "research_stream",
                    entity_id: stream?.stream_id,
                    stream_name: stream?.stream_name,
                    active_tab: activeTab,
                    // Tab-specific context
                    current_schema: activeTab === 'semantic' ? {
                        stream_name: form.stream_name,
                        purpose: stream?.purpose || "",
                        semantic_space: form.semantic_space
                    } : activeTab === 'retrieval' ? {
                        stream_name: form.stream_name,
                        retrieval_config: form.retrieval_config,
                        semantic_space: {
                            topics: form.semantic_space.topics  // Include topics for reference
                        }
                    } : activeTab === 'presentation' ? {
                        stream_name: form.stream_name,
                        semantic_space: {
                            topics: form.semantic_space.topics  // Include topics for reference
                        },
                        categories: form.categories
                    } : activeTab === 'enrichment' ? {
                        // Enrichment tab - include prompts and context
                        stream_name: form.stream_name,
                        purpose: stream?.purpose || "",
                        enrichment: enrichmentConfig ? {
                            is_using_defaults: enrichmentConfig.isUsingDefaults,
                            executive_summary: {
                                system_prompt: enrichmentConfig.prompts.executive_summary?.system_prompt,
                                user_prompt_template: enrichmentConfig.prompts.executive_summary?.user_prompt_template,
                                available_slugs: enrichmentConfig.availableSlugs.executive_summary
                            },
                            category_summary: {
                                system_prompt: enrichmentConfig.prompts.category_summary?.system_prompt,
                                user_prompt_template: enrichmentConfig.prompts.category_summary?.user_prompt_template,
                                available_slugs: enrichmentConfig.availableSlugs.category_summary
                            },
                            defaults: enrichmentConfig.defaults
                        } : null,
                        // Include stream context for prompt suggestions
                        semantic_space: {
                            topics: form.semantic_space.topics,
                            domain: form.semantic_space.domain
                        },
                        categories: form.categories
                    } : {
                        // execute tab - include everything
                        stream_name: form.stream_name,
                        semantic_space: form.semantic_space,
                        retrieval_config: form.retrieval_config,
                        categories: form.categories
                    }
                }}
                payloadHandlers={{
                    schema_proposal: {
                        render: (payload, callbacks) => (
                            <SchemaProposalCard
                                proposal={payload}
                                onAccept={callbacks.onAccept}
                                onReject={callbacks.onReject}
                            />
                        ),
                        onAccept: handleSchemaProposalAccept,
                        onReject: handleSchemaProposalReject,
                        renderOptions: {
                            panelWidth: '500px',
                            headerTitle: 'Schema Proposal',
                            headerIcon: '📋'
                        }
                    },
                    presentation_categories: {
                        render: (payload, callbacks) => (
                            <PresentationCategoriesCard
                                proposal={payload}
                                onAccept={callbacks.onAccept}
                                onReject={callbacks.onReject}
                            />
                        ),
                        onAccept: handlePresentationCategoriesAccept,
                        onReject: handlePresentationCategoriesReject,
                        renderOptions: {
                            panelWidth: '600px',
                            headerTitle: 'Presentation Categories',
                            headerIcon: '📊'
                        }
                    },
                    prompt_suggestions: {
                        render: (payload, callbacks) => (
                            <PromptSuggestionsCard
                                proposal={payload}
                                onAccept={callbacks.onAccept}
                                onReject={callbacks.onReject}
                            />
                        ),
                        onAccept: handlePromptSuggestionsAccept,
                        onReject: handlePromptSuggestionsReject,
                        renderOptions: {
                            panelWidth: '550px',
                            headerTitle: 'Prompt Suggestions',
                            headerIcon: '✨'
                        }
                    },
                    retrieval_proposal: {
                        render: (payload, callbacks) => (
                            <RetrievalProposalCard
                                proposal={payload}
                                onAccept={callbacks.onAccept}
                                onReject={callbacks.onReject}
                            />
                        ),
                        onAccept: handleRetrievalProposalAccept,
                        onReject: handleRetrievalProposalReject,
                        renderOptions: {
                            panelWidth: '600px',
                            headerTitle: 'Retrieval Proposal',
                            headerIcon: '🔍'
                        }
                    }
                }}
            />
        </div>
    );
}
