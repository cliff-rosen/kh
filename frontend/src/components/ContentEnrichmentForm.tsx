/**
 * Content Enrichment Form - Prompt Workbench UI
 *
 * Allows users to customize prompts for report summaries:
 * - Executive Summary prompt
 * - Category Summary prompt
 *
 * Features:
 * - Collapsible slug reference panel (left)
 * - Prompt editors (center)
 * - Three-mode results pane: collapsed, side panel, full modal
 * - Test with sample data or existing reports
 */

import { useState, useEffect, useCallback } from 'react';
import {
    DocumentTextIcon,
    BeakerIcon,
    ArrowPathIcon,
    CheckIcon,
    ExclamationTriangleIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    ChevronDownIcon,
    ClipboardDocumentIcon,
    SparklesIcon,
    ArrowsPointingOutIcon,
    ArrowsPointingInIcon,
    XMarkIcon
} from '@heroicons/react/24/outline';
import {
    promptWorkbenchApi,
    PromptTemplate,
    SlugInfo,
    EnrichmentConfig,
    TestPromptResponse
} from '../lib/api/promptWorkbenchApi';
import { reportApi } from '../lib/api/reportApi';
import { Report } from '../types';

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

interface ContentEnrichmentFormProps {
    streamId: number;
    onSave?: () => void;
    appliedSuggestions?: AppliedPromptSuggestions | null;
    onSuggestionsApplied?: () => void;
}

type PromptType = 'executive_summary' | 'category_summary';
type ResultsPaneMode = 'collapsed' | 'side' | 'full';

interface HistoryEntry {
    id: number;
    timestamp: Date;
    promptType: PromptType;
    prompts: PromptTemplate;
    dataSource: { type: 'report'; reportId: number; categoryId?: string } | { type: 'paste' };
    result: TestPromptResponse;
}

export default function ContentEnrichmentForm({
    streamId,
    onSave,
    appliedSuggestions,
    onSuggestionsApplied
}: ContentEnrichmentFormProps) {
    // State for prompts
    const [activePromptType, setActivePromptType] = useState<PromptType>('executive_summary');
    const [prompts, setPrompts] = useState<Record<string, PromptTemplate>>({});
    const [defaults, setDefaults] = useState<Record<string, PromptTemplate>>({});
    const [availableSlugs, setAvailableSlugs] = useState<Record<string, SlugInfo[]>>({});
    const [isUsingDefaults, setIsUsingDefaults] = useState(true);
    const [hasChanges, setHasChanges] = useState(false);

    // State for testing
    const [testMode, setTestMode] = useState<'report' | 'paste'>('report');
    const [reports, setReports] = useState<Report[]>([]);
    const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
    const [pastedData, setPastedData] = useState('');
    const [isTesting, setIsTesting] = useState(false);

    // History state for time travel
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [historyIndex, setHistoryIndex] = useState<number>(-1); // -1 means no history yet
    const [nextHistoryId, setNextHistoryId] = useState(1);

    // UI state
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [slugsPaneCollapsed, setSlugsPaneCollapsed] = useState(false);
    const [resultsPaneMode, setResultsPaneMode] = useState<ResultsPaneMode>('collapsed');
    const [showRenderedPrompts, setShowRenderedPrompts] = useState(false);

    // Load initial data
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            setError(null);
            try {
                // Load defaults and slugs
                const defaultsResponse = await promptWorkbenchApi.getDefaults();
                setDefaults(defaultsResponse.prompts);
                setAvailableSlugs(defaultsResponse.available_slugs);

                // Load stream's enrichment config
                const configResponse = await promptWorkbenchApi.getStreamEnrichmentConfig(streamId);
                setIsUsingDefaults(configResponse.is_using_defaults);

                if (configResponse.enrichment_config?.prompts) {
                    // Merge with defaults for any missing prompt types
                    setPrompts({
                        ...defaultsResponse.prompts,
                        ...configResponse.enrichment_config.prompts
                    });
                } else {
                    setPrompts(defaultsResponse.prompts);
                }

                // Load reports for testing
                const streamReports = await reportApi.getReportsForStream(streamId);
                setReports(streamReports);
                if (streamReports.length > 0) {
                    setSelectedReportId(streamReports[0].report_id);
                }
            } catch (err: any) {
                console.error('Error loading enrichment config:', err);
                setError(err.message || 'Failed to load configuration');
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [streamId]);

    // Apply suggestions from chat when received
    useEffect(() => {
        if (appliedSuggestions && appliedSuggestions.suggestions.length > 0) {
            const promptType = appliedSuggestions.prompt_type;

            // Switch to the relevant prompt type tab
            setActivePromptType(promptType);

            // Apply each suggestion
            setPrompts(prev => {
                const updated = { ...prev };
                const currentPrompt = { ...prev[promptType] };

                for (const suggestion of appliedSuggestions.suggestions) {
                    if (suggestion.target === 'system_prompt') {
                        currentPrompt.system_prompt = suggestion.suggested_text;
                    } else if (suggestion.target === 'user_prompt_template') {
                        currentPrompt.user_prompt_template = suggestion.suggested_text;
                    }
                }

                updated[promptType] = currentPrompt;
                return updated;
            });

            setHasChanges(true);
            setIsUsingDefaults(false);

            // Notify parent that suggestions have been applied
            if (onSuggestionsApplied) {
                onSuggestionsApplied();
            }
        }
    }, [appliedSuggestions, onSuggestionsApplied]);

    // Track changes
    const updatePrompt = useCallback((type: PromptType, field: 'system_prompt' | 'user_prompt_template', value: string) => {
        setPrompts(prev => ({
            ...prev,
            [type]: {
                ...prev[type],
                [field]: value
            }
        }));
        setHasChanges(true);
        setIsUsingDefaults(false);
    }, []);

    // Reset to defaults
    const resetToDefaults = useCallback(() => {
        setPrompts(defaults);
        setIsUsingDefaults(true);
        setHasChanges(true);
    }, [defaults]);

    // Save changes
    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            const config: EnrichmentConfig | null = isUsingDefaults ? null : { prompts };
            await promptWorkbenchApi.updateStreamEnrichmentConfig(streamId, config);
            setHasChanges(false);
            onSave?.();
        } catch (err: any) {
            console.error('Error saving enrichment config:', err);
            setError(err.message || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    // Test prompt
    const handleTest = async () => {
        if (!prompts[activePromptType]) return;

        setIsTesting(true);
        setError(null);

        try {
            const request: any = {
                prompt_type: activePromptType,
                prompt: prompts[activePromptType]
            };

            let dataSource: HistoryEntry['dataSource'];

            if (testMode === 'report' && selectedReportId) {
                request.report_id = selectedReportId;
                dataSource = { type: 'report', reportId: selectedReportId };
                if (activePromptType === 'category_summary' && selectedCategoryId) {
                    request.category_id = selectedCategoryId;
                    dataSource.categoryId = selectedCategoryId;
                }
            } else if (testMode === 'paste' && pastedData) {
                try {
                    request.sample_data = JSON.parse(pastedData);
                    dataSource = { type: 'paste' };
                } catch {
                    setError('Invalid JSON in sample data');
                    setIsTesting(false);
                    return;
                }
            } else {
                setError('Please select a report or paste sample data');
                setIsTesting(false);
                return;
            }

            const result = await promptWorkbenchApi.testPrompt(request);

            // Add to history
            const newEntry: HistoryEntry = {
                id: nextHistoryId,
                timestamp: new Date(),
                promptType: activePromptType,
                prompts: { ...prompts[activePromptType] },
                dataSource,
                result
            };

            setHistory(prev => [...prev, newEntry]);
            setHistoryIndex(history.length); // Point to the new entry
            setNextHistoryId(prev => prev + 1);

            // Auto-expand to side panel when results arrive
            setResultsPaneMode('side');
            // Default to hiding rendered prompts so user sees LLM response first
            setShowRenderedPrompts(false);
        } catch (err: any) {
            console.error('Error testing prompt:', err);
            setError(err.message || 'Failed to test prompt');
        } finally {
            setIsTesting(false);
        }
    };

    // Copy to clipboard
    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    // History navigation
    const currentHistoryEntry = historyIndex >= 0 && historyIndex < history.length
        ? history[historyIndex]
        : null;

    const canNavigatePrev = historyIndex > 0;
    const canNavigateNext = historyIndex < history.length - 1;

    const navigatePrev = () => {
        if (canNavigatePrev) {
            setHistoryIndex(prev => prev - 1);
        }
    };

    const navigateNext = () => {
        if (canNavigateNext) {
            setHistoryIndex(prev => prev + 1);
        }
    };

    const isViewingLatest = historyIndex === history.length - 1;

    // Restore prompts from a history entry
    const restorePromptsFromHistory = (entry: HistoryEntry) => {
        setPrompts(prev => ({
            ...prev,
            [entry.promptType]: { ...entry.prompts }
        }));
        setActivePromptType(entry.promptType);
        setHasChanges(true);
        setIsUsingDefaults(false);
    };

    // Format timestamp for display
    const formatTimestamp = (date: Date) => {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    const currentPrompt = prompts[activePromptType];
    const currentSlugs = availableSlugs[activePromptType] || [];

    // Results panel content (shared between side and full modes)
    const ResultsContent = ({ isFullMode = false }: { isFullMode?: boolean }) => {
        const entry = currentHistoryEntry;
        const testResult = entry?.result;

        return (
            <div className={`space-y-4 ${isFullMode ? 'max-w-4xl mx-auto' : ''}`}>
                {!entry ? (
                    <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                        <BeakerIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p className="text-sm">Run a test to see results</p>
                    </div>
                ) : (
                    <>
                        {/* Entry metadata */}
                        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 pb-2 border-b border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-2">
                                <span className="font-medium">{formatTimestamp(entry.timestamp)}</span>
                                <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">
                                    {entry.promptType === 'executive_summary' ? 'Executive' : 'Category'}
                                </span>
                                {entry.dataSource.type === 'report' && (
                                    <span className="text-gray-400">
                                        Report #{entry.dataSource.reportId}
                                        {entry.dataSource.categoryId && ` → ${entry.dataSource.categoryId}`}
                                    </span>
                                )}
                            </div>
                            {!isViewingLatest && (
                                <button
                                    type="button"
                                    onClick={() => restorePromptsFromHistory(entry)}
                                    className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                                >
                                    Restore Prompts
                                </button>
                            )}
                        </div>

                        {/* Rendered Prompts (collapsible) */}
                        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                            <button
                                type="button"
                                onClick={() => setShowRenderedPrompts(!showRenderedPrompts)}
                                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 flex items-center justify-between text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Rendered Prompts
                                </span>
                                <ChevronDownIcon className={`h-4 w-4 text-gray-500 transition-transform ${showRenderedPrompts ? 'rotate-180' : ''}`} />
                            </button>
                            {showRenderedPrompts && testResult && (
                                <div className="p-4 space-y-4 border-t border-gray-200 dark:border-gray-700">
                                    {/* System Prompt */}
                                    <div>
                                        <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">
                                            System Prompt
                                        </h5>
                                        <div className={`bg-gray-50 dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700 overflow-y-auto resize-y ${isFullMode ? 'min-h-[200px] max-h-[50vh]' : 'min-h-[120px] max-h-[300px]'}`}>
                                            <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">
                                                {testResult.rendered_system_prompt}
                                            </pre>
                                        </div>
                                    </div>

                                    {/* User Prompt */}
                                    <div>
                                        <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">
                                            User Prompt
                                        </h5>
                                        <div className={`bg-gray-50 dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700 overflow-y-auto resize-y ${isFullMode ? 'min-h-[200px] max-h-[50vh]' : 'min-h-[120px] max-h-[300px]'}`}>
                                            <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">
                                                {testResult.rendered_user_prompt}
                                            </pre>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* LLM Response */}
                        {testResult?.llm_response && (
                            <div className="flex flex-col">
                                <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">
                                    LLM Response
                                </h5>
                                <div className={`bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800 overflow-y-auto resize-y ${isFullMode ? 'min-h-[300px] flex-1' : 'min-h-[200px]'}`}>
                                    <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                                        {testResult.llm_response}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Error */}
                        {testResult?.error && (
                            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 border border-red-200 dark:border-red-800">
                                <p className="text-sm text-red-800 dark:text-red-200">
                                    Error: {testResult.error}
                                </p>
                            </div>
                        )}
                    </>
                )}
            </div>
        );
    };

    return (
        <>
            <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <SparklesIcon className="h-5 w-5 text-purple-500" />
                            Content Enrichment
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Customize prompts for report summaries
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {isUsingDefaults && (
                            <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                                <CheckIcon className="h-4 w-4" />
                                Using defaults
                            </span>
                        )}
                        {hasChanges && (
                            <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                <ExclamationTriangleIcon className="h-4 w-4" />
                                Unsaved changes
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={resetToDefaults}
                            disabled={isUsingDefaults}
                            className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Reset to Defaults
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={!hasChanges || saving}
                            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {saving ? (
                                <>
                                    <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                'Save Changes'
                            )}
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-800 dark:text-red-200 text-sm">
                        {error}
                    </div>
                )}

                {/* Prompt Type Tabs */}
                <div className="border-b border-gray-200 dark:border-gray-700">
                    <nav className="-mb-px flex space-x-8">
                        <button
                            type="button"
                            onClick={() => setActivePromptType('executive_summary')}
                            className={`py-3 px-1 border-b-2 text-sm font-medium ${
                                activePromptType === 'executive_summary'
                                    ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
                            }`}
                        >
                            Executive Summary
                        </button>
                        <button
                            type="button"
                            onClick={() => setActivePromptType('category_summary')}
                            className={`py-3 px-1 border-b-2 text-sm font-medium ${
                                activePromptType === 'category_summary'
                                    ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
                            }`}
                        >
                            Category Summary
                        </button>
                    </nav>
                </div>

                {/* Three-Panel Layout */}
                <div className="flex gap-4">
                    {/* Left: Slugs Panel (collapsible) */}
                    {slugsPaneCollapsed ? (
                        <div className="flex items-start">
                            <button
                                type="button"
                                onClick={() => setSlugsPaneCollapsed(false)}
                                className="flex items-center justify-center w-8 h-12 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-r-lg border border-gray-300 dark:border-gray-600 transition-colors"
                                title="Expand slugs pane"
                            >
                                <ChevronRightIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                            </button>
                        </div>
                    ) : (
                        <div className="w-64 flex-shrink-0">
                            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 h-full">
                                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Available Slugs
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setSlugsPaneCollapsed(true)}
                                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                                        title="Collapse slugs pane"
                                    >
                                        <ChevronLeftIcon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                                    </button>
                                </div>
                                <div className="p-3 space-y-2 max-h-[500px] overflow-y-auto">
                                    {currentSlugs.map((slug) => (
                                        <div
                                            key={slug.slug}
                                            className="group flex flex-col gap-1 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                                            onClick={() => copyToClipboard(slug.slug)}
                                        >
                                            <div className="flex items-center justify-between">
                                                <code className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 px-1.5 py-0.5 rounded font-mono">
                                                    {slug.slug}
                                                </code>
                                                <ClipboardDocumentIcon className="h-4 w-4 text-gray-400 opacity-0 group-hover:opacity-100" />
                                            </div>
                                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                                {slug.description}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Center: Prompt Editors */}
                    <div className="flex-1 space-y-4 min-w-0">
                        {/* System Prompt */}
                        <div className="flex flex-col">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                System Prompt
                            </label>
                            <textarea
                                value={currentPrompt?.system_prompt || ''}
                                onChange={(e) => updatePrompt(activePromptType, 'system_prompt', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-mono resize-y focus:ring-2 focus:ring-purple-500 focus:border-transparent min-h-[150px]"
                                placeholder="Define the LLM's role and guidelines..."
                            />
                        </div>

                        {/* User Prompt Template */}
                        <div className="flex flex-col flex-1">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                User Prompt Template
                                <span className="text-gray-400 font-normal ml-2">(Use slugs like {'{stream.purpose}'})</span>
                            </label>
                            <textarea
                                value={currentPrompt?.user_prompt_template || ''}
                                onChange={(e) => updatePrompt(activePromptType, 'user_prompt_template', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-mono resize-y focus:ring-2 focus:ring-purple-500 focus:border-transparent min-h-[250px]"
                                placeholder="Write the prompt template with slugs..."
                            />
                        </div>

                        {/* Testing Section */}
                        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="text-md font-medium text-gray-900 dark:text-white flex items-center gap-2">
                                    <BeakerIcon className="h-5 w-5 text-blue-500" />
                                    Test Prompt
                                </h4>
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2">
                                        <label className="text-sm text-gray-600 dark:text-gray-400">Data source:</label>
                                        <select
                                            value={testMode}
                                            onChange={(e) => setTestMode(e.target.value as 'report' | 'paste')}
                                            className="px-3 py-1.5 text-sm text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
                                        >
                                            <option value="report">From Report</option>
                                            <option value="paste">Paste JSON</option>
                                        </select>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleTest}
                                        disabled={isTesting}
                                        className="px-4 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {isTesting ? (
                                            <>
                                                <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                                Testing...
                                            </>
                                        ) : (
                                            <>
                                                <BeakerIcon className="h-4 w-4" />
                                                Run Test
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Test Data Input */}
                            <div>
                                {testMode === 'report' ? (
                                    <div className="flex items-center gap-4">
                                        <div>
                                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Report</label>
                                            <select
                                                value={selectedReportId || ''}
                                                onChange={(e) => setSelectedReportId(Number(e.target.value))}
                                                className="px-3 py-2 text-sm text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 min-w-48"
                                            >
                                                {reports.map(report => (
                                                    <option key={report.report_id} value={report.report_id}>
                                                        {report.report_name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        {activePromptType === 'category_summary' && (
                                            <div>
                                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Category ID</label>
                                                <input
                                                    type="text"
                                                    value={selectedCategoryId}
                                                    onChange={(e) => setSelectedCategoryId(e.target.value)}
                                                    placeholder="e.g., clinical_outcomes"
                                                    className="px-3 py-2 text-sm text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 min-w-48 placeholder-gray-400 dark:placeholder-gray-500"
                                                />
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div>
                                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Sample Data (JSON)</label>
                                        <textarea
                                            value={pastedData}
                                            onChange={(e) => setPastedData(e.target.value)}
                                            rows={4}
                                            placeholder='{"stream": {"name": "...", "purpose": "..."}, "articles": {"count": "10", "formatted": "..."}}'
                                            className="w-full px-3 py-2 text-sm text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 font-mono placeholder-gray-400 dark:placeholder-gray-500"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right: Results Panel (three modes) */}
                    {resultsPaneMode === 'collapsed' ? (
                        <div className="flex items-start">
                            <button
                                type="button"
                                onClick={() => setResultsPaneMode('side')}
                                className="flex items-center justify-center w-8 h-12 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-l-lg border border-gray-300 dark:border-gray-600 transition-colors"
                                title="Expand results pane"
                            >
                                <ChevronLeftIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                            </button>
                        </div>
                    ) : resultsPaneMode === 'side' ? (
                        <div className="w-96 flex-shrink-0 h-[600px]">
                            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 h-full flex flex-col">
                                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <DocumentTextIcon className="h-4 w-4 text-green-500" />
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                            Test Results
                                        </span>
                                        {/* History navigation */}
                                        {history.length > 0 && (
                                            <div className="flex items-center gap-1 ml-2 pl-2 border-l border-gray-300 dark:border-gray-600">
                                                <button
                                                    type="button"
                                                    onClick={navigatePrev}
                                                    disabled={!canNavigatePrev}
                                                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                    title="Previous run"
                                                >
                                                    <ChevronLeftIcon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                                                </button>
                                                <span className="text-xs text-gray-500 dark:text-gray-400 min-w-[3rem] text-center">
                                                    {historyIndex + 1} / {history.length}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={navigateNext}
                                                    disabled={!canNavigateNext}
                                                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                    title="Next run"
                                                >
                                                    <ChevronRightIcon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => setResultsPaneMode('full')}
                                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                                            title="Expand to full screen"
                                        >
                                            <ArrowsPointingOutIcon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setResultsPaneMode('collapsed')}
                                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                                            title="Collapse results pane"
                                        >
                                            <ChevronRightIcon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                                        </button>
                                    </div>
                                </div>
                                <div className="p-3 flex-1 overflow-y-auto">
                                    <ResultsContent />
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>

            {/* Full Screen Modal */}
            {resultsPaneMode === 'full' && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
                        {/* Modal Header */}
                        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                    <DocumentTextIcon className="h-5 w-5 text-green-500" />
                                    Test Results
                                </h3>
                                {/* History navigation */}
                                {history.length > 0 && (
                                    <div className="flex items-center gap-1 ml-2 pl-3 border-l border-gray-300 dark:border-gray-600">
                                        <button
                                            type="button"
                                            onClick={navigatePrev}
                                            disabled={!canNavigatePrev}
                                            className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                            title="Previous run"
                                        >
                                            <ChevronLeftIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                                        </button>
                                        <span className="text-sm text-gray-500 dark:text-gray-400 min-w-[4rem] text-center">
                                            {historyIndex + 1} / {history.length}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={navigateNext}
                                            disabled={!canNavigateNext}
                                            className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                            title="Next run"
                                        >
                                            <ChevronRightIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setResultsPaneMode('side')}
                                    className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                    title="Minimize to side panel"
                                >
                                    <ArrowsPointingInIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setResultsPaneMode('collapsed')}
                                    className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                    title="Close"
                                >
                                    <XMarkIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                                </button>
                            </div>
                        </div>
                        {/* Modal Content */}
                        <div className="p-6 overflow-y-auto flex-1">
                            <ResultsContent isFullMode />
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
