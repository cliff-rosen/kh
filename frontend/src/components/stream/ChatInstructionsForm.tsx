/**
 * Chat Instructions Form - Configure chat assistant instructions for article discussions
 *
 * A simple form for editing chat instructions that help the assistant understand
 * the context when discussing articles from this stream.
 */

import { useState, useEffect, useCallback } from 'react';
import {
    ChatBubbleLeftRightIcon,
    ArrowPathIcon,
    CheckIcon,
    ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { researchStreamApi } from '../../lib/api/researchStreamApi';
import { ArticleAnalysisConfig } from '../../types';
import { showErrorToast, showSuccessToast } from '../../lib/errorToast';

interface ChatInstructionsFormProps {
    streamId: number;
    onSave?: () => void;
}

export default function ChatInstructionsForm({
    streamId,
    onSave
}: ChatInstructionsFormProps) {
    // State
    const [chatInstructions, setChatInstructions] = useState<string>('');
    const [savedChatInstructions, setSavedChatInstructions] = useState<string>('');
    const [stancePrompt, setStancePrompt] = useState<ArticleAnalysisConfig['stance_analysis_prompt']>(null);
    const [hasChanges, setHasChanges] = useState(false);

    // UI state
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Load initial data
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            setError(null);
            try {
                const response = await researchStreamApi.getArticleAnalysisConfig(streamId);
                const config = response.article_analysis_config;
                const currentChatInstructions = config?.chat_instructions || '';

                setChatInstructions(currentChatInstructions);
                setSavedChatInstructions(currentChatInstructions);
                // Keep track of stance prompt so we don't overwrite it
                setStancePrompt(config?.stance_analysis_prompt || null);
            } catch (err: unknown) {
                console.error('Error loading chat instructions:', err);
                const message = err instanceof Error ? err.message : 'Failed to load configuration';
                setError(message);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [streamId]);

    // Track changes
    const updateChatInstructions = useCallback((value: string) => {
        setChatInstructions(value);
        setHasChanges(true);
    }, []);

    // Reset to last saved version
    const resetToSaved = useCallback(() => {
        setChatInstructions(savedChatInstructions);
        setHasChanges(false);
    }, [savedChatInstructions]);

    // Save changes
    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            const hasCustomChatInstructions = chatInstructions.trim().length > 0;

            // Build config preserving the stance prompt
            let config: ArticleAnalysisConfig | null = null;
            if (stancePrompt || hasCustomChatInstructions) {
                config = {
                    stance_analysis_prompt: stancePrompt,
                    chat_instructions: hasCustomChatInstructions ? chatInstructions : null,
                };
            }

            await researchStreamApi.updateArticleAnalysisConfig(streamId, config);

            // Update saved state
            setSavedChatInstructions(chatInstructions);
            setHasChanges(false);
            showSuccessToast('Chat instructions saved');
            onSave?.();
        } catch (err: unknown) {
            console.error('Error saving chat instructions:', err);
            showErrorToast(err, 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between flex-shrink-0 mb-4">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <ChatBubbleLeftRightIcon className="h-5 w-5 text-indigo-500" />
                        Chat Instructions
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Additional instructions for the chat assistant when discussing articles from this stream
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {!chatInstructions.trim() && (
                        <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                            <CheckIcon className="h-4 w-4" />
                            Using default behavior
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
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-800 dark:text-red-200 text-sm flex-shrink-0 mb-4">
                    {error}
                </div>
            )}

            {/* Instructions Editor */}
            <div className="flex-1 min-h-0 flex flex-col">
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 flex-1 flex flex-col">
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 flex-shrink-0">
                        These instructions help the assistant understand the context and provide more relevant responses
                        when users chat about articles from this research stream. Leave empty to use default behavior.
                    </p>

                    <textarea
                        value={chatInstructions}
                        onChange={(e) => updateChatInstructions(e.target.value)}
                        className="flex-1 min-h-[200px] w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm resize-y focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="Example: This research stream focuses on clinical trials for cardiovascular drugs. When discussing articles, emphasize safety profiles and efficacy data. Consider regulatory implications for FDA approval..."
                    />
                </div>
            </div>
        </div>
    );
}
