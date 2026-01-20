/**
 * Apply to Report Modal - Review current summaries and apply new ones
 *
 * Flow:
 * 1. Loading - Fetches current article summaries
 * 2. Review - Shows current summaries in clean card format
 * 3. Generating - User clicks generate, AI creates new summaries
 * 4. Compare - Side-by-side comparison, user selects which to apply
 * 5. Saving - Applies selected summaries to the report
 */

import { useState, useEffect } from 'react';
import {
    XMarkIcon,
    ArrowPathIcon,
    CheckIcon,
    ExclamationTriangleIcon,
    SparklesIcon,
    CheckCircleIcon,
    MinusCircleIcon,
    DocumentTextIcon
} from '@heroicons/react/24/outline';
import {
    getCurrentArticleSummaries,
    previewArticleSummaries,
    batchUpdateArticleSummaries,
    CurrentArticleSummaryItem,
    ArticleSummaryPreviewItem,
    RegenerateSummariesLLMConfig
} from '../../lib/api/curationApi';
import { PromptTemplate } from '../../types/research-stream';
import { showSuccessToast, showErrorToast } from '../../lib/errorToast';

interface ApplyToReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    reportId: number;
    prompt: PromptTemplate;
    llmConfig?: RegenerateSummariesLLMConfig;
}

type ModalStage = 'loading' | 'review' | 'generating' | 'compare' | 'saving';

export default function ApplyToReportModal({
    isOpen,
    onClose,
    reportId,
    prompt,
    llmConfig
}: ApplyToReportModalProps) {
    const [stage, setStage] = useState<ModalStage>('loading');
    const [reportName, setReportName] = useState<string>('');
    const [currentArticles, setCurrentArticles] = useState<CurrentArticleSummaryItem[]>([]);
    const [previews, setPreviews] = useState<ArticleSummaryPreviewItem[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [error, setError] = useState<string | null>(null);

    // Fetch current summaries when modal opens
    useEffect(() => {
        if (isOpen) {
            setStage('loading');
            setCurrentArticles([]);
            setPreviews([]);
            setSelectedIds(new Set());
            setError(null);
            fetchCurrentSummaries();
        }
    }, [isOpen, reportId]);

    const fetchCurrentSummaries = async () => {
        try {
            const response = await getCurrentArticleSummaries(reportId);
            setReportName(response.report_name);
            setCurrentArticles(response.articles);
            setStage('review');
        } catch (err: any) {
            console.error('Error fetching current summaries:', err);
            setError(err.message || 'Failed to load current summaries');
            setStage('review'); // Show error in review stage
        }
    };

    const handleGeneratePreview = async () => {
        setStage('generating');
        setError(null);

        try {
            const response = await previewArticleSummaries(reportId, {
                prompt,
                llm_config: llmConfig
            });

            setPreviews(response.previews);
            // Select all by default (only those without errors and with new summaries)
            const allSuccessful = new Set(
                response.previews
                    .filter(p => p.new_summary && !p.error)
                    .map(p => p.article_id)
            );
            setSelectedIds(allSuccessful);
            setStage('compare');
        } catch (err: any) {
            console.error('Error generating preview:', err);
            setError(err.message || 'Failed to generate preview');
            setStage('review');
        }
    };

    const handleToggleSelection = (articleId: number) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(articleId)) {
                next.delete(articleId);
            } else {
                next.add(articleId);
            }
            return next;
        });
    };

    const handleSelectAll = () => {
        const allSuccessful = new Set(
            previews
                .filter(p => p.new_summary && !p.error)
                .map(p => p.article_id)
        );
        setSelectedIds(allSuccessful);
    };

    const handleSelectNone = () => {
        setSelectedIds(new Set());
    };

    const handleApplySelected = async () => {
        if (selectedIds.size === 0) {
            showErrorToast(new Error('No articles selected'), 'Please select at least one article');
            return;
        }

        setStage('saving');
        setError(null);

        try {
            const updates = previews
                .filter(p => selectedIds.has(p.article_id) && p.new_summary)
                .map(p => ({
                    article_id: p.article_id,
                    ai_summary: p.new_summary!
                }));

            const result = await batchUpdateArticleSummaries(reportId, { updates });
            showSuccessToast(result.message);
            onClose();
        } catch (err: any) {
            console.error('Error applying summaries:', err);
            setError(err.message || 'Failed to apply summaries');
            setStage('compare');
        }
    };

    if (!isOpen) return null;

    const successCount = previews.filter(p => p.new_summary && !p.error).length;
    const errorCount = previews.filter(p => p.error).length;
    const articlesWithSummaries = currentArticles.filter(a => a.current_summary).length;

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-[calc(100vw-4rem)] max-w-[1400px] h-[calc(100vh-4rem)] flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <SparklesIcon className="h-6 w-6 text-purple-500" />
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Apply Article Summaries to Report
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {reportName || `Report #${reportId}`}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                    >
                        <XMarkIcon className="h-5 w-5 text-gray-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* Loading Stage */}
                    {stage === 'loading' && (
                        <div className="max-w-xl mx-auto text-center py-12">
                            <ArrowPathIcon className="h-16 w-16 text-blue-500 mx-auto mb-4 animate-spin" />
                            <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                                Loading Current Summaries...
                            </h4>
                            <p className="text-gray-600 dark:text-gray-400">
                                Fetching article data from the report.
                            </p>
                        </div>
                    )}

                    {/* Review Stage - Show current summaries in card format */}
                    {stage === 'review' && (
                        <div className="space-y-4">
                            {/* Header with stats and generate button */}
                            <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-700">
                                <div className="flex items-center gap-4">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">
                                        <span className="font-medium text-gray-900 dark:text-white">{currentArticles.length}</span> articles
                                    </span>
                                    <span className="text-sm text-gray-600 dark:text-gray-400">
                                        <DocumentTextIcon className="h-4 w-4 inline mr-1" />
                                        {articlesWithSummaries} with summaries
                                    </span>
                                </div>
                                <button
                                    onClick={handleGeneratePreview}
                                    disabled={currentArticles.length === 0}
                                    className="px-5 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                                >
                                    <SparklesIcon className="h-5 w-5" />
                                    Generate New Summaries
                                </button>
                            </div>

                            {error && (
                                <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm">
                                    {error}
                                </div>
                            )}

                            {currentArticles.length === 0 && !error && (
                                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                    No articles found in this report.
                                </div>
                            )}

                            {/* Current summaries in card format */}
                            <div className="space-y-3">
                                {currentArticles.map((article) => (
                                    <div
                                        key={article.article_id}
                                        className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                                    >
                                        {/* Article header */}
                                        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-gray-900 dark:text-white">
                                                        {article.title}
                                                    </p>
                                                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                                                        {article.pmid && <span>PMID: {article.pmid}</span>}
                                                        {article.journal && <span>{article.journal}</span>}
                                                        {article.year && <span>{article.year}</span>}
                                                    </div>
                                                </div>
                                                {article.current_summary ? (
                                                    <span className="px-2 py-1 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded flex-shrink-0">
                                                        Has Summary
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded flex-shrink-0">
                                                        No Summary
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Summary content */}
                                        <div className="p-4">
                                            {article.current_summary ? (
                                                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                                    {article.current_summary}
                                                </p>
                                            ) : (
                                                <p className="text-sm text-gray-400 dark:text-gray-500 italic">
                                                    No summary available for this article.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Generating Stage */}
                    {stage === 'generating' && (
                        <div className="max-w-xl mx-auto text-center py-12">
                            <ArrowPathIcon className="h-16 w-16 text-purple-500 mx-auto mb-4 animate-spin" />
                            <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                                Generating New Summaries...
                            </h4>
                            <p className="text-gray-600 dark:text-gray-400">
                                Processing {currentArticles.length} articles. This may take a moment.
                            </p>
                        </div>
                    )}

                    {/* Compare Stage - Side-by-side comparison */}
                    {stage === 'compare' && (
                        <div className="space-y-4">
                            {/* Stats bar */}
                            <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-700">
                                <div className="flex items-center gap-4">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">
                                        <span className="font-medium text-gray-900 dark:text-white">{previews.length}</span> articles
                                    </span>
                                    <span className="text-sm text-green-600 dark:text-green-400">
                                        <CheckCircleIcon className="h-4 w-4 inline mr-1" />
                                        {successCount} generated
                                    </span>
                                    {errorCount > 0 && (
                                        <span className="text-sm text-red-600 dark:text-red-400">
                                            <ExclamationTriangleIcon className="h-4 w-4 inline mr-1" />
                                            {errorCount} errors
                                        </span>
                                    )}
                                    <span className="text-sm text-purple-600 dark:text-purple-400">
                                        <CheckIcon className="h-4 w-4 inline mr-1" />
                                        {selectedIds.size} selected
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleSelectAll}
                                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                    >
                                        Select All
                                    </button>
                                    <span className="text-gray-300 dark:text-gray-600">|</span>
                                    <button
                                        onClick={handleSelectNone}
                                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                    >
                                        Select None
                                    </button>
                                </div>
                            </div>

                            {error && (
                                <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm">
                                    {error}
                                </div>
                            )}

                            {/* Comparison list */}
                            <div className="space-y-4">
                                {previews.map((preview) => (
                                    <div
                                        key={preview.article_id}
                                        className={`border rounded-lg overflow-hidden ${
                                            selectedIds.has(preview.article_id)
                                                ? 'border-purple-500 dark:border-purple-400'
                                                : 'border-gray-200 dark:border-gray-700'
                                        }`}
                                    >
                                        {/* Article header */}
                                        <div
                                            className={`px-4 py-3 flex items-center gap-3 cursor-pointer ${
                                                selectedIds.has(preview.article_id)
                                                    ? 'bg-purple-50 dark:bg-purple-900/20'
                                                    : 'bg-gray-50 dark:bg-gray-800'
                                            }`}
                                            onClick={() => preview.new_summary && !preview.error && handleToggleSelection(preview.article_id)}
                                        >
                                            {/* Checkbox */}
                                            <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${
                                                preview.error
                                                    ? 'bg-red-100 dark:bg-red-900/30'
                                                    : !preview.new_summary
                                                        ? 'bg-gray-100 dark:bg-gray-700'
                                                        : selectedIds.has(preview.article_id)
                                                            ? 'bg-purple-600'
                                                            : 'border-2 border-gray-300 dark:border-gray-600'
                                            }`}>
                                                {preview.error ? (
                                                    <ExclamationTriangleIcon className="h-3 w-3 text-red-600 dark:text-red-400" />
                                                ) : !preview.new_summary ? (
                                                    <MinusCircleIcon className="h-3 w-3 text-gray-400" />
                                                ) : selectedIds.has(preview.article_id) ? (
                                                    <CheckIcon className="h-3 w-3 text-white" />
                                                ) : null}
                                            </div>

                                            {/* Title and PMID */}
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-gray-900 dark:text-white truncate">
                                                    {preview.title}
                                                </p>
                                                {preview.pmid && (
                                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                                        PMID: {preview.pmid}
                                                    </p>
                                                )}
                                            </div>

                                            {/* Status badge */}
                                            {preview.error ? (
                                                <span className="px-2 py-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded">
                                                    Error
                                                </span>
                                            ) : !preview.new_summary ? (
                                                <span className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                                                    No Change
                                                </span>
                                            ) : preview.current_summary === preview.new_summary ? (
                                                <span className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                                                    Same
                                                </span>
                                            ) : (
                                                <span className="px-2 py-1 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
                                                    New
                                                </span>
                                            )}
                                        </div>

                                        {/* Error message */}
                                        {preview.error && (
                                            <div className="px-4 py-2 bg-red-50 dark:bg-red-900/10 text-sm text-red-700 dark:text-red-300">
                                                {preview.error}
                                            </div>
                                        )}

                                        {/* Side-by-side comparison */}
                                        {!preview.error && preview.new_summary && (
                                            <div className="grid grid-cols-2 divide-x divide-gray-200 dark:divide-gray-700">
                                                {/* Current summary */}
                                                <div className="p-4">
                                                    <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                                                        Current Summary
                                                    </h5>
                                                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                                        {preview.current_summary || <span className="italic text-gray-400">No current summary</span>}
                                                    </p>
                                                </div>

                                                {/* New summary */}
                                                <div className="p-4 bg-green-50/50 dark:bg-green-900/10">
                                                    <h5 className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wide mb-2">
                                                        New Summary
                                                    </h5>
                                                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                                        {preview.new_summary}
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Saving Stage */}
                    {stage === 'saving' && (
                        <div className="max-w-xl mx-auto text-center py-12">
                            <ArrowPathIcon className="h-16 w-16 text-purple-500 mx-auto mb-4 animate-spin" />
                            <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                                Applying Changes...
                            </h4>
                            <p className="text-gray-600 dark:text-gray-400">
                                Saving {selectedIds.size} article summaries to the report.
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {stage === 'review' && currentArticles.length > 0 && (
                    <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Click "Generate New Summaries" to create AI summaries using your custom prompt
                        </p>
                    </div>
                )}

                {stage === 'compare' && (
                    <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleApplySelected}
                            disabled={selectedIds.size === 0}
                            className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                        >
                            <CheckIcon className="h-5 w-5" />
                            Apply {selectedIds.size} Selected
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
