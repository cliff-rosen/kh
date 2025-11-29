import { useState } from 'react';
import {
    BeakerIcon,
    ChevronDownIcon,
    ChevronRightIcon,
    ChevronLeftIcon,
    PlayIcon,
    ArrowPathIcon,
    PlusIcon,
    XMarkIcon,
    CheckCircleIcon,
    XCircleIcon,
    FunnelIcon,
    TagIcon,
    DocumentTextIcon,
    ArrowDownIcon
} from '@heroicons/react/24/outline';
import { researchStreamApi } from '../lib/api/researchStreamApi';
import { ResearchStream } from '../types';
import { CanonicalResearchArticle } from '../types/canonical_types';

interface QueryRefinementWorkbenchProps {
    streamId: number;
    stream: ResearchStream;
}

type StepType = 'source' | 'filter' | 'categorize';
type SourceType = 'query' | 'manual' | 'previous';

interface WorkflowStep {
    id: string;
    type: StepType;
    config: any;
    results: any | null;
    expanded: boolean;
}

type ResultView = 'raw' | 'compare' | 'analyze';

export default function QueryRefinementWorkbench({ streamId, stream }: QueryRefinementWorkbenchProps) {
    const [steps, setSteps] = useState<WorkflowStep[]>([
        {
            id: 'step_1',
            type: 'source',
            config: { sourceType: 'query', selectedQuery: '', startDate: '', endDate: '' },
            results: null,
            expanded: true
        }
    ]);
    const [focusedStepId, setFocusedStepId] = useState<string>('step_1');
    const [resultView, setResultView] = useState<ResultView>('raw');
    const [resultsPaneCollapsed, setResultsPaneCollapsed] = useState(false);

    const addStep = (type: StepType) => {
        const newStep: WorkflowStep = {
            id: `step_${Date.now()}`,
            type,
            config: {},
            results: null,
            expanded: true
        };
        setSteps([...steps, newStep]);
        setFocusedStepId(newStep.id);
    };

    const removeStep = (id: string) => {
        setSteps(steps.filter(s => s.id !== id));
        if (focusedStepId === id) {
            setFocusedStepId('step_1');
        }
    };

    const updateStep = (id: string, updates: Partial<WorkflowStep>) => {
        setSteps(steps.map(s => s.id === id ? { ...s, ...updates } : s));
    };

    const toggleExpanded = (id: string) => {
        setSteps(steps.map(s => s.id === id ? { ...s, expanded: !s.expanded } : s));
    };

    const canAddFilter = !steps.some(s => s.type === 'filter');
    const canAddCategorize = !steps.some(s => s.type === 'categorize');

    const focusedStep = steps.find(s => s.id === focusedStepId);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-start justify-between">
                    <div>
                        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
                            Query Refinement Workbench
                        </h3>
                        <p className="text-sm text-blue-800 dark:text-blue-300">
                            Test queries, filters, and categorization in isolation or as a pipeline. Build and refine each step independently.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            setSteps([{
                                id: 'step_1',
                                type: 'source',
                                config: { sourceType: 'query', selectedQuery: '', startDate: '', endDate: '' },
                                results: null,
                                expanded: true
                            }]);
                            setFocusedStepId('step_1');
                        }}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                        Clear All
                    </button>
                </div>
            </div>

            {/* Two-Column Layout */}
            <div className={`flex gap-6 ${resultsPaneCollapsed ? '' : 'grid grid-cols-[40%_60%]'}`}>
                {/* Left: Workflow Steps */}
                <div className={`space-y-4 ${resultsPaneCollapsed ? 'flex-1' : ''}`}>
                    {steps.map((step, index) => (
                        <div key={step.id}>
                            {index > 0 && (
                                <div className="flex justify-center py-2">
                                    <ArrowDownIcon className="h-5 w-5 text-gray-400" />
                                </div>
                            )}
                            <WorkflowStepCard
                                step={step}
                                stepNumber={index + 1}
                                onUpdate={(updates) => updateStep(step.id, updates)}
                                onRemove={steps.length > 1 ? () => removeStep(step.id) : undefined}
                                onToggle={() => toggleExpanded(step.id)}
                                onFocus={() => setFocusedStepId(step.id)}
                                isFocused={focusedStepId === step.id}
                                previousSteps={steps.slice(0, index)}
                                stream={stream}
                                streamId={streamId}
                                onExpandResults={() => setResultsPaneCollapsed(false)}
                            />
                        </div>
                    ))}

                    {/* Add Step Buttons */}
                    <div className="flex gap-3 pt-2">
                        {canAddFilter && (
                            <button
                                type="button"
                                onClick={() => addStep('filter')}
                                className="flex items-center gap-2 px-4 py-2 text-sm border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-700 dark:text-gray-300 transition-colors"
                            >
                                <PlusIcon className="h-4 w-4" />
                                Add Filter
                            </button>
                        )}
                        {canAddCategorize && (
                            <button
                                type="button"
                                onClick={() => addStep('categorize')}
                                className="flex items-center gap-2 px-4 py-2 text-sm border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-700 dark:text-gray-300 transition-colors"
                            >
                                <PlusIcon className="h-4 w-4" />
                                Add Categorize
                            </button>
                        )}
                    </div>
                </div>

                {/* Right: Results Pane */}
                {resultsPaneCollapsed ? (
                    <div className="flex items-start">
                        <button
                            type="button"
                            onClick={() => setResultsPaneCollapsed(false)}
                            className="flex items-center justify-center w-8 h-12 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-l-lg border border-gray-300 dark:border-gray-600 transition-colors"
                            title="Expand results pane"
                        >
                            <ChevronLeftIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                        </button>
                    </div>
                ) : (
                    <ResultsPane
                        step={focusedStep}
                        stepNumber={steps.findIndex(s => s.id === focusedStepId) + 1}
                        view={resultView}
                        onViewChange={setResultView}
                        onCollapse={() => setResultsPaneCollapsed(true)}
                    />
                )}
            </div>
        </div>
    );
}

// ============================================================================
// Workflow Step Card
// ============================================================================

interface WorkflowStepCardProps {
    step: WorkflowStep;
    stepNumber: number;
    onUpdate: (updates: Partial<WorkflowStep>) => void;
    onRemove?: () => void;
    onToggle: () => void;
    onFocus: () => void;
    isFocused: boolean;
    previousSteps: WorkflowStep[];
    stream: ResearchStream;
    streamId: number;
    onExpandResults: () => void;
}

function WorkflowStepCard({ step, stepNumber, onUpdate, onRemove, onToggle, onFocus, isFocused, previousSteps, stream, streamId, onExpandResults }: WorkflowStepCardProps) {
    const stepConfig = {
        source: { title: 'Source', icon: BeakerIcon, color: 'blue' },
        filter: { title: 'Filter', icon: FunnelIcon, color: 'purple' },
        categorize: { title: 'Categorize', icon: TagIcon, color: 'green' }
    };

    const config = stepConfig[step.type];
    const Icon = config.icon;

    return (
        <div
            className={`border rounded-lg overflow-hidden transition-colors ${
                isFocused
                    ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800'
                    : 'border-gray-300 dark:border-gray-600'
            }`}
            onClick={onFocus}
        >
            {/* Header */}
            <div className={`bg-${config.color}-50 dark:bg-${config.color}-900/20 border-b border-gray-300 dark:border-gray-600 p-3`}>
                <div className="flex items-center justify-between">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggle();
                        }}
                        className="flex items-center gap-2 flex-1 text-left"
                    >
                        {step.expanded ? (
                            <ChevronDownIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                        ) : (
                            <ChevronRightIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                        )}
                        <Icon className={`h-4 w-4 text-${config.color}-600 dark:text-${config.color}-400`} />
                        <div>
                            <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                                Step {stepNumber}: {config.title}
                            </h4>
                            {step.results && (
                                <p className="text-xs text-gray-600 dark:text-gray-400">
                                    {step.type === 'source' && step.results.total_count !== undefined && step.results.total_count !== step.results.count
                                        ? `${step.results.count} of ${step.results.total_count} articles`
                                        : `${step.results.count} articles`}
                                </p>
                            )}
                        </div>
                    </button>
                    {onRemove && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onRemove();
                            }}
                            className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                        >
                            <XMarkIcon className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Content */}
            {step.expanded && (
                <div className="p-4 bg-white dark:bg-gray-900">
                    {step.type === 'source' && (
                        <SourceStepContent step={step} onUpdate={onUpdate} stream={stream} streamId={streamId} onExpandResults={onExpandResults} />
                    )}
                    {step.type === 'filter' && (
                        <FilterStepContent step={step} onUpdate={onUpdate} previousSteps={previousSteps} streamId={streamId} stream={stream} onExpandResults={onExpandResults} />
                    )}
                    {step.type === 'categorize' && (
                        <CategorizeStepContent step={step} onUpdate={onUpdate} previousSteps={previousSteps} streamId={streamId} onExpandResults={onExpandResults} />
                    )}
                </div>
            )}
        </div>
    );
}

// ============================================================================
// Source Step
// ============================================================================

function SourceStepContent({ step, onUpdate, stream, streamId, onExpandResults }: { step: WorkflowStep; onUpdate: (updates: Partial<WorkflowStep>) => void; stream: ResearchStream; streamId: number; onExpandResults: () => void }) {
    const [isRunning, setIsRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const config = step.config;

    // Get broad queries from stream
    const broadQueries = stream.retrieval_config?.broad_search?.queries || [];

    const runQuery = async () => {
        setIsRunning(true);
        setError(null);

        try {
            if (config.sourceType === 'query') {
                // Run broad query
                const queryIndex = parseInt(config.selectedQuery);
                if (isNaN(queryIndex)) {
                    throw new Error('Invalid query selection');
                }

                const savedQuery = broadQueries[queryIndex];
                const savedExpression = savedQuery?.query_expression || '';
                const testExpression = config.testQueryExpression || savedExpression;
                const hasChanges = testExpression !== savedExpression;

                let response;
                if (hasChanges) {
                    // Test custom query expression (allows testing before saving)
                    response = await researchStreamApi.testCustomQuery({
                        query_expression: testExpression,
                        start_date: config.startDate,
                        end_date: config.endDate
                    });
                } else {
                    // Run saved query from stream
                    response = await researchStreamApi.runQuery({
                        stream_id: streamId,
                        query_index: queryIndex,
                        start_date: config.startDate,
                        end_date: config.endDate
                    });
                }

                onUpdate({
                    results: response
                });
                // Auto-expand results pane
                onExpandResults();
            } else if (config.sourceType === 'manual') {
                // Fetch manual PMIDs
                const pmids = config.manualIds
                    .split(/[\n,]/)
                    .map((id: string) => id.trim())
                    .filter((id: string) => id.length > 0);

                if (pmids.length === 0) {
                    throw new Error('No PMIDs provided');
                }

                const response = await researchStreamApi.fetchManualPMIDs({ pmids });

                onUpdate({
                    results: response
                });
                // Auto-expand results pane
                onExpandResults();
            }
        } catch (err) {
            console.error('Error running source:', err);
            setError(err instanceof Error ? err.message : 'Failed to run source');
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* Configuration */}
            <div className="space-y-3">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Source Type
                    </label>
                    <div className="flex gap-3">
                        <label className="flex items-center">
                            <input
                                type="radio"
                                name={`source-${step.id}`}
                                value="query"
                                checked={config.sourceType === 'query'}
                                onChange={(e) => onUpdate({ config: { ...config, sourceType: e.target.value } })}
                                className="mr-2"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">Run Query</span>
                        </label>
                        <label className="flex items-center">
                            <input
                                type="radio"
                                name={`source-${step.id}`}
                                value="manual"
                                checked={config.sourceType === 'manual'}
                                onChange={(e) => onUpdate({ config: { ...config, sourceType: e.target.value } })}
                                className="mr-2"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">Manual PMIDs</span>
                        </label>
                    </div>
                </div>

                {config.sourceType === 'query' && (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Select Broad Query
                            </label>
                            <select
                                value={config.selectedQuery}
                                onChange={(e) => onUpdate({ config: { ...config, selectedQuery: e.target.value } })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                            >
                                <option value="">Select a query...</option>
                                {broadQueries.map((query, index) => (
                                    <option key={index} value={index.toString()}>
                                        Broad Query {index + 1}: {query.label || query.query_expression?.substring(0, 50)}
                                    </option>
                                ))}
                            </select>
                            {broadQueries.length === 0 && (
                                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                    No broad queries configured in this stream
                                </p>
                            )}
                        </div>

                        {/* Query Expression Editor (when query selected) */}
                        {config.selectedQuery !== '' && (() => {
                            const queryIndex = parseInt(config.selectedQuery);
                            const savedQuery = broadQueries[queryIndex];
                            const savedExpression = savedQuery?.query_expression || '';
                            const testExpression = config.testQueryExpression || savedExpression;
                            const hasChanges = testExpression !== savedExpression;

                            return (
                                <div className="border border-gray-300 dark:border-gray-600 rounded-md p-3 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                            Query Expression
                                        </label>
                                        {hasChanges && (
                                            <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                </svg>
                                                Modified
                                            </span>
                                        )}
                                    </div>

                                    <textarea
                                        value={testExpression}
                                        onChange={(e) => onUpdate({ config: { ...config, testQueryExpression: e.target.value } })}
                                        placeholder="Enter PubMed query expression..."
                                        rows={3}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                                    />

                                    {hasChanges && (
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    try {
                                                        await researchStreamApi.updateBroadQuery(
                                                            streamId,
                                                            queryIndex,
                                                            testExpression
                                                        );
                                                        // Reset test expression to match saved
                                                        onUpdate({ config: { ...config, testQueryExpression: undefined } });
                                                        alert('Query updated successfully!');
                                                    } catch (err) {
                                                        alert('Failed to update query: ' + (err instanceof Error ? err.message : 'Unknown error'));
                                                    }
                                                }}
                                                className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-md font-medium"
                                                title="Save this modified query to the stream configuration"
                                            >
                                                💾 Save to Stream
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => onUpdate({ config: { ...config, testQueryExpression: savedExpression } })}
                                                className="px-3 py-1.5 text-sm bg-gray-600 hover:bg-gray-700 text-white rounded-md font-medium"
                                                title="Discard changes and revert to saved query"
                                            >
                                                ↶ Revert
                                            </button>
                                        </div>
                                    )}

                                    {!hasChanges && (
                                        <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                                            <CheckCircleIcon className="h-3 w-3" />
                                            Using saved query from stream
                                        </p>
                                    )}
                                </div>
                            );
                        })()}

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Start Date
                                </label>
                                <input
                                    type="date"
                                    value={config.startDate}
                                    onChange={(e) => onUpdate({ config: { ...config, startDate: e.target.value } })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    End Date
                                </label>
                                <input
                                    type="date"
                                    value={config.endDate}
                                    onChange={(e) => onUpdate({ config: { ...config, endDate: e.target.value } })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                />
                            </div>
                        </div>
                    </>
                )}

                {config.sourceType === 'manual' && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            PubMed IDs
                        </label>
                        <textarea
                            value={config.manualIds || ''}
                            onChange={(e) => onUpdate({ config: { ...config, manualIds: e.target.value } })}
                            placeholder="Enter PubMed IDs (one per line or comma-separated)&#10;38123456&#10;38123457"
                            rows={6}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                        />
                    </div>
                )}
            </div>

            {/* Error Display */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                    <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                </div>
            )}

            {/* Run Button */}
            <button
                type="button"
                onClick={runQuery}
                disabled={isRunning || (config.sourceType === 'query' && (!config.selectedQuery || !config.startDate || !config.endDate)) || (config.sourceType === 'manual' && !config.manualIds)}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md font-medium transition-colors ${
                    isRunning || (config.sourceType === 'query' && !config.selectedQuery)
                        ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
            >
                {isRunning ? (
                    <>
                        <ArrowPathIcon className="h-5 w-5 animate-spin" />
                        Running...
                    </>
                ) : (
                    <>
                        <PlayIcon className="h-5 w-5" />
                        Run Source
                    </>
                )}
            </button>

        </div>
    );
}

// ============================================================================
// Filter Step
// ============================================================================

function FilterStepContent({ step, onUpdate, previousSteps, streamId, stream, onExpandResults }: { step: WorkflowStep; onUpdate: (updates: Partial<WorkflowStep>) => void; previousSteps: WorkflowStep[]; streamId: number; stream: ResearchStream; onExpandResults: () => void }) {
    const [isRunning, setIsRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const config = step.config;

    const availableInputs = previousSteps.filter(s => s.results);

    const runFilter = async () => {
        setIsRunning(true);
        setError(null);

        try {
            // Get input articles from selected step
            const inputStep = previousSteps.find(s => s.id === config.inputStep);
            if (!inputStep || !inputStep.results) {
                throw new Error('No input articles selected');
            }

            // Get filter criteria - use current test value
            const sourceStep = previousSteps.find(s => s.type === 'source' && s.config.sourceType === 'query');
            let savedFilter: any = null;
            if (sourceStep && sourceStep.config.selectedQuery) {
                const queryIndex = parseInt(sourceStep.config.selectedQuery);
                const broadQueries = stream.retrieval_config?.broad_search?.queries || [];
                const query = broadQueries[queryIndex];
                savedFilter = query?.semantic_filter;
            }

            const testCriteria = config.criteria !== undefined ? config.criteria : (savedFilter?.criteria || '');
            const testThreshold = config.threshold !== undefined ? config.threshold : (savedFilter?.threshold || 0.7);

            if (!testCriteria || testCriteria.trim() === '') {
                throw new Error('Filter criteria is required');
            }

            const articles: CanonicalResearchArticle[] = inputStep.results.articles;

            const response = await researchStreamApi.filterArticles({
                articles,
                filter_criteria: testCriteria,
                threshold: testThreshold
            });

            onUpdate({
                results: response
            });
            // Auto-expand results pane
            onExpandResults();
        } catch (err) {
            console.error('Error running filter:', err);
            setError(err instanceof Error ? err.message : 'Failed to run filter');
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="space-y-3">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Input Source
                    </label>
                    <select
                        value={config.inputStep || ''}
                        onChange={(e) => onUpdate({ config: { ...config, inputStep: e.target.value } })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    >
                        <option value="">Select input...</option>
                        {availableInputs.map((s, idx) => (
                            <option key={s.id} value={s.id}>
                                Step {idx + 1} - {s.results.count} articles
                            </option>
                        ))}
                    </select>
                </div>

                {/* Filter Configuration with Diff Tracking */}
                {(() => {
                    // Try to determine which query this filter is associated with
                    // Look for a source step in previous steps
                    const sourceStep = previousSteps.find(s => s.type === 'source' && s.config.sourceType === 'query');
                    let savedFilter: any = null;
                    let queryIndex = -1;

                    if (sourceStep && sourceStep.config.selectedQuery) {
                        queryIndex = parseInt(sourceStep.config.selectedQuery);
                        const broadQueries = stream.retrieval_config?.broad_search?.queries || [];
                        const query = broadQueries[queryIndex];
                        savedFilter = query?.semantic_filter;
                    }

                    const testCriteria = config.criteria !== undefined ? config.criteria : (savedFilter?.criteria || '');
                    const testThreshold = config.threshold !== undefined ? config.threshold : (savedFilter?.threshold || 0.7);
                    const testEnabled = config.enabled !== undefined ? config.enabled : (savedFilter?.enabled ?? true);

                    const hasChanges = savedFilter && (
                        testCriteria !== savedFilter.criteria ||
                        testThreshold !== savedFilter.threshold ||
                        testEnabled !== savedFilter.enabled
                    );

                    return (
                        <div className="border border-gray-300 dark:border-gray-600 rounded-md p-3 space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Filter Configuration
                                </label>
                                {hasChanges && (
                                    <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                        Modified
                                    </span>
                                )}
                            </div>

                            <div>
                                <label className="flex items-center mb-2">
                                    <input
                                        type="checkbox"
                                        checked={testEnabled}
                                        onChange={(e) => onUpdate({ config: { ...config, enabled: e.target.checked } })}
                                        className="mr-2"
                                    />
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Enable Semantic Filter
                                    </span>
                                </label>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Filter Criteria
                                </label>
                                <textarea
                                    value={testCriteria}
                                    onChange={(e) => onUpdate({ config: { ...config, criteria: e.target.value } })}
                                    placeholder="Describe what should pass/fail..."
                                    rows={3}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Threshold: {testThreshold.toFixed(2)}
                                </label>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={testThreshold}
                                    onChange={(e) => onUpdate({ config: { ...config, threshold: parseFloat(e.target.value) } })}
                                    className="w-full"
                                />
                            </div>

                            {hasChanges && queryIndex >= 0 && (
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            try {
                                                await researchStreamApi.updateSemanticFilter(
                                                    streamId,
                                                    queryIndex,
                                                    {
                                                        enabled: testEnabled,
                                                        criteria: testCriteria,
                                                        threshold: testThreshold
                                                    }
                                                );
                                                // Reset to match saved
                                                onUpdate({ config: { ...config, enabled: undefined, criteria: undefined, threshold: undefined } });
                                                alert('Filter updated successfully!');
                                            } catch (err) {
                                                alert('Failed to update filter: ' + (err instanceof Error ? err.message : 'Unknown error'));
                                            }
                                        }}
                                        className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-md font-medium"
                                    >
                                        Update Stream
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onUpdate({ config: { ...config, enabled: savedFilter.enabled, criteria: savedFilter.criteria, threshold: savedFilter.threshold } })}
                                        className="px-3 py-1.5 text-sm bg-gray-600 hover:bg-gray-700 text-white rounded-md font-medium"
                                    >
                                        Revert
                                    </button>
                                </div>
                            )}

                            {!hasChanges && savedFilter && (
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Matches saved filter configuration
                                </p>
                            )}
                        </div>
                    );
                })()}
            </div>

            {/* Error Display */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                    <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                </div>
            )}

            {(() => {
                const sourceStep = previousSteps.find(s => s.type === 'source' && s.config.sourceType === 'query');
                let savedFilter: any = null;
                if (sourceStep && sourceStep.config.selectedQuery) {
                    const queryIndex = parseInt(sourceStep.config.selectedQuery);
                    const broadQueries = stream.retrieval_config?.broad_search?.queries || [];
                    const query = broadQueries[queryIndex];
                    savedFilter = query?.semantic_filter;
                }
                const testCriteria = config.criteria !== undefined ? config.criteria : (savedFilter?.criteria || '');
                const hasValidCriteria = testCriteria && testCriteria.trim() !== '';

                return (
                    <button
                        type="button"
                        onClick={runFilter}
                        disabled={isRunning || !config.inputStep || !hasValidCriteria}
                        className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md font-medium transition-colors ${
                            isRunning || !config.inputStep || !hasValidCriteria
                                ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                                : 'bg-purple-600 hover:bg-purple-700 text-white'
                        }`}
                    >
                {isRunning ? (
                    <>
                        <ArrowPathIcon className="h-5 w-5 animate-spin" />
                        Running...
                    </>
                ) : (
                    <>
                        <PlayIcon className="h-5 w-5" />
                        Run Filter
                    </>
                )}
            </button>

        </div>
    );
}

// ============================================================================
// Categorize Step
// ============================================================================

function CategorizeStepContent({ step, onUpdate, previousSteps, streamId, onExpandResults }: { step: WorkflowStep; onUpdate: (updates: Partial<WorkflowStep>) => void; previousSteps: WorkflowStep[]; streamId: number; onExpandResults: () => void }) {
    const [isRunning, setIsRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const config = step.config;

    const availableInputs = previousSteps.filter(s => s.results);

    const runCategorize = async () => {
        setIsRunning(true);
        setError(null);

        try {
            // Get input articles from selected step
            const inputStep = previousSteps.find(s => s.id === config.inputStep);
            if (!inputStep || !inputStep.results) {
                throw new Error('No input articles selected');
            }

            const articles: CanonicalResearchArticle[] = inputStep.results.articles;

            const response = await researchStreamApi.categorizeArticles({
                stream_id: streamId,
                articles
            });

            onUpdate({
                results: response
            });
            // Auto-expand results pane
            onExpandResults();
        } catch (err) {
            console.error('Error running categorization:', err);
            setError(err instanceof Error ? err.message : 'Failed to run categorization');
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Input Source
                </label>
                <select
                    value={config.inputStep || ''}
                    onChange={(e) => onUpdate({ config: { ...config, inputStep: e.target.value } })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                >
                    <option value="">Select input...</option>
                    {availableInputs.map((s, idx) => (
                        <option key={s.id} value={s.id}>
                            Step {idx + 1} - {s.results.count} articles
                        </option>
                    ))}
                </select>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Using categories from Layer 3 configuration
                </p>
            </div>

            {/* Error Display */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                    <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                </div>
            )}

            <button
                type="button"
                onClick={runCategorize}
                disabled={isRunning || !config.inputStep}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md font-medium transition-colors ${
                    isRunning || !config.inputStep
                        ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                        : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
            >
                {isRunning ? (
                    <>
                        <ArrowPathIcon className="h-5 w-5 animate-spin" />
                        Running...
                    </>
                ) : (
                    <>
                        <PlayIcon className="h-5 w-5" />
                        Run Categorize
                    </>
                )}
            </button>

        </div>
    );
}

// ============================================================================
// Results Pane (Right Side)
// ============================================================================

interface ResultsPaneProps {
    step: WorkflowStep | undefined;
    stepNumber: number;
    view: ResultView;
    onViewChange: (view: ResultView) => void;
    onCollapse: () => void;
}

function ResultsPane({ step, stepNumber, view, onViewChange, onCollapse }: ResultsPaneProps) {
    const [compareIds, setCompareIds] = useState('');

    if (!step) {
        return (
            <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-8 bg-gray-50 dark:bg-gray-900">
                <div className="text-center text-gray-500 dark:text-gray-400">
                    <DocumentTextIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No step selected</p>
                </div>
            </div>
        );
    }

    return (
        <div className="border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 flex flex-col" style={{ height: 'calc(100vh - 320px)', minHeight: '500px' }}>
            {/* Header */}
            <div className="border-b border-gray-300 dark:border-gray-600 p-4">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-gray-900 dark:text-white">
                        Step {stepNumber} Results
                    </h3>
                    <div className="flex items-center gap-3">
                        {step.results && (
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                                {step.type === 'source' && step.results.total_count !== undefined && step.results.total_count !== step.results.count
                                    ? `${step.results.count} of ${step.results.total_count} articles`
                                    : `${step.results.count} articles`}
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={onCollapse}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                            title="Collapse results pane"
                        >
                            <ChevronRightIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                        </button>
                    </div>
                </div>

                {/* View Mode Tabs */}
                {step.results && (
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => onViewChange('raw')}
                            className={`px-3 py-1 text-sm rounded ${
                                view === 'raw'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                            }`}
                        >
                            Raw
                        </button>
                        <button
                            type="button"
                            onClick={() => onViewChange('compare')}
                            className={`px-3 py-1 text-sm rounded ${
                                view === 'compare'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                            }`}
                        >
                            Compare
                        </button>
                        <button
                            type="button"
                            onClick={() => onViewChange('analyze')}
                            className={`px-3 py-1 text-sm rounded ${
                                view === 'analyze'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                            }`}
                        >
                            Analyze
                        </button>
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
                {!step.results ? (
                    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                        <DocumentTextIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>Run this step to see results</p>
                    </div>
                ) : view === 'raw' ? (
                    <RawResultsView step={step} />
                ) : view === 'compare' ? (
                    <CompareResultsView step={step} compareIds={compareIds} onCompareIdsChange={setCompareIds} />
                ) : (
                    <AnalyzeResultsView step={step} />
                )}
            </div>
        </div>
    );
}

// Raw Results View
function RawResultsView({ step }: { step: WorkflowStep }) {
    if (step.type === 'categorize') {
        // CategorizeResponse: { results: CategoryAssignment[], count, category_distribution }
        const categoryDist = step.results.category_distribution || {};
        const categoryCount = Object.keys(categoryDist).length;

        return (
            <div className="space-y-3">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    {step.results.count} articles across {categoryCount} categories
                </p>
                {Object.entries(categoryDist).map(([categoryId, count]: [string, any]) => (
                    <div key={categoryId} className="border border-gray-200 dark:border-gray-700 rounded p-3">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <TagIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                                <span className="font-medium text-gray-900 dark:text-white">{categoryId}</span>
                            </div>
                            <span className="text-sm text-gray-600 dark:text-gray-400">{count} articles</span>
                        </div>
                        <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div
                                className="bg-green-500 h-2 rounded-full"
                                style={{ width: `${(count / step.results.count) * 100}%` }}
                            />
                        </div>
                    </div>
                ))}

                {/* Show articles with their categories */}
                <div className="mt-6 space-y-2">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Articles</h4>
                    {step.results.results?.slice(0, 10).map((result: any, idx: number) => (
                        <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded p-3 text-sm">
                            <p className="font-mono text-xs text-gray-500 dark:text-gray-400 mb-1">
                                PMID: {result.article.pmid || result.article.id}
                            </p>
                            <p className="text-gray-900 dark:text-white mb-2">{result.article.title}</p>
                            <div className="flex gap-1 flex-wrap">
                                {result.assigned_categories.map((catId: string) => (
                                    <span key={catId} className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 text-xs rounded">
                                        {catId}
                                    </span>
                                ))}
                            </div>
                        </div>
                    ))}
                    {step.results.results && step.results.results.length > 10 && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
                            Showing 10 of {step.results.results.length} articles
                        </p>
                    )}
                </div>
            </div>
        );
    }

    if (step.type === 'filter') {
        // FilterResponse: { results: FilterResult[], count, passed, failed }
        return (
            <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                    <div className="bg-gray-50 dark:bg-gray-800 rounded p-3 text-center">
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{step.results.count}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">Total</p>
                    </div>
                    <div className="bg-green-50 dark:bg-green-900/20 rounded p-3 text-center">
                        <p className="text-2xl font-bold text-green-600 dark:text-green-400">{step.results.passed}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">Passed</p>
                    </div>
                    <div className="bg-red-50 dark:bg-red-900/20 rounded p-3 text-center">
                        <p className="text-2xl font-bold text-red-600 dark:text-red-400">{step.results.failed}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">Failed</p>
                    </div>
                </div>

                <div className="space-y-2">
                    {step.results.results?.slice(0, 20).map((result: any, idx: number) => (
                        <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded p-3 text-sm">
                            <div className="flex items-center gap-2 mb-1">
                                {result.passed ? (
                                    <CheckCircleIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
                                ) : (
                                    <XCircleIcon className="h-4 w-4 text-red-600 dark:text-red-400" />
                                )}
                                <p className="font-mono text-xs text-gray-500 dark:text-gray-400">
                                    PMID: {result.article.pmid || result.article.id}
                                </p>
                                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                    Score: {result.score.toFixed(2)}
                                </span>
                            </div>
                            <p className="text-gray-900 dark:text-white mb-1">{result.article.title}</p>
                            <p className="text-xs text-gray-600 dark:text-gray-400 italic">{result.reasoning}</p>
                        </div>
                    ))}
                    {step.results.results && step.results.results.length > 20 && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
                            Showing 20 of {step.results.results.length} articles
                        </p>
                    )}
                </div>
            </div>
        );
    }

    // Source step - SourceResponse: { articles: CanonicalResearchArticle[], count, metadata }
    return (
        <div className="space-y-2">
            {step.results.articles?.slice(0, 20).map((article: any, idx: number) => (
                <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded p-3 text-sm">
                    <p className="font-mono text-xs text-gray-500 dark:text-gray-400 mb-1">
                        PMID: {article.pmid || article.id}
                    </p>
                    <p className="text-gray-900 dark:text-white">{article.title}</p>
                    {article.abstract && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 line-clamp-2">
                            {article.abstract}
                        </p>
                    )}
                </div>
            ))}
            {step.results.articles && step.results.articles.length > 20 && (
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
                    Showing 20 of {step.results.articles.length} articles
                </p>
            )}
        </div>
    );
}

// Compare Results View
function CompareResultsView({ step, compareIds, onCompareIdsChange }: { step: WorkflowStep; compareIds: string; onCompareIdsChange: (ids: string) => void }) {
    const [comparisonResult, setComparisonResult] = useState<any>(null);
    const [isComparing, setIsComparing] = useState(false);

    const runComparison = async () => {
        setIsComparing(true);
        try {
            // Parse expected PMIDs from textarea
            const expectedPmids = compareIds
                .split(/[\n,]/)
                .map(id => id.trim())
                .filter(id => id.length > 0);

            // Get retrieved PMIDs from step results
            let retrievedPmids: string[] = [];
            if (step.type === 'source') {
                retrievedPmids = step.results.articles
                    .map((a: any) => a.pmid || a.id)
                    .filter((id: string) => id);
            } else if (step.type === 'filter') {
                retrievedPmids = step.results.results
                    .map((r: any) => r.article.pmid || r.article.id)
                    .filter((id: string) => id);
            } else if (step.type === 'categorize') {
                retrievedPmids = step.results.results
                    .map((r: any) => r.article.pmid || r.article.id)
                    .filter((id: string) => id);
            }

            const result = await researchStreamApi.comparePMIDs({
                retrieved_pmids: retrievedPmids,
                expected_pmids: expectedPmids
            });

            setComparisonResult(result);
        } catch (error) {
            console.error('Comparison failed:', error);
        } finally {
            setIsComparing(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded p-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Expected PMIDs (one per line or comma-separated)
                </label>
                <textarea
                    value={compareIds}
                    onChange={(e) => onCompareIdsChange(e.target.value)}
                    placeholder="38123456&#10;38123457&#10;38123458"
                    rows={6}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                />
                <button
                    type="button"
                    onClick={runComparison}
                    disabled={isComparing || !compareIds.trim()}
                    className={`mt-3 px-4 py-2 text-sm rounded ${
                        isComparing || !compareIds.trim()
                            ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
                            : 'bg-yellow-600 text-white hover:bg-yellow-700'
                    }`}
                >
                    {isComparing ? 'Comparing...' : 'Run Comparison'}
                </button>
            </div>

            {comparisonResult && (
                <div className="space-y-4">
                    {/* Metrics Summary */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-3 text-center">
                            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                                {(comparisonResult.recall * 100).toFixed(1)}%
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">Recall</p>
                        </div>
                        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded p-3 text-center">
                            <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                                {(comparisonResult.precision * 100).toFixed(1)}%
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">Precision</p>
                        </div>
                        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-3 text-center">
                            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                                {(comparisonResult.f1_score * 100).toFixed(1)}%
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">F1 Score</p>
                        </div>
                    </div>

                    {/* Details */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="border border-gray-200 dark:border-gray-700 rounded p-3">
                            <div className="flex items-center gap-2 mb-2">
                                <CheckCircleIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
                                <span className="text-sm font-medium text-gray-900 dark:text-white">
                                    Matched ({comparisonResult.matched_count})
                                </span>
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-400 max-h-32 overflow-y-auto font-mono">
                                {comparisonResult.matched.join(', ') || 'None'}
                            </div>
                        </div>
                        <div className="border border-gray-200 dark:border-gray-700 rounded p-3">
                            <div className="flex items-center gap-2 mb-2">
                                <XCircleIcon className="h-4 w-4 text-red-600 dark:text-red-400" />
                                <span className="text-sm font-medium text-gray-900 dark:text-white">
                                    Missed ({comparisonResult.missed_count})
                                </span>
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-400 max-h-32 overflow-y-auto font-mono">
                                {comparisonResult.missed.join(', ') || 'None'}
                            </div>
                        </div>
                        <div className="border border-gray-200 dark:border-gray-700 rounded p-3">
                            <div className="flex items-center gap-2 mb-2">
                                <PlusIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                <span className="text-sm font-medium text-gray-900 dark:text-white">
                                    Extra ({comparisonResult.extra_count})
                                </span>
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-400 max-h-32 overflow-y-auto font-mono">
                                {comparisonResult.extra.join(', ') || 'None'}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Analyze Results View
function AnalyzeResultsView({ step }: { step: WorkflowStep }) {
    return (
        <div className="space-y-4">
            <div className="border border-gray-200 dark:border-gray-700 rounded p-4">
                <h4 className="font-medium text-gray-900 dark:text-white mb-2">Analysis</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    Statistical analysis and visualizations will appear here
                </p>
            </div>
        </div>
    );
}
