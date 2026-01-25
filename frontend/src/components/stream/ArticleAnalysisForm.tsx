/**
 * Article Analysis Form - Configure stance analysis prompts and chat instructions
 *
 * Features:
 * - Collapsible slug reference panel (left)
 * - Stance analysis prompt editors (center)
 * - Chat instructions editor
 * - Save/reset functionality
 */

import { useState, useEffect, useCallback } from 'react';
import {
    DocumentMagnifyingGlassIcon,
    ArrowPathIcon,
    CheckIcon,
    ExclamationTriangleIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    ClipboardDocumentIcon,
    ArrowsPointingOutIcon,
    ArrowsPointingInIcon,
} from '@heroicons/react/24/outline';
import {
    researchStreamApi,
    ArticleAnalysisConfigResponse,
    SlugInfo
} from '../../lib/api/researchStreamApi';
import { PromptTemplate, ArticleAnalysisConfig } from '../../types';
import { copyToClipboard } from '../../lib/utils/clipboard';

interface ArticleAnalysisFormProps {
    streamId: number;
    onSave?: () => void;
}

export default function ArticleAnalysisForm({
    streamId,
    onSave
}: ArticleAnalysisFormProps) {
    // State for prompts
    const [stancePrompt, setStancePrompt] = useState<PromptTemplate | null>(null);
    const [chatInstructions, setChatInstructions] = useState<string>('');
    const [savedStancePrompt, setSavedStancePrompt] = useState<PromptTemplate | null>(null);
    const [savedChatInstructions, setSavedChatInstructions] = useState<string>('');
    const [defaults, setDefaults] = useState<ArticleAnalysisConfigResponse['defaults'] | null>(null);
    const [availableSlugs, setAvailableSlugs] = useState<SlugInfo[]>([]);
    const [hasChanges, setHasChanges] = useState(false);

    // UI state
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [slugsPaneCollapsed, setSlugsPaneCollapsed] = useState(false);
    const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
    const [isMaximized, setIsMaximized] = useState(false);
    const [showResetConfirm, setShowResetConfirm] = useState(false);

    // Load initial data
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            setError(null);
            try {
                const response = await researchStreamApi.getArticleAnalysisConfig(streamId);

                setDefaults(response.defaults);
                setAvailableSlugs(response.available_slugs);

                // Load current config or use defaults
                const config = response.article_analysis_config;
                const currentStancePrompt = config?.stance_analysis_prompt || response.defaults.stance_analysis_prompt;
                const currentChatInstructions = config?.chat_instructions || '';

                setStancePrompt(currentStancePrompt);
                setChatInstructions(currentChatInstructions);
                setSavedStancePrompt(currentStancePrompt);
                setSavedChatInstructions(currentChatInstructions);
            } catch (err: any) {
                console.error('Error loading article analysis config:', err);
                setError(err.message || 'Failed to load configuration');
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [streamId]);

    // Track changes
    const updateStancePrompt = useCallback((field: 'system_prompt' | 'user_prompt_template', value: string) => {
        setStancePrompt(prev => prev ? {
            ...prev,
            [field]: value
        } : { system_prompt: '', user_prompt_template: '', [field]: value });
        setHasChanges(true);
    }, []);

    const updateChatInstructions = useCallback((value: string) => {
        setChatInstructions(value);
        setHasChanges(true);
    }, []);

    // Check if stance prompt matches default
    const isStancePromptUsingDefault = useCallback(() => {
        if (!stancePrompt || !defaults) return true;
        return stancePrompt.system_prompt === defaults.stance_analysis_prompt.system_prompt &&
               stancePrompt.user_prompt_template === defaults.stance_analysis_prompt.user_prompt_template;
    }, [stancePrompt, defaults]);

    // Reset stance prompt to defaults (with confirmation)
    const handleResetToDefaults = useCallback(() => {
        setShowResetConfirm(true);
    }, []);

    const confirmResetToDefaults = useCallback(() => {
        if (defaults) {
            setStancePrompt(defaults.stance_analysis_prompt);
            setHasChanges(true);
        }
        setShowResetConfirm(false);
    }, [defaults]);

    // Reset to last saved version
    const resetToSaved = useCallback(() => {
        setStancePrompt(savedStancePrompt);
        setChatInstructions(savedChatInstructions);
        setHasChanges(false);
    }, [savedStancePrompt, savedChatInstructions]);

    // Save changes
    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            // Build config - null if using all defaults
            const isUsingDefaultPrompt = isStancePromptUsingDefault();
            const hasCustomChatInstructions = chatInstructions.trim().length > 0;

            let config: ArticleAnalysisConfig | null = null;
            if (!isUsingDefaultPrompt || hasCustomChatInstructions) {
                config = {
                    stance_analysis_prompt: isUsingDefaultPrompt ? null : stancePrompt,
                    chat_instructions: hasCustomChatInstructions ? chatInstructions : null,
                };
            }

            await researchStreamApi.updateArticleAnalysisConfig(streamId, config);

            // Update saved state
            setSavedStancePrompt(stancePrompt);
            setSavedChatInstructions(chatInstructions);
            setHasChanges(false);
            onSave?.();
        } catch (err: any) {
            console.error('Error saving article analysis config:', err);
            setError(err.message || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    // Copy to clipboard
    const handleCopySlug = async (slug: string) => {
        const result = await copyToClipboard(slug);
        if (result.success) {
            setCopiedSlug(slug);
            setTimeout(() => setCopiedSlug(null), 2000);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    // Wrapper class for normal vs maximized mode
    const wrapperClass = isMaximized
        ? "fixed inset-0 z-50 bg-white dark:bg-gray-900 p-6"
        : "h-full";

    return (
        <>
            <div className={`${wrapperClass} flex flex-col`}>
                {/* Header */}
                <div className="flex items-center justify-between flex-shrink-0">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <DocumentMagnifyingGlassIcon className="h-5 w-5 text-indigo-500" />
                            Article Analysis
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Configure stance analysis prompts and chat instructions
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {isStancePromptUsingDefault() && (
                            <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                                <CheckIcon className="h-4 w-4" />
                                Using default prompt
                            </span>
                        )}
                        {hasChanges && (
                            <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                <ExclamationTriangleIcon className="h-4 w-4" />
                                Unsaved changes
                            </span>
                        )}
                        {hasChanges && (
                            <button
                                type="button"
                                onClick={resetToSaved}
                                className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                            >
                                Discard Changes
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={handleResetToDefaults}
                            disabled={isStancePromptUsingDefault()}
                            className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Reset to Default
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
                        <button
                            type="button"
                            onClick={() => setIsMaximized(!isMaximized)}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                            title={isMaximized ? 'Exit maximize' : 'Maximize'}
                        >
                            {isMaximized ? (
                                <ArrowsPointingInIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                            ) : (
                                <ArrowsPointingOutIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                            )}
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-800 dark:text-red-200 text-sm flex-shrink-0 mt-4">
                        {error}
                    </div>
                )}

                {/* Two-Panel Layout */}
                <div className="flex gap-4 flex-1 min-h-0 mt-4">
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
                        <div className="w-64 flex-shrink-0 flex flex-col min-h-0">
                            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 flex-1 flex flex-col min-h-0">
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
                                <div className="p-3 space-y-2 flex-1 overflow-y-auto">
                                    {availableSlugs.map((slug) => (
                                        <div
                                            key={slug.slug}
                                            className="group flex flex-col gap-1 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                                            onClick={() => handleCopySlug(slug.slug)}
                                        >
                                            <div className="flex items-center justify-between">
                                                <code className="text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200 px-1.5 py-0.5 rounded font-mono">
                                                    {slug.slug}
                                                </code>
                                                {copiedSlug === slug.slug ? (
                                                    <span className="text-xs text-green-600 dark:text-green-400 font-medium">Copied!</span>
                                                ) : (
                                                    <ClipboardDocumentIcon className="h-4 w-4 text-gray-400 opacity-0 group-hover:opacity-100" />
                                                )}
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

                    {/* Center: Editors */}
                    <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-y-auto space-y-6">
                        {/* Stance Analysis Section */}
                        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
                            <h4 className="text-md font-medium text-gray-900 dark:text-white">
                                Stance Analysis Prompt
                            </h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Configure the prompt used to analyze article stance (pro-defense, pro-plaintiff, neutral, etc.)
                            </p>

                            {/* System Prompt */}
                            <div className="flex flex-col">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    System Prompt
                                </label>
                                <textarea
                                    value={stancePrompt?.system_prompt || ''}
                                    onChange={(e) => updateStancePrompt('system_prompt', e.target.value)}
                                    className="w-full h-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-mono resize-y focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                    placeholder="Define the LLM's role and guidelines..."
                                />
                            </div>

                            {/* User Prompt Template */}
                            <div className="flex flex-col">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    User Prompt Template
                                    <span className="text-gray-400 font-normal ml-2">(Use slugs like {'{stream.name}'})</span>
                                </label>
                                <textarea
                                    value={stancePrompt?.user_prompt_template || ''}
                                    onChange={(e) => updateStancePrompt('user_prompt_template', e.target.value)}
                                    className="w-full min-h-[200px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-mono resize-y focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                    placeholder="Write the prompt template with slugs..."
                                />
                            </div>
                        </div>

                        {/* Chat Instructions Section */}
                        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
                            <h4 className="text-md font-medium text-gray-900 dark:text-white">
                                Chat Instructions
                            </h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Additional instructions for the chat assistant when discussing articles from this stream.
                                These instructions help the assistant understand the context and provide more relevant responses.
                            </p>

                            <textarea
                                value={chatInstructions}
                                onChange={(e) => updateChatInstructions(e.target.value)}
                                className="w-full min-h-[150px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm resize-y focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                placeholder="Enter instructions for the chat assistant (optional)..."
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Reset to Defaults Confirmation Dialog */}
            {showResetConfirm && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                            Reset Stance Analysis Prompt to Default?
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                            This will replace the current stance analysis prompt with the default. Chat instructions will not be affected.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setShowResetConfirm(false)}
                                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={confirmResetToDefaults}
                                className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
                            >
                                Reset to Default
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
