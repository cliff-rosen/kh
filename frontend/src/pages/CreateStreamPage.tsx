import { useState, useEffect } from 'react';
import { useResearchStream } from '../context/ResearchStreamContext';
import {
    ReportFrequency,
    Category,
    SemanticSpace,
    RetrievalConfig,
    PresentationConfig,
    Topic,
    Entity,
    ScheduleConfig
} from '../types';
import { useNavigate } from 'react-router-dom';
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import StreamBasicsForm, { StreamScope } from '../components/stream/StreamBasicsForm';
import SemanticSpaceForm from '../components/stream/SemanticSpaceForm';
import PresentationForm from '../components/stream/PresentationForm';
import RetrievalConfigForm from '../components/stream/RetrievalConfigForm';
import ChatTray from '../components/chat/ChatTray';
import { showErrorToast } from '../lib/errorToast';
import StreamTemplateCard from '../components/chat/StreamTemplateCard';
import SemanticSpaceProposalCard, { SemanticSpaceProposalData } from '../components/chat/SemanticSpaceProposalCard';
import RetrievalConfigProposalCard, { RetrievalConfigProposalData } from '../components/chat/RetrievalConfigProposalCard';
import PresentationConfigProposalCard, { PresentationConfigProposalData } from '../components/chat/PresentationConfigProposalCard';

interface CreateStreamPageProps {
    onCancel?: () => void;
}

type TabType = 'semantic' | 'retrieval' | 'presentation';

export default function CreateStreamPage({ onCancel }: CreateStreamPageProps) {
    const { createResearchStream, isLoading, error, clearError, loadAvailableSources } = useResearchStream();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<TabType>('semantic');
    const [isChatOpen, setIsChatOpen] = useState(false);

    const [form, setForm] = useState({
        stream_name: '',
        scope: 'personal' as StreamScope,
        schedule_config: {
            enabled: false,
            frequency: ReportFrequency.WEEKLY,
            anchor_day: null,
            preferred_time: '08:00',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
            send_day: null,
            send_time: null,
        } as ScheduleConfig,

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
            concepts: null,
            broad_search: null,
            article_limit_per_week: 10
        } as RetrievalConfig,

        // === LAYER 3: PRESENTATION CONFIG ===
        presentation_config: {
            categories: [
                {
                    id: '',
                    name: '',
                    topics: [] as string[],
                    specific_inclusions: [] as string[]
                }
            ] as Category[]
        } as PresentationConfig
    });

    useEffect(() => {
        loadAvailableSources();
    }, [loadAvailableSources]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Filter out empty categories (ones that haven't been filled out)
        const filledCategories = form.presentation_config.categories.filter(cat =>
            cat.id || cat.name || cat.topics.length > 0
        );

        // Validate that all filled categories are complete
        const incompleteCategory = filledCategories.find(cat =>
            !cat.id || !cat.name || cat.topics.length === 0
        );

        if (incompleteCategory) {
            alert('Please complete all category fields before submitting');
            return;
        }

        // Derive purpose from semantic space
        const purpose = form.semantic_space.domain.description || form.semantic_space.context.business_context;

        // Prepare clean data for submission (new three-layer structure)
        const cleanedForm = {
            stream_name: form.stream_name,
            purpose: purpose,
            schedule_config: form.schedule_config,
            scope: form.scope,  // Stream visibility scope
            // Three-layer architecture
            semantic_space: form.semantic_space,
            retrieval_config: form.retrieval_config,
            presentation_config: {
                categories: filledCategories
            }
        };

        console.log('Submitting form data:', cleanedForm);

        try {
            const newStream = await createResearchStream(cleanedForm);
            // Navigate directly to implementation configuration (Workflow 2)
            navigate(`/streams/${newStream.stream_id}/configure`);
        } catch (err) {
            showErrorToast(err, 'Failed to create stream');
        }
    };

    return (
        <div className="h-[calc(100vh-4rem)] flex">
            {/* Chat Tray - inline on left side */}
            <ChatTray
                initialContext={{
                    current_page: "new_stream",
                    active_tab: activeTab,
                    current_form: {
                        stream_name: form.stream_name,
                        semantic_space: form.semantic_space,
                        retrieval_config: form.retrieval_config,
                        presentation_config: form.presentation_config
                    }
                }}
                payloadHandlers={{
                    stream_template: {
                        render: (payload: any, callbacks: { onAccept?: (data: any) => void; onReject?: () => void }) => (
                            <StreamTemplateCard payload={payload} onAccept={callbacks.onAccept} onReject={callbacks.onReject} />
                        ),
                        onAccept: (data: any) => {
                            setForm(prev => ({
                                ...prev,
                                stream_name: data.stream_name || prev.stream_name,
                                semantic_space: {
                                    ...prev.semantic_space,
                                    domain: data.domain || prev.semantic_space.domain,
                                    topics: (data.topics || []).map((t: any, i: number) => ({
                                        topic_id: `topic_${i}`,
                                        name: t.name,
                                        description: t.description,
                                        importance: t.importance || 'medium',
                                        keywords: [],
                                        related_topics: []
                                    })),
                                    entities: (data.entities || []).map((e: any, i: number) => ({
                                        entity_id: `entity_${i}`,
                                        name: e.name,
                                        type: e.type || 'other',
                                        description: e.description,
                                        importance: e.importance || 'medium',
                                        aliases: [],
                                        canonical_forms: []
                                    })),
                                    context: {
                                        ...prev.semantic_space.context,
                                        business_context: data.business_context || prev.semantic_space.context.business_context
                                    }
                                }
                            }));
                        },
                        renderOptions: {
                            panelWidth: '650px',
                            headerTitle: 'Stream Template',
                            headerIcon: '🚀'
                        }
                    },
                    semantic_space_proposal: {
                        render: (payload: SemanticSpaceProposalData, callbacks: { onAccept?: (data: SemanticSpaceProposalData) => void; onReject?: () => void }) => (
                            <SemanticSpaceProposalCard data={payload} onAccept={callbacks.onAccept} onReject={callbacks.onReject} />
                        ),
                        onAccept: (data: SemanticSpaceProposalData) => {
                            setForm(prev => ({
                                ...prev,
                                semantic_space: {
                                    ...prev.semantic_space,
                                    ...data.semantic_space as SemanticSpace
                                }
                            }));
                        },
                        renderOptions: {
                            panelWidth: '650px',
                            headerTitle: 'Semantic Space Proposal',
                            headerIcon: '🧠'
                        }
                    },
                    retrieval_config_proposal: {
                        render: (payload: RetrievalConfigProposalData, callbacks: { onAccept?: (data: RetrievalConfigProposalData) => void; onReject?: () => void }) => (
                            <RetrievalConfigProposalCard data={payload} onAccept={callbacks.onAccept} onReject={callbacks.onReject} />
                        ),
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        onAccept: (data: RetrievalConfigProposalData) => {
                            setForm(prev => ({
                                ...prev,
                                retrieval_config: {
                                    ...prev.retrieval_config,
                                    broad_search: {
                                        queries: data.queries as any,
                                        strategy_rationale: data.strategy_rationale,
                                        coverage_analysis: data.coverage_analysis
                                    }
                                }
                            }));
                        },
                        renderOptions: {
                            panelWidth: '650px',
                            headerTitle: 'Retrieval Config Proposal',
                            headerIcon: '🔍'
                        }
                    },
                    presentation_config_proposal: {
                        render: (payload: PresentationConfigProposalData, callbacks: { onAccept?: (data: PresentationConfigProposalData) => void; onReject?: () => void }) => (
                            <PresentationConfigProposalCard data={payload} onAccept={callbacks.onAccept} onReject={callbacks.onReject} />
                        ),
                        onAccept: (data: PresentationConfigProposalData) => {
                            setForm(prev => ({
                                ...prev,
                                presentation_config: {
                                    ...prev.presentation_config,
                                    categories: data.categories
                                }
                            }));
                        },
                        renderOptions: {
                            panelWidth: '600px',
                            headerTitle: 'Categories Proposal',
                            headerIcon: '📊'
                        }
                    }
                }}
                isOpen={isChatOpen}
                onOpenChange={setIsChatOpen}
            />

            {/* Main Content - takes remaining space */}
            <div className="flex-1 flex flex-col overflow-hidden relative">
                {/* Chat toggle button - fixed to lower left */}
                {!isChatOpen && (
                    <button
                        onClick={() => setIsChatOpen(true)}
                        className="fixed bottom-6 left-6 z-40 p-4 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-all hover:scale-110"
                        title="Open chat"
                    >
                        <ChatBubbleLeftRightIcon className="h-6 w-6" />
                    </button>
                )}

                {/* Header - Fixed */}
                <div className="p-6 pb-0 max-w-7xl">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                        Create Research Stream
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400">
                        Define a comprehensive research scope with categories and inclusion criteria.
                    </p>
                </div>

                {error && (
                    <div className="mx-6 mt-4 bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-700 rounded-lg p-4">
                        <p className="text-red-800 dark:text-red-200">{error}</p>
                        <button
                            type="button"
                            onClick={clearError}
                            className="mt-2 text-sm text-red-600 dark:text-red-400 hover:underline"
                        >
                            Dismiss
                        </button>
                    </div>
                )}

                {/* Scrollable Content */}
                <div className="flex-1 min-h-0 flex flex-col px-6 py-6">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 flex-1 min-h-0 flex flex-col">
                        {/* Tabs */}
                        <div className="border-b border-gray-200 dark:border-gray-700 mb-4 flex-shrink-0">
                            <nav className="-mb-px flex space-x-6">
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

                        {/* Form */}
                        <form id="create-stream-form" onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col overflow-hidden">
                            {/* Layer 1: Semantic Space Tab */}
                            {activeTab === 'semantic' && (
                                <div className="flex-1 min-h-0 overflow-y-auto space-y-6">
                                    <StreamBasicsForm
                                        streamName={form.stream_name}
                                        onStreamNameChange={(name) => setForm({ ...form, stream_name: name })}
                                        scope={form.scope}
                                        onScopeChange={(scope) => setForm({ ...form, scope })}
                                        scheduleConfig={form.schedule_config}
                                        onScheduleConfigChange={(config) => setForm({ ...form, schedule_config: config })}
                                    />

                                    <SemanticSpaceForm
                                        semanticSpace={form.semantic_space}
                                        onChange={(updated) => setForm({ ...form, semantic_space: updated })}
                                    />
                                </div>
                            )}

                            {/* Layer 2: Retrieval Config Tab */}
                            {activeTab === 'retrieval' && (
                                <div className="flex-1 min-h-0 flex flex-col">
                                    <RetrievalConfigForm
                                        retrievalConfig={form.retrieval_config}
                                        onChange={(updated) => setForm({ ...form, retrieval_config: updated })}
                                    />
                                </div>
                            )}

                            {/* Layer 3: Presentation Config Tab */}
                            {activeTab === 'presentation' && (
                                <div className="flex-1 min-h-0 flex flex-col">
                                    <PresentationForm
                                        categories={form.presentation_config.categories}
                                        onChange={(updated) => setForm({
                                            ...form,
                                            presentation_config: { ...form.presentation_config, categories: updated }
                                        })}
                                    />
                                </div>
                            )}
                        </form>
                    </div>
                </div>

                {/* Pinned Footer Actions */}
                <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-4 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onCancel || (() => navigate('/dashboard'))}
                        className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        form="create-stream-form"
                        disabled={isLoading}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                        {isLoading ? 'Creating...' : 'Create Stream'}
                    </button>
                </div>
            </div>{/* end main content */}
        </div>
    );
}
