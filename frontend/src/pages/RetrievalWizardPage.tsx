import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeftIcon,
    ArrowRightIcon,
    ArrowPathIcon,
    CheckCircleIcon,
    SparklesIcon
} from '@heroicons/react/24/outline';
import { researchStreamApi } from '../lib/api/researchStreamApi';
import { ResearchStream, RetrievalGroup, SemanticSpace, InformationSource } from '../types';

// Import phase components
import GroupProposalPhase from '../components/RetrievalWizard/GroupProposalPhase';
import QueryConfigPhase from '../components/RetrievalWizard/QueryConfigPhase';
import FilterConfigPhase from '../components/RetrievalWizard/FilterConfigPhase';
import ValidationPhase from '../components/RetrievalWizard/ValidationPhase';

type WizardPhase = 'groups' | 'queries' | 'filters' | 'validation';

export default function RetrievalWizardPage() {
    const { streamId } = useParams<{ streamId: string }>();
    const navigate = useNavigate();

    // State
    const [stream, setStream] = useState<ResearchStream | null>(null);
    const [semanticSpace, setSemanticSpace] = useState<SemanticSpace | null>(null);
    const [groups, setGroups] = useState<RetrievalGroup[]>([]);
    const [sources, setSources] = useState<InformationSource[]>([]);
    const [currentPhase, setCurrentPhase] = useState<WizardPhase>('groups');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [validationReady, setValidationReady] = useState(false);

    // Phase completion tracking
    const [phasesCompleted, setPhasesCompleted] = useState({
        groups: false,
        queries: false,
        filters: false,
        validation: false
    });

    // Load stream data
    useEffect(() => {
        loadStreamData();
        loadSources();
    }, [streamId]);

    const loadStreamData = async () => {
        try {
            setLoading(true);
            const streamData = await researchStreamApi.getResearchStream(Number(streamId));
            setStream(streamData);
            setSemanticSpace(streamData.semantic_space);

            // Load existing groups if any
            if (streamData.retrieval_config?.retrieval_groups && streamData.retrieval_config.retrieval_groups.length > 0) {
                const existingGroups = streamData.retrieval_config.retrieval_groups;
                setGroups(existingGroups);

                // Detect what's already configured and mark phases complete
                const newPhasesCompleted = {
                    groups: false,
                    queries: false,
                    filters: false,
                    validation: false
                };

                // Phase 1: Groups - complete if we have groups with topics
                const hasValidGroups = existingGroups.length > 0 &&
                    existingGroups.every(g => g.covered_topics && g.covered_topics.length > 0);
                if (hasValidGroups) {
                    newPhasesCompleted.groups = true;
                }

                // Phase 2: Queries - complete if groups have queries configured
                const hasQueries = existingGroups.some(g =>
                    g.source_queries && Object.keys(g.source_queries).length > 0
                );
                if (hasQueries) {
                    newPhasesCompleted.queries = true;
                }

                // Phase 3: Filters - complete if at least checked (not required to enable)
                // Consider this complete if we've reached this point in config before
                const hasFilterConfig = existingGroups.some(g =>
                    g.semantic_filter && (g.semantic_filter.enabled || g.semantic_filter.criteria)
                );
                if (hasFilterConfig || hasQueries) {
                    newPhasesCompleted.filters = true;
                }

                setPhasesCompleted(newPhasesCompleted);

                // Always start at phase 1 (groups)
                setCurrentPhase('groups');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load stream');
        } finally {
            setLoading(false);
        }
    };

    const loadSources = async () => {
        try {
            const sourcesData = await researchStreamApi.getInformationSources();
            setSources(sourcesData);
        } catch (err) {
            console.error('Failed to load sources:', err);
        }
    };

    const handlePhaseComplete = (phase: WizardPhase, completed: boolean) => {
        setPhasesCompleted(prev => ({ ...prev, [phase]: completed }));
    };

    const canNavigateToPhase = (phase: WizardPhase): boolean => {
        switch (phase) {
            case 'groups':
                return true;
            case 'queries':
                return phasesCompleted.groups && groups.length > 0;
            case 'filters':
                return phasesCompleted.groups && groups.length > 0;
            case 'validation':
                return phasesCompleted.groups && groups.length > 0;
            default:
                return false;
        }
    };

    const handleSaveAndFinalize = async () => {
        if (!streamId || !stream) return;

        try {
            setSaving(true);

            // Update stream with new retrieval config
            await researchStreamApi.updateResearchStream(Number(streamId), {
                retrieval_config: {
                    retrieval_groups: groups,
                    article_limit_per_week: stream.retrieval_config?.article_limit_per_week
                }
            });

            // Navigate back to edit page
            navigate(`/streams/${streamId}/edit`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save configuration');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                    <p className="mt-4 text-gray-600 dark:text-gray-400">Loading wizard...</p>
                </div>
            </div>
        );
    }

    if (error || !stream || !semanticSpace) {
        return (
            <div className="max-w-7xl mx-auto px-4 py-8">
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <p className="text-red-800 dark:text-red-200">{error || 'Failed to load stream'}</p>
                </div>
            </div>
        );
    }

    const phases: { key: WizardPhase; label: string; icon: typeof CheckCircleIcon }[] = [
        { key: 'groups', label: 'Propose Groups', icon: SparklesIcon },
        { key: 'queries', label: 'Configure Queries', icon: CheckCircleIcon },
        { key: 'filters', label: 'Configure Filters', icon: CheckCircleIcon },
        { key: 'validation', label: 'Validate & Finalize', icon: CheckCircleIcon }
    ];

    return (
        <>
            {/* Header */}
            <div className="sticky top-0 z-40 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <div className="max-w-7xl mx-auto px-4 py-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <button
                                onClick={() => navigate(`/streams/${streamId}/edit`)}
                                type="button"
                                className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 mb-2 transition-colors cursor-pointer"
                            >
                                <ArrowLeftIcon className="h-4 w-4" />
                                Back to Edit Stream
                            </button>
                            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                                Retrieval Configuration Wizard
                            </h1>
                            <p className="text-gray-600 dark:text-gray-400 mt-1">
                                {stream.stream_name}
                            </p>
                        </div>
                    </div>

                    {/* Phase Progress */}
                    <div className="mt-8">
                        <nav aria-label="Progress">
                            <ol className="flex items-center justify-between">
                                {phases.map((phase, idx) => {
                                    const isActive = currentPhase === phase.key;
                                    const isCompleted = phasesCompleted[phase.key];
                                    const canNavigate = canNavigateToPhase(phase.key);
                                    const Icon = phase.icon;

                                    return (
                                        <li key={phase.key} className="relative flex-1">
                                            {/* Connector line */}
                                            {idx < phases.length - 1 && (
                                                <div
                                                    className={`absolute top-5 left-[50%] w-full h-0.5 ${
                                                        isCompleted
                                                            ? 'bg-blue-600'
                                                            : 'bg-gray-300 dark:bg-gray-700'
                                                    }`}
                                                    style={{ left: 'calc(50% + 20px)' }}
                                                />
                                            )}

                                            <button
                                                onClick={() => canNavigate && setCurrentPhase(phase.key)}
                                                disabled={!canNavigate}
                                                className={`relative flex flex-col items-center group ${
                                                    !canNavigate ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                                                }`}
                                            >
                                                <span
                                                    className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                                                        isActive
                                                            ? 'border-blue-600 bg-blue-600 text-white'
                                                            : isCompleted
                                                            ? 'border-blue-600 bg-blue-600 text-white'
                                                            : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                                                    }`}
                                                >
                                                    {isCompleted ? (
                                                        <CheckCircleIcon className="h-6 w-6" />
                                                    ) : (
                                                        <Icon className="h-5 w-5" />
                                                    )}
                                                </span>
                                                <span
                                                    className={`mt-2 text-xs font-medium ${
                                                        isActive
                                                            ? 'text-blue-600 dark:text-blue-400'
                                                            : isCompleted
                                                            ? 'text-gray-900 dark:text-white'
                                                            : 'text-gray-500 dark:text-gray-400'
                                                    }`}
                                                >
                                                    {phase.label}
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ol>
                        </nav>
                    </div>
                </div>
            </div>

            {/* Phase Content */}
            <div className="bg-gray-50 dark:bg-gray-900 pb-24">
                <div className="max-w-7xl mx-auto px-4 py-8">
                    {currentPhase === 'groups' && (
                        <GroupProposalPhase
                            streamId={Number(streamId)}
                            semanticSpace={semanticSpace}
                            groups={groups}
                            onGroupsChange={setGroups}
                            onComplete={(completed) => handlePhaseComplete('groups', completed)}
                        />
                    )}

                    {currentPhase === 'queries' && (
                        <QueryConfigPhase
                            streamId={Number(streamId)}
                            semanticSpace={semanticSpace}
                            groups={groups}
                            sources={sources}
                            onGroupsChange={setGroups}
                            onComplete={(completed) => handlePhaseComplete('queries', completed)}
                        />
                    )}

                    {currentPhase === 'filters' && (
                        <FilterConfigPhase
                            streamId={Number(streamId)}
                            semanticSpace={semanticSpace}
                            groups={groups}
                            onGroupsChange={setGroups}
                            onComplete={(completed) => handlePhaseComplete('filters', completed)}
                        />
                    )}

                    {currentPhase === 'validation' && (
                        <ValidationPhase
                            streamId={Number(streamId)}
                            semanticSpace={semanticSpace}
                            groups={groups}
                            onValidationReady={setValidationReady}
                        />
                    )}
                </div>
            </div>

            {/* Navigation Footer - Sticky */}
            <div className="sticky bottom-0 left-0 right-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-4 shadow-lg z-50">
                <div className="max-w-7xl mx-auto flex justify-between">
                    {currentPhase !== 'groups' ? (
                        <button
                            onClick={() => {
                                if (currentPhase === 'queries') setCurrentPhase('groups');
                                else if (currentPhase === 'filters') setCurrentPhase('queries');
                                else if (currentPhase === 'validation') setCurrentPhase('filters');
                            }}
                            className="inline-flex items-center gap-2 px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 font-medium"
                        >
                            <ArrowLeftIcon className="h-5 w-5" />
                            Back
                        </button>
                    ) : (
                        <div></div>
                    )}

                    {currentPhase === 'validation' ? (
                        <button
                            onClick={handleSaveAndFinalize}
                            disabled={!validationReady || saving}
                            className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                        >
                            {saving ? (
                                <>
                                    <ArrowPathIcon className="h-5 w-5 animate-spin" />
                                    Saving Configuration...
                                </>
                            ) : (
                                <>
                                    <CheckCircleIcon className="h-5 w-5" />
                                    Finalize & Activate
                                </>
                            )}
                        </button>
                    ) : (
                        <button
                            onClick={() => {
                                if (currentPhase === 'groups') setCurrentPhase('queries');
                                else if (currentPhase === 'queries') setCurrentPhase('filters');
                                else if (currentPhase === 'filters') setCurrentPhase('validation');
                            }}
                            disabled={currentPhase === 'groups' && groups.length === 0}
                            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                        >
                            Continue
                            <ArrowRightIcon className="h-5 w-5" />
                        </button>
                    )}
                </div>
            </div>
        </>
    );
}
