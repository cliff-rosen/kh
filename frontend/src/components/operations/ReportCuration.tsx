/**
 * Report Curation View
 *
 * Real implementation of the curation experience for reviewing
 * and approving reports. Features:
 * - Report content editing (title, summaries)
 * - Article curation (include/exclude, categorize)
 * - Approval/rejection workflow
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeftIcon,
    CheckIcon,
    XMarkIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    PencilIcon,
    ArrowPathIcon,
    DocumentTextIcon,
    PlusIcon,
    MinusIcon,
    ArrowTopRightOnSquareIcon,
    ExclamationCircleIcon,
    EyeIcon,
    EnvelopeIcon,
    ChatBubbleLeftIcon,
    CheckCircleIcon,
    ArrowUturnLeftIcon,
} from '@heroicons/react/24/outline';
import {
    reportApi,
    CurationViewResponse,
    CurationIncludedArticle,
    CurationFilteredArticle,
    CurationCategory,
} from '../../lib/api/reportApi';

type ArticleTab = 'included' | 'filtered_out' | 'duplicates' | 'curated';

export default function ReportCuration() {
    const { reportId } = useParams<{ reportId: string }>();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [approving, setApproving] = useState(false);
    const [undoing, setUndoing] = useState<number | null>(null);

    const [curationData, setCurationData] = useState<CurationViewResponse | null>(null);
    const [editedName, setEditedName] = useState<string>('');
    const [editedSummary, setEditedSummary] = useState<string>('');
    const [editedCategorySummaries, setEditedCategorySummaries] = useState<Record<string, string>>({});

    const [activeTab, setActiveTab] = useState<ArticleTab>('included');
    const [contentExpanded, setContentExpanded] = useState(true);
    const [editingTitle, setEditingTitle] = useState(false);
    const [editingSummary, setEditingSummary] = useState<string | null>(null);
    const [expandedArticle, setExpandedArticle] = useState<number | null>(null);
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [showPreview, setShowPreview] = useState(false);

    // Track which article is being processed (for loading indicators)
    const [processingArticleId, setProcessingArticleId] = useState<number | null>(null);

    // Fetch curation data
    // isInitialLoad controls whether to show loading spinner (only on first load)
    const fetchCurationData = useCallback(async (isInitialLoad = false) => {
        if (!reportId) return;

        // Only show loading spinner on initial load, not on refreshes
        if (isInitialLoad) {
            setLoading(true);
        }
        setError(null);
        try {
            const data = await reportApi.getCurationView(parseInt(reportId));
            setCurationData(data);
            // Only update edited values on initial load to preserve user edits
            if (isInitialLoad) {
                setEditedName(data.report.report_name);
                setEditedSummary(data.report.executive_summary || '');
                setEditedCategorySummaries(data.report.category_summaries || {});
            }
        } catch (err) {
            console.error('Failed to fetch curation data:', err);
            if (isInitialLoad) {
                setError('Failed to load report for curation');
            }
        } finally {
            if (isInitialLoad) {
                setLoading(false);
            }
        }
    }, [reportId]);

    useEffect(() => {
        fetchCurationData(true); // Initial load - show loading spinner
    }, [fetchCurationData]);

    // Check if content has been modified
    const hasContentChanges = curationData && (
        editedName !== curationData.report.report_name ||
        editedSummary !== (curationData.report.executive_summary || '') ||
        JSON.stringify(editedCategorySummaries) !== JSON.stringify(curationData.report.category_summaries || {})
    );

    // Save content changes
    const handleSaveContent = async () => {
        if (!reportId || !curationData) return;

        setSaving(true);
        try {
            await reportApi.updateReportContent(parseInt(reportId), {
                report_name: editedName !== curationData.report.report_name ? editedName : undefined,
                executive_summary: editedSummary !== curationData.report.executive_summary ? editedSummary : undefined,
                category_summaries: JSON.stringify(editedCategorySummaries) !== JSON.stringify(curationData.report.category_summaries || {})
                    ? editedCategorySummaries
                    : undefined,
            });
            // Refresh data
            await fetchCurationData();
        } catch (err) {
            console.error('Failed to save content:', err);
            alert('Failed to save changes');
        } finally {
            setSaving(false);
        }
    };

    // Exclude an article
    const handleExcludeArticle = async (article: CurationIncludedArticle) => {
        if (!reportId || !article.article_id) return;

        try {
            // For curator-added articles, use resetCuration to undo the add
            // For pipeline-included articles, use excludeArticle to soft exclude
            if (article.curator_added && article.wip_article_id) {
                await reportApi.resetCuration(parseInt(reportId), article.wip_article_id);
            } else {
                await reportApi.excludeArticle(parseInt(reportId), article.article_id);
            }
            await fetchCurationData();
        } catch (err) {
            console.error('Failed to exclude article:', err);
            alert('Failed to exclude article');
        }
    };

    // Include a filtered article
    const handleIncludeArticle = async (article: CurationFilteredArticle, categoryId?: string) => {
        if (!reportId) return;

        try {
            // For curator-excluded articles (pipeline included, then manually excluded),
            // use resetCuration to restore to pipeline's original decision
            // For truly filtered articles, use includeArticle to add them
            if (article.curator_excluded) {
                await reportApi.resetCuration(parseInt(reportId), article.wip_article_id);
            } else {
                await reportApi.includeArticle(parseInt(reportId), article.wip_article_id, categoryId);
            }
            await fetchCurationData();
        } catch (err) {
            console.error('Failed to include article:', err);
            alert('Failed to include article');
        }
    };

    // Reset curation - restore article to pipeline's original decision
    const handleResetCuration = async (curatedArticle: CurationFilteredArticle) => {
        if (!reportId) return;

        setUndoing(curatedArticle.wip_article_id);
        try {
            const result = await reportApi.resetCuration(parseInt(reportId), curatedArticle.wip_article_id);
            if (!result.reset) {
                console.log('Nothing to reset:', result.message);
            }
            await fetchCurationData();
        } catch (err) {
            console.error('Failed to reset curation:', err);
            alert('Failed to undo curation');
        } finally {
            setUndoing(null);
        }
    };

    // Handle category change for an article
    const handleCategoryChange = async (article: CurationIncludedArticle, newCategoryId: string) => {
        if (!reportId) return;

        try {
            await reportApi.updateArticleInReport(parseInt(reportId), article.article_id, {
                category: newCategoryId
            });
            await fetchCurationData();
        } catch (err) {
            console.error('Failed to update article category:', err);
            alert('Failed to update article category');
        }
    };

    // Approve report
    const handleApprove = async () => {
        if (!reportId) return;

        setApproving(true);
        try {
            await reportApi.approveReport(parseInt(reportId));
            navigate('/operations/approvals');
        } catch (err) {
            console.error('Failed to approve report:', err);
            alert('Failed to approve report');
        } finally {
            setApproving(false);
        }
    };

    // Reject report
    const handleReject = async () => {
        if (!reportId || !rejectReason.trim()) return;

        setApproving(true);
        try {
            await reportApi.rejectReport(parseInt(reportId), rejectReason);
            navigate('/operations/approvals');
        } catch (err) {
            console.error('Failed to reject report:', err);
            alert('Failed to reject report');
        } finally {
            setApproving(false);
            setShowRejectModal(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <ArrowPathIcon className="h-8 w-8 text-gray-400 animate-spin" />
                <span className="ml-2 text-gray-500">Loading curation view...</span>
            </div>
        );
    }

    if (error || !curationData) {
        return (
            <div className="flex flex-col items-center justify-center h-full">
                <ExclamationCircleIcon className="h-12 w-12 text-red-400 mb-4" />
                <p className="text-red-600 dark:text-red-400">{error || 'Failed to load report'}</p>
                <Link
                    to="/operations/approvals"
                    className="mt-4 text-blue-600 hover:underline"
                >
                    Back to Approvals
                </Link>
            </div>
        );
    }

    const report = curationData.report;
    const categories = curationData.categories;
    const includedArticles = curationData.included_articles;
    const filteredArticles = curationData.filtered_articles;
    const stats = curationData.stats;

    // Build categories with article counts from included articles
    const categoriesWithCounts = categories.map(cat => {
        const count = includedArticles.filter(a =>
            a.presentation_categories?.includes(cat.id)
        ).length;
        return { ...cat, article_count: count };
    });

    return (
        <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
            {/* Header */}
            <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            to="/operations/approvals"
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                        >
                            <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
                        </Link>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                                    Review & Curate Report
                                </h1>
                                <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                    report.approval_status === 'awaiting_approval'
                                        ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                                        : report.approval_status === 'approved'
                                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                }`}>
                                    {report.approval_status === 'awaiting_approval' ? 'Awaiting Approval' :
                                     report.approval_status === 'approved' ? 'Approved' : 'Rejected'}
                                </span>
                                {(hasContentChanges || report.has_curation_edits) && (
                                    <span className="px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full">
                                        {hasContentChanges ? 'Unsaved Changes' : 'Has Edits'}
                                    </span>
                                )}
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                {curationData.stream_name} &bull; {report.report_date || 'No date'}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => setShowPreview(true)}
                            className="px-4 py-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 border border-blue-300 dark:border-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-2"
                        >
                            <EyeIcon className="h-4 w-4" />
                            Preview
                        </button>
                        {hasContentChanges && (
                            <button
                                type="button"
                                onClick={handleSaveContent}
                                disabled={saving}
                                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                            >
                                {saving ? 'Saving...' : 'Save Draft'}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setShowRejectModal(true)}
                            disabled={approving}
                            className="px-4 py-2 text-red-600 hover:text-red-700 border border-red-300 rounded-lg hover:bg-red-50 disabled:opacity-50"
                        >
                            Reject
                        </button>
                        <button
                            type="button"
                            onClick={handleApprove}
                            disabled={approving}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 disabled:opacity-50"
                        >
                            {approving ? (
                                <ArrowPathIcon className="h-4 w-4 animate-spin" />
                            ) : (
                                <CheckIcon className="h-4 w-4" />
                            )}
                            {approving ? 'Approving...' : 'Approve Report'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6 space-y-6">
                {/* Report Content Section */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    <button
                        type="button"
                        onClick={() => setContentExpanded(!contentExpanded)}
                        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                        <div className="flex items-center gap-2">
                            <DocumentTextIcon className="h-5 w-5 text-gray-400" />
                            <span className="font-semibold text-gray-900 dark:text-white">Report Content</span>
                            {(editedName !== report.report_name || editedSummary !== (report.executive_summary || '')) && (
                                <span className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                                    Edited
                                </span>
                            )}
                        </div>
                        {contentExpanded ? (
                            <ChevronUpIcon className="h-5 w-5 text-gray-400" />
                        ) : (
                            <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                        )}
                    </button>

                    {contentExpanded && (
                        <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-6">
                            {/* Report Title */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Report Title
                                    </label>
                                    {editedName !== report.report_name && (
                                        <span className="text-xs text-blue-600 dark:text-blue-400">Modified</span>
                                    )}
                                </div>
                                {editingTitle ? (
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={editedName}
                                            onChange={(e) => setEditedName(e.target.value)}
                                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                            autoFocus
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setEditingTitle(false)}
                                            className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                        >
                                            <CheckIcon className="h-4 w-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <div
                                        onClick={() => setEditingTitle(true)}
                                        className="flex items-center justify-between px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:border-blue-300 dark:hover:border-blue-600"
                                    >
                                        <span className="text-gray-900 dark:text-white">{editedName || 'Untitled Report'}</span>
                                        <PencilIcon className="h-4 w-4 text-gray-400" />
                                    </div>
                                )}
                            </div>

                            {/* Executive Summary */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Executive Summary
                                    </label>
                                    <div className="flex items-center gap-2">
                                        {editedSummary !== (report.executive_summary || '') && (
                                            <span className="text-xs text-blue-600 dark:text-blue-400">Modified</span>
                                        )}
                                        <button type="button" className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1">
                                            <ArrowPathIcon className="h-3 w-3" />
                                            Regenerate
                                        </button>
                                    </div>
                                </div>
                                {editingSummary === 'executive' ? (
                                    <div className="space-y-2">
                                        <textarea
                                            value={editedSummary}
                                            onChange={(e) => setEditedSummary(e.target.value)}
                                            rows={6}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setEditingSummary(null)}
                                            className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                                        >
                                            Done
                                        </button>
                                    </div>
                                ) : (
                                    <div
                                        onClick={() => setEditingSummary('executive')}
                                        className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:border-blue-300 dark:hover:border-blue-600 group"
                                    >
                                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                            {editedSummary || 'No executive summary'}
                                        </p>
                                        <div className="mt-2 text-xs text-gray-400 group-hover:text-blue-500 flex items-center gap-1">
                                            <PencilIcon className="h-3 w-3" />
                                            Click to edit
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Category Summaries */}
                            {categoriesWithCounts.length > 0 && (
                                <div>
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 block">
                                        Category Summaries
                                    </label>
                                    <div className="space-y-3">
                                        {categoriesWithCounts.map((cat) => {
                                            const originalSummary = report.category_summaries?.[cat.id] || '';
                                            const editedCatSummary = editedCategorySummaries[cat.id] || '';
                                            const isEditing = editingSummary === cat.id;

                                            return (
                                                <div key={cat.id} className="border border-gray-200 dark:border-gray-700 rounded-lg">
                                                    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                                                        <span className="font-medium text-gray-900 dark:text-white text-sm">
                                                            {cat.name}
                                                            <span className="ml-2 text-gray-500 font-normal">({cat.article_count} articles)</span>
                                                        </span>
                                                        <button type="button" className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                                                            <ArrowPathIcon className="h-3 w-3" />
                                                            Regenerate
                                                        </button>
                                                    </div>
                                                    {isEditing ? (
                                                        <div className="p-3 space-y-2">
                                                            <textarea
                                                                value={editedCatSummary}
                                                                onChange={(e) => setEditedCategorySummaries(prev => ({
                                                                    ...prev,
                                                                    [cat.id]: e.target.value
                                                                }))}
                                                                rows={4}
                                                                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => setEditingSummary(null)}
                                                                className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                                                            >
                                                                Done
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div
                                                            onClick={() => setEditingSummary(cat.id)}
                                                            className="px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
                                                        >
                                                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                                                {editedCatSummary || originalSummary || 'No summary - click to add'}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Articles Section */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-between">
                            <h2 className="font-semibold text-gray-900 dark:text-white">Articles</h2>
                            {/* Pipeline vs Curated Stats */}
                            <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                                <span>
                                    Pipeline: <span className="font-medium text-gray-700 dark:text-gray-300">{stats.pipeline_included}</span> included
                                </span>
                                {(stats.curator_added > 0 || stats.curator_removed > 0) && (
                                    <span className="flex items-center gap-2">
                                        <span className="text-gray-300 dark:text-gray-600">|</span>
                                        <span>
                                            Curated:
                                            {stats.curator_added > 0 && (
                                                <span className="ml-1 text-green-600 dark:text-green-400">+{stats.curator_added}</span>
                                            )}
                                            {stats.curator_removed > 0 && (
                                                <span className="ml-1 text-red-600 dark:text-red-400">-{stats.curator_removed}</span>
                                            )}
                                        </span>
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="flex gap-2 mt-4">
                            <button
                                type="button"
                                onClick={() => setActiveTab('included')}
                                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                                    activeTab === 'included'
                                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                                }`}
                            >
                                Included
                                <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200">
                                    {includedArticles.length}
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('filtered_out')}
                                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                                    activeTab === 'filtered_out'
                                        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                                }`}
                            >
                                Filtered Out
                                <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200">
                                    {filteredArticles.length}
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('duplicates')}
                                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                                    activeTab === 'duplicates'
                                        ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                                }`}
                            >
                                Duplicates
                                <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300">
                                    {stats.pipeline_duplicates}
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('curated')}
                                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                                    activeTab === 'curated'
                                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                                }`}
                            >
                                Curated
                                <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200">
                                    {curationData.curated_articles.length}
                                </span>
                            </button>
                        </div>
                    </div>

                    {/* Article List */}
                    <div className="p-4 space-y-3">
                        {activeTab === 'included' && includedArticles.map((article, idx) => (
                            <IncludedArticleCard
                                key={article.article_id}
                                article={article}
                                ranking={idx + 1}
                                categories={categories}
                                expanded={expandedArticle === article.article_id}
                                onToggleExpand={() => setExpandedArticle(expandedArticle === article.article_id ? null : article.article_id)}
                                onExclude={() => handleExcludeArticle(article)}
                                onCategoryChange={(newCat) => handleCategoryChange(article, newCat)}
                            />
                        ))}

                        {activeTab === 'filtered_out' && filteredArticles.map((article) => (
                            <FilteredArticleCard
                                key={article.wip_article_id}
                                article={article}
                                categories={categories}
                                expanded={expandedArticle === article.wip_article_id}
                                onToggleExpand={() => setExpandedArticle(expandedArticle === article.wip_article_id ? null : article.wip_article_id)}
                                onInclude={(categoryId) => handleIncludeArticle(article, categoryId)}
                            />
                        ))}

                        {activeTab === 'duplicates' && stats.pipeline_duplicates > 0 && (
                            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                <p className="text-lg font-medium">{stats.pipeline_duplicates} duplicate{stats.pipeline_duplicates !== 1 ? 's' : ''} detected</p>
                                <p className="text-sm mt-2">Duplicates are automatically excluded from the report.</p>
                            </div>
                        )}

                        {activeTab === 'curated' && (
                            curationData.curated_articles.length === 0 ? (
                                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                    <CheckCircleIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                    <p>No manual changes yet</p>
                                    <p className="text-sm mt-1">Articles you include or exclude will appear here</p>
                                </div>
                            ) : (
                                curationData.curated_articles.map((article) => {
                                    const isIncluded = article.curator_included;
                                    const isUndoing = undoing === article.wip_article_id;
                                    const pubmedUrl = article.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/` : null;

                                    return (
                                        <div key={article.wip_article_id} className="p-4 border border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                                                            isIncluded
                                                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                                                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                                        }`}>
                                                            {isIncluded ? 'Manually Included' : 'Manually Excluded'}
                                                        </span>
                                                    </div>
                                                    {pubmedUrl ? (
                                                        <a
                                                            href={pubmedUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1 group"
                                                        >
                                                            {article.title}
                                                            <ArrowTopRightOnSquareIcon className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                                                        </a>
                                                    ) : (
                                                        <h4 className="font-medium text-gray-900 dark:text-white">
                                                            {article.title}
                                                        </h4>
                                                    )}
                                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                                        {article.authors?.join(', ')} &bull; {article.journal} &bull; {article.year}
                                                        {article.pmid && (
                                                            <span className="ml-2 text-gray-400">PMID: {article.pmid}</span>
                                                        )}
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleResetCuration(article)}
                                                    disabled={isUndoing}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-white dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    title="Reset to pipeline's original decision"
                                                >
                                                    {isUndoing ? (
                                                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <ArrowUturnLeftIcon className="h-4 w-4" />
                                                    )}
                                                    {isUndoing ? 'Resetting...' : 'Undo'}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            )
                        )}

                        {activeTab === 'included' && includedArticles.length === 0 && (
                            <div className="text-center py-8 text-gray-500">
                                No articles included in this report
                            </div>
                        )}

                        {activeTab === 'filtered_out' && filteredArticles.length === 0 && (
                            <div className="text-center py-8 text-gray-500">
                                No filtered articles
                            </div>
                        )}

                        {activeTab === 'duplicates' && stats.pipeline_duplicates === 0 && (
                            <div className="text-center py-8 text-gray-500">
                                No duplicate articles detected
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Reject Modal */}
            {showRejectModal && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md">
                        <div className="p-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                Reject Report
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                                Please provide a reason for rejecting this report.
                            </p>
                            <textarea
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder="Enter rejection reason..."
                                rows={4}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                            <button
                                type="button"
                                onClick={() => setShowRejectModal(false)}
                                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-gray-600 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleReject}
                                disabled={!rejectReason.trim() || approving}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                            >
                                {approving ? 'Rejecting...' : 'Reject Report'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Preview Modal */}
            {showPreview && (
                <ReportPreviewModal
                    report={report}
                    articles={includedArticles}
                    categories={categoriesWithCounts}
                    editedSummary={editedSummary}
                    editedCategorySummaries={editedCategorySummaries}
                    streamName={curationData.stream_name}
                    onClose={() => setShowPreview(false)}
                />
            )}
        </div>
    );
}

// Report Preview Modal Component (Email-style preview)
function ReportPreviewModal({
    report,
    articles,
    categories,
    editedSummary,
    editedCategorySummaries,
    streamName,
    onClose,
}: {
    report: { report_name: string; report_date: string | null };
    articles: CurationIncludedArticle[];
    categories: (CurationCategory & { article_count: number })[];
    editedSummary: string;
    editedCategorySummaries: Record<string, string>;
    streamName: string | null;
    onClose: () => void;
}) {
    // Group articles by category
    const articlesByCategory = categories.map(cat => ({
        ...cat,
        articles: articles.filter(a => a.presentation_categories?.includes(cat.id)),
        summary: editedCategorySummaries[cat.id] || '',
    })).filter(cat => cat.articles.length > 0);

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                {/* Modal Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <EnvelopeIcon className="h-5 w-5 text-gray-400" />
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                            Report Preview (Email Format)
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                    >
                        <XMarkIcon className="h-5 w-5 text-gray-500" />
                    </button>
                </div>

                {/* Modal Content - Scrollable email preview */}
                <div className="flex-1 overflow-auto p-6 bg-gray-100 dark:bg-gray-900">
                    {/* Email Container */}
                    <div className="max-w-2xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                        {/* Email Header */}
                        <div className="px-8 py-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-600 to-blue-700">
                            <h1 className="text-2xl font-bold text-white">
                                {report.report_name}
                            </h1>
                            <p className="text-blue-100 mt-1">
                                {streamName} &bull; {report.report_date || 'No date'}
                            </p>
                        </div>

                        {/* Executive Summary */}
                        <div className="px-8 py-6 border-b border-gray-200 dark:border-gray-700">
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                                Executive Summary
                            </h2>
                            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                {editedSummary || 'No executive summary'}
                            </p>
                        </div>

                        {/* Categories with Articles */}
                        {articlesByCategory.map((cat) => (
                            <div key={cat.id} className="px-8 py-6 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                                    {cat.name}
                                    <span className="ml-2 text-sm font-normal text-gray-500">
                                        ({cat.articles.length} articles)
                                    </span>
                                </h2>
                                {cat.summary && (
                                    <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">
                                        {cat.summary}
                                    </p>
                                )}

                                {/* Articles in this category */}
                                <div className="space-y-4">
                                    {cat.articles.map((article, idx) => (
                                        <div key={article.article_id} className="pl-4 border-l-2 border-blue-200 dark:border-blue-800">
                                            <h3 className="font-medium text-gray-900 dark:text-white">
                                                {idx + 1}. {article.title}
                                            </h3>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                {article.authors?.join(', ')} &bull; {article.journal} &bull; {article.year}
                                            </p>
                                            {article.ai_summary && (
                                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                                                    {article.ai_summary}
                                                </p>
                                            )}
                                            {article.pmid && (
                                                <a
                                                    href={`https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs text-blue-600 hover:underline mt-2 inline-block"
                                                >
                                                    View on PubMed →
                                                </a>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}

                        {/* Footer */}
                        <div className="px-8 py-4 bg-gray-50 dark:bg-gray-900/50 text-center text-xs text-gray-500 dark:text-gray-400">
                            Generated by Knowledge Horizon Research Platform
                        </div>
                    </div>
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}

// Included Article Card Component
function IncludedArticleCard({
    article,
    ranking,
    categories,
    expanded,
    onToggleExpand,
    onExclude,
    onCategoryChange,
}: {
    article: CurationIncludedArticle;
    ranking: number;
    categories: CurationCategory[];
    expanded: boolean;
    onToggleExpand: () => void;
    onExclude: () => void;
    onCategoryChange: (categoryId: string) => void;
}) {
    const [notes, setNotes] = useState(article.curation_notes || '');
    const pubmedUrl = article.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/` : null;
    const currentCategory = article.presentation_categories?.[0] || '';

    return (
        <div className={`border rounded-lg overflow-hidden ${
            article.curator_added
                ? 'border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-900/10'
                : 'border-gray-200 dark:border-gray-700'
        }`}>
            {/* Main content */}
            <div className="p-4">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 flex items-center gap-1 text-gray-400">
                                <span className="text-sm font-medium">#{ranking}</span>
                                {article.curator_added && (
                                    <span className="ml-1 px-1.5 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300 rounded">
                                        Added
                                    </span>
                                )}
                                <div className="flex flex-col">
                                    <button type="button" className="hover:text-gray-600 p-0.5" title="Move up">
                                        <ChevronUpIcon className="h-3 w-3" />
                                    </button>
                                    <button type="button" className="hover:text-gray-600 p-0.5" title="Move down">
                                        <ChevronDownIcon className="h-3 w-3" />
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 min-w-0">
                                {pubmedUrl ? (
                                    <a
                                        href={pubmedUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1 group"
                                    >
                                        {article.title}
                                        <ArrowTopRightOnSquareIcon className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                                    </a>
                                ) : (
                                    <h4 className="font-medium text-gray-900 dark:text-white">
                                        {article.title}
                                    </h4>
                                )}
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    {article.authors?.join(', ')} &bull; {article.journal} &bull; {article.year}
                                    {article.pmid && (
                                        <span className="ml-2 text-gray-400">PMID: {article.pmid}</span>
                                    )}
                                </p>
                            </div>
                        </div>

                        {/* Expanded content */}
                        {expanded && (
                            <div className="mt-4 space-y-4 ml-10">
                                {/* AI Summary */}
                                {article.ai_summary && (
                                    <div>
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">AI Summary</span>
                                            <button type="button" className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                                                <PencilIcon className="h-3 w-3" />
                                                Edit
                                            </button>
                                        </div>
                                        <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/50 p-3 rounded">
                                            {article.ai_summary}
                                        </p>
                                    </div>
                                )}

                                {/* Abstract */}
                                {article.abstract && (
                                    <div>
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Abstract</span>
                                        <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/50 p-3 rounded mt-1">
                                            {article.abstract}
                                        </p>
                                    </div>
                                )}

                                {/* Curation Notes */}
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <ChatBubbleLeftIcon className="h-4 w-4 text-gray-400" />
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                            Curation Notes
                                        </span>
                                        <span className="text-xs text-gray-400">(for retrieval improvement)</span>
                                    </div>
                                    <textarea
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        placeholder="Add notes about why this article should or shouldn't be included..."
                                        rows={2}
                                        className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                    />
                                </div>

                                {/* Category assignment */}
                                <div className="flex items-center gap-3">
                                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Category:</span>
                                    <select
                                        value={currentCategory}
                                        onChange={(e) => onCategoryChange(e.target.value)}
                                        className="text-sm border border-gray-200 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                    >
                                        <option value="">None</option>
                                        {categories.map(cat => (
                                            <option key={cat.id} value={cat.id}>
                                                {cat.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex-shrink-0 flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onExclude}
                            className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                            title="Exclude from report"
                        >
                            <MinusIcon className="h-5 w-5" />
                        </button>
                        <button
                            type="button"
                            onClick={onToggleExpand}
                            className="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                        >
                            {expanded ? (
                                <ChevronUpIcon className="h-5 w-5" />
                            ) : (
                                <ChevronDownIcon className="h-5 w-5" />
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Filtered Article Card Component
function FilteredArticleCard({
    article,
    categories,
    expanded,
    onToggleExpand,
    onInclude,
}: {
    article: CurationFilteredArticle;
    categories: CurationCategory[];
    expanded: boolean;
    onToggleExpand: () => void;
    onInclude: (categoryId?: string) => void;
}) {
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [notes, setNotes] = useState(article.curation_notes || '');
    const pubmedUrl = article.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/` : null;
    const isCurated = article.curator_included || article.curator_excluded;

    return (
        <div className={`border rounded-lg overflow-hidden ${
            article.curator_excluded
                ? 'border-red-300 dark:border-red-700 bg-red-50/50 dark:bg-red-900/10'
                : 'border-gray-200 dark:border-gray-700'
        }`}>
            {/* Main content */}
            <div className="p-4">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2">
                            {/* Curator Excluded badge - shown prominently at start */}
                            {article.curator_excluded && (
                                <span className="flex-shrink-0 px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300 rounded">
                                    Excluded
                                </span>
                            )}
                            <div className="flex-1 min-w-0">
                                {pubmedUrl ? (
                                    <a
                                        href={pubmedUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1 group"
                                    >
                                        {article.title}
                                        <ArrowTopRightOnSquareIcon className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                                    </a>
                                ) : (
                                    <h4 className="font-medium text-gray-900 dark:text-white">
                                        {article.title}
                                    </h4>
                                )}
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    {article.authors?.join(', ')} &bull; {article.journal} &bull; {article.year}
                                    {article.pmid && (
                                        <span className="ml-2 text-gray-400">PMID: {article.pmid}</span>
                                    )}
                                </p>
                            </div>
                        </div>

                        {/* Pipeline info */}
                        {article.filter_score_reason && (
                            <div className="mt-3 flex items-center gap-2 text-sm">
                                <span className="text-red-600 dark:text-red-400">
                                    Score: {article.filter_score?.toFixed(2)}
                                </span>
                                <span className="text-gray-400">&bull;</span>
                                <span className="text-gray-500 dark:text-gray-400">
                                    {article.filter_score_reason}
                                </span>
                            </div>
                        )}

                        {/* Expanded content */}
                        {expanded && (
                            <div className="mt-4 space-y-4">
                                {/* Abstract */}
                                {article.abstract && (
                                    <div>
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Abstract</span>
                                        <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/50 p-3 rounded mt-1">
                                            {article.abstract}
                                        </p>
                                    </div>
                                )}

                                {/* Curation Notes */}
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <ChatBubbleLeftIcon className="h-4 w-4 text-gray-400" />
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                            Curation Notes
                                        </span>
                                    </div>
                                    <textarea
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        placeholder="Add notes about why this article should or shouldn't be included..."
                                        rows={2}
                                        className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                    />
                                </div>

                                {/* Category selection for including */}
                                <div className="flex items-center gap-3">
                                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Include in category:</span>
                                    <select
                                        value={selectedCategory}
                                        onChange={(e) => setSelectedCategory(e.target.value)}
                                        className="text-sm border border-gray-200 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                    >
                                        <option value="">Select category...</option>
                                        {categories.map(cat => (
                                            <option key={cat.id} value={cat.id}>
                                                {cat.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex-shrink-0 flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => onInclude(selectedCategory || undefined)}
                            className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg"
                            title="Include in report"
                        >
                            <PlusIcon className="h-5 w-5" />
                        </button>
                        <button
                            type="button"
                            onClick={onToggleExpand}
                            className="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                        >
                            {expanded ? (
                                <ChevronUpIcon className="h-5 w-5" />
                            ) : (
                                <ChevronDownIcon className="h-5 w-5" />
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
