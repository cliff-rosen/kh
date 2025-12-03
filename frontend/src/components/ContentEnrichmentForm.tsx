/**
 * Content Enrichment Form - Prompt Workbench UI
 *
 * Allows users to customize prompts for report summaries:
 * - Executive Summary prompt
 * - Category Summary prompt
 *
 * Features:
 * - Slug reference panel
 * - Test with sample data or existing reports
 * - Preview rendered prompts and LLM output
 */

import { useState, useEffect, useCallback } from 'react';
import {
    DocumentTextIcon,
    BeakerIcon,
    ArrowPathIcon,
    CheckIcon,
    ExclamationTriangleIcon,
    ChevronDownIcon,
    ChevronRightIcon,
    ClipboardDocumentIcon,
    SparklesIcon
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

interface ContentEnrichmentFormProps {
    streamId: number;
    onSave?: () => void;
}

type PromptType = 'executive_summary' | 'category_summary';

export default function ContentEnrichmentForm({ streamId, onSave }: ContentEnrichmentFormProps) {
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
    const [testResult, setTestResult] = useState<TestPromptResponse | null>(null);
    const [isTesting, setIsTesting] = useState(false);

    // UI state
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showSlugs, setShowSlugs] = useState(true);

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
        setTestResult(null);
        setError(null);

        try {
            const request: any = {
                prompt_type: activePromptType,
                prompt: prompts[activePromptType]
            };

            if (testMode === 'report' && selectedReportId) {
                request.report_id = selectedReportId;
                if (activePromptType === 'category_summary' && selectedCategoryId) {
                    request.category_id = selectedCategoryId;
                }
            } else if (testMode === 'paste' && pastedData) {
                try {
                    request.sample_data = JSON.parse(pastedData);
                } catch {
                    setError('Invalid JSON in sample data');
                    setIsTesting(false);
                    return;
                }
            }

            const result = await promptWorkbenchApi.testPrompt(request);
            setTestResult(result);
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

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    const currentPrompt = prompts[activePromptType];
    const currentSlugs = availableSlugs[activePromptType] || [];

    return (
        <div className="space-y-6">
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
                        onClick={resetToDefaults}
                        disabled={isUsingDefaults}
                        className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Reset to Defaults
                    </button>
                    <button
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

            <div className="grid grid-cols-3 gap-6">
                {/* Prompt Editor (2 columns) */}
                <div className="col-span-2 space-y-4">
                    {/* System Prompt */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            System Prompt
                        </label>
                        <textarea
                            value={currentPrompt?.system_prompt || ''}
                            onChange={(e) => updatePrompt(activePromptType, 'system_prompt', e.target.value)}
                            rows={8}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-mono resize-y focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            placeholder="Define the LLM's role and guidelines..."
                        />
                    </div>

                    {/* User Prompt Template */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            User Prompt Template
                            <span className="text-gray-400 font-normal ml-2">(Use slugs like {'{stream.purpose}'}, {'{articles.formatted}'})</span>
                        </label>
                        <textarea
                            value={currentPrompt?.user_prompt_template || ''}
                            onChange={(e) => updatePrompt(activePromptType, 'user_prompt_template', e.target.value)}
                            rows={12}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-mono resize-y focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            placeholder="Write the prompt template with slugs..."
                        />
                    </div>
                </div>

                {/* Slug Reference (1 column) */}
                <div className="space-y-4">
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                        <button
                            onClick={() => setShowSlugs(!showSlugs)}
                            className="w-full px-4 py-3 flex items-center justify-between text-left"
                        >
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                Available Slugs
                            </span>
                            {showSlugs ? (
                                <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                            ) : (
                                <ChevronRightIcon className="h-5 w-5 text-gray-400" />
                            )}
                        </button>
                        {showSlugs && (
                            <div className="px-4 pb-4 space-y-2">
                                {currentSlugs.map((slug) => (
                                    <div
                                        key={slug.slug}
                                        className="group flex items-start gap-2 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                                        onClick={() => copyToClipboard(slug.slug)}
                                    >
                                        <code className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 px-1.5 py-0.5 rounded font-mono">
                                            {slug.slug}
                                        </code>
                                        <span className="text-xs text-gray-500 dark:text-gray-400 flex-1">
                                            {slug.description}
                                        </span>
                                        <ClipboardDocumentIcon className="h-4 w-4 text-gray-400 opacity-0 group-hover:opacity-100" />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Testing Section */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
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
                <div className="mb-4">
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

                {/* Test Results */}
                {testResult && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            {/* Rendered System Prompt */}
                            <div>
                                <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Rendered System Prompt
                                </h5>
                                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700 max-h-48 overflow-y-auto">
                                    <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">
                                        {testResult.rendered_system_prompt}
                                    </pre>
                                </div>
                            </div>

                            {/* Rendered User Prompt */}
                            <div>
                                <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Rendered User Prompt
                                </h5>
                                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700 max-h-48 overflow-y-auto">
                                    <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">
                                        {testResult.rendered_user_prompt}
                                    </pre>
                                </div>
                            </div>
                        </div>

                        {/* LLM Response */}
                        {testResult.llm_response && (
                            <div>
                                <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                                    <DocumentTextIcon className="h-4 w-4 text-green-500" />
                                    LLM Response
                                </h5>
                                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
                                    <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                                        {testResult.llm_response}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Error */}
                        {testResult.error && (
                            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
                                <p className="text-sm text-red-800 dark:text-red-200">
                                    Error: {testResult.error}
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
