/**
 * Execution Detail - Read-only view of a pipeline execution and its results
 *
 * Route: /operations/executions/:executionId
 * Features:
 * - View execution details (when ran, duration, filtering stats)
 * - View report output: executive summary, articles by category with summaries
 * - View pipeline details: filtered articles, duplicates, retrieval config
 * - Link to Curation for editing
 * - Email report functionality
 *
 * Note: Approval/rejection is done in the Curation screen, not here.
 */

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
    ArrowLeftIcon,
    CheckIcon,
    XMarkIcon,
    ChevronDownIcon,
    ChevronRightIcon,
    FunnelIcon,
    DocumentTextIcon,
    CheckCircleIcon,
    XCircleIcon,
    ArrowPathIcon,
    ExclamationTriangleIcon,
    EnvelopeIcon,
    PaperAirplaneIcon,
    PencilSquareIcon,
} from '@heroicons/react/24/outline';
import {
    getExecutionDetail,
} from '../../lib/api/operationsApi';
import { reportApi } from '../../lib/api/reportApi';
import type { ExecutionStatus, WipArticle, ExecutionDetail } from '../../types/research-stream';
import type { ReportWithArticles, ReportArticle } from '../../types/report';

export default function ExecutionDetail() {
    const { executionId } = useParams<{ executionId: string }>();
    const [execution, setExecution] = useState<ExecutionDetail | null>(null);
    const [report, setReport] = useState<ReportWithArticles | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingReport, setLoadingReport] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
    const [showPipelineDetails, setShowPipelineDetails] = useState(false);

    // Email state
    const [showEmailModal, setShowEmailModal] = useState(false);
    const [emailHtml, setEmailHtml] = useState<string | null>(null);
    const [emailStored, setEmailStored] = useState(false);
    const [emailLoading, setEmailLoading] = useState(false);
    const [emailError, setEmailError] = useState<string | null>(null);
    const [emailRecipient, setEmailRecipient] = useState('');
    const [sendingEmail, setSendingEmail] = useState(false);
    const [emailSendResult, setEmailSendResult] = useState<{ success: string[]; failed: string[] } | null>(null);

    // Fetch execution data
    useEffect(() => {
        async function fetchExecution() {
            if (!executionId) return;
            setLoading(true);
            setError(null);
            try {
                const data = await getExecutionDetail(executionId);
                setExecution(data);
            } catch (err) {
                setError('Failed to load execution details');
                console.error(err);
            } finally {
                setLoading(false);
            }
        }
        fetchExecution();
    }, [executionId]);

    // Fetch report data when execution has a report_id
    const reportId = execution?.report_id;
    useEffect(() => {
        async function fetchReport() {
            if (!reportId) {
                setReport(null);
                return;
            }
            setLoadingReport(true);
            try {
                const reportData = await reportApi.getReportWithArticles(reportId);
                setReport(reportData);
            } catch (err) {
                console.error('Failed to load report:', err);
                setReport(null);
            } finally {
                setLoadingReport(false);
            }
        }
        fetchReport();
    }, [reportId]);

    // Compute article counts for pipeline tabs from WIP articles
    const includedArticles = execution?.wip_articles.filter(a => a.included_in_report) || [];
    const duplicateArticles = execution?.wip_articles.filter(a => a.is_duplicate) || [];
    const filteredOutArticles = execution?.wip_articles.filter(a => !a.is_duplicate && a.passed_semantic_filter === false) || [];

    const toggleCategory = (categoryId: string) => {
        setExpandedCategories((prev) =>
            prev.includes(categoryId) ? prev.filter((id) => id !== categoryId) : [...prev, categoryId]
        );
    };

    // Group report articles by category
    const getArticlesByCategory = () => {
        if (!report?.articles) return {};

        const categoryMap: Record<string, ReportArticle[]> = {};

        report.articles.forEach(article => {
            const catId = article.presentation_categories?.[0] || 'uncategorized';
            if (!categoryMap[catId]) {
                categoryMap[catId] = [];
            }
            categoryMap[catId].push(article);
        });

        return categoryMap;
    };

    // Email handlers
    const handleGenerateEmail = async () => {
        if (!execution?.report_id) return;
        setEmailLoading(true);
        setEmailError(null);
        try {
            const result = await reportApi.generateReportEmail(execution.report_id);
            setEmailHtml(result.html);
            setEmailStored(false);
        } catch (err) {
            console.error('Failed to generate email:', err);
            setEmailError('Failed to generate email');
        } finally {
            setEmailLoading(false);
        }
    };

    const handleStoreEmail = async () => {
        if (!execution?.report_id || !emailHtml) return;
        setEmailLoading(true);
        setEmailError(null);
        try {
            await reportApi.storeReportEmail(execution.report_id, emailHtml);
            setEmailStored(true);
        } catch (err) {
            console.error('Failed to store email:', err);
            setEmailError('Failed to store email');
        } finally {
            setEmailLoading(false);
        }
    };

    const handleLoadStoredEmail = async () => {
        if (!execution?.report_id) return;
        setEmailLoading(true);
        setEmailError(null);
        try {
            const result = await reportApi.getReportEmail(execution.report_id);
            setEmailHtml(result.html);
            setEmailStored(true);
        } catch (err: any) {
            if (err?.response?.status === 404) {
                setEmailError('No stored email found. Generate one first.');
            } else {
                console.error('Failed to load email:', err);
                setEmailError('Failed to load email');
            }
        } finally {
            setEmailLoading(false);
        }
    };

    const handleSendEmail = async () => {
        if (!execution?.report_id || !emailRecipient.trim() || !emailStored) return;
        setSendingEmail(true);
        setEmailSendResult(null);
        try {
            const result = await reportApi.sendReportEmail(execution.report_id, [emailRecipient.trim()]);
            setEmailSendResult(result);
            if (result.success.length > 0) {
                setEmailRecipient('');
            }
        } catch (err) {
            console.error('Failed to send email:', err);
            setEmailError('Failed to send email');
        } finally {
            setSendingEmail(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <ArrowPathIcon className="h-8 w-8 text-gray-400 animate-spin" />
            </div>
        );
    }

    if (error || !execution) {
        return (
            <div className="space-y-4">
                <Link to="/operations" className="flex items-center gap-2 text-blue-600 hover:underline">
                    <ArrowLeftIcon className="h-4 w-4" />
                    Back to Execution Queue
                </Link>
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
                    {error || 'Execution not found'}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link to="/operations" className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                        <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            {execution.report_name || `Execution: ${execution.stream_name}`}
                        </h1>
                        <p className="text-gray-600 dark:text-gray-400">
                            {execution.stream_name} · {execution.article_count} articles · {execution.run_type}
                        </p>
                    </div>
                </div>
                {execution.report_id && (
                    <Link
                        to={`/operations/reports/${execution.report_id}/curate`}
                        className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 font-medium"
                    >
                        <PencilSquareIcon className="h-5 w-5" />
                        Go to Curation
                    </Link>
                )}
            </div>

            {/* Execution Details - Organized Layout */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                {/* Top Row: Status, Timing, Metrics, Approval */}
                <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 border-b border-gray-200 dark:border-gray-700">
                    {/* Status & Type */}
                    <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Status</p>
                        <div className="flex items-center gap-2 flex-wrap">
                            <ExecutionStatusBadge status={execution.execution_status} />
                            {execution.report_id && execution.approval_status && (
                                <>
                                    <span className="text-gray-300 dark:text-gray-600">→</span>
                                    <ApprovalStatusBadge status={execution.approval_status} />
                                </>
                            )}
                            <span className="text-xs text-gray-500 capitalize">({execution.run_type})</span>
                        </div>
                        {execution.approved_by && (
                            <p className="text-xs text-gray-400 mt-1">
                                by {execution.approved_by}
                                {execution.approved_at && ` on ${new Date(execution.approved_at).toLocaleDateString()}`}
                            </p>
                        )}
                    </div>

                    {/* Date Range */}
                    <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Search Period</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {execution.start_date && execution.end_date
                                ? `${execution.start_date} → ${execution.end_date}`
                                : 'N/A'}
                        </p>
                    </div>

                    {/* Completed */}
                    <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Completed</p>
                        {execution.completed_at ? (
                            <>
                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                    {new Date(execution.completed_at).toLocaleString()}
                                </p>
                                {execution.started_at && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        ({Math.round((new Date(execution.completed_at).getTime() - new Date(execution.started_at).getTime()) / 60000)} min duration)
                                    </p>
                                )}
                            </>
                        ) : execution.started_at ? (
                            <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">In progress...</p>
                        ) : (
                            <p className="text-sm text-gray-400">N/A</p>
                        )}
                    </div>

                    {/* Pipeline Metrics - Enhanced Funnel */}
                    <div className="col-span-2 md:col-span-1">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Article Funnel</p>
                        {(() => {
                            // Compute stats from WIP articles
                            const wip = execution?.wip_articles || [];
                            const retrieved = wip.length;
                            const duplicates = wip.filter(a => a.is_duplicate).length;
                            const filtered = wip.filter(a => !a.is_duplicate && a.passed_semantic_filter === false).length;
                            const pipelineIncluded = wip.filter(a => !a.is_duplicate && a.passed_semantic_filter === true).length;
                            const curatorAdded = wip.filter(a => a.curator_included).length;
                            const curatorRemoved = wip.filter(a => a.curator_excluded).length;
                            const finalCount = includedArticles.length;

                            return (
                                <div className="space-y-1">
                                    <div className="flex items-center gap-1 text-sm flex-wrap">
                                        <span className="text-gray-500 dark:text-gray-400">Pipeline:</span>
                                        <span className="font-medium text-gray-700 dark:text-gray-300" title="Retrieved">
                                            {retrieved}
                                        </span>
                                        <span className="text-gray-400">→</span>
                                        <span className="text-gray-500" title={`${duplicates} duplicates removed`}>
                                            -{duplicates} dup
                                        </span>
                                        <span className="text-gray-400">→</span>
                                        <span className="text-gray-500" title={`${filtered} filtered out`}>
                                            -{filtered} filt
                                        </span>
                                        <span className="text-gray-400">→</span>
                                        <span className="font-medium text-gray-700 dark:text-gray-300" title="Pipeline included">
                                            {pipelineIncluded}
                                        </span>
                                    </div>
                                    {(curatorAdded > 0 || curatorRemoved > 0) && (
                                        <div className="flex items-center gap-2 text-sm">
                                            <span className="text-gray-500 dark:text-gray-400">Curation:</span>
                                            {curatorAdded > 0 && (
                                                <span className="text-green-600 dark:text-green-400" title="Curator added">
                                                    +{curatorAdded}
                                                </span>
                                            )}
                                            {curatorRemoved > 0 && (
                                                <span className="text-red-600 dark:text-red-400" title="Curator removed">
                                                    -{curatorRemoved}
                                                </span>
                                            )}
                                            <span className="text-gray-400">→</span>
                                            <span className="font-bold text-blue-600 dark:text-blue-400" title="Final count">
                                                {finalCount} final
                                            </span>
                                        </div>
                                    )}
                                    {curatorAdded === 0 && curatorRemoved === 0 && (
                                        <div className="text-sm">
                                            <span className="font-bold text-blue-600 dark:text-blue-400">
                                                {finalCount} articles in report
                                            </span>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                </div>

                {/* Error display */}
                {execution.execution_status === 'failed' && execution.error && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
                        <div className="flex items-start gap-2">
                            <ExclamationTriangleIcon className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5" />
                            <p className="text-sm text-red-700 dark:text-red-300">{execution.error}</p>
                        </div>
                    </div>
                )}

                {/* Rejection reason */}
                {execution.rejection_reason && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
                        <p className="text-sm text-red-700 dark:text-red-300">
                            <span className="font-medium">Rejection Reason:</span> {execution.rejection_reason}
                        </p>
                    </div>
                )}

                {/* Retrieval Configuration - Collapsible */}
                <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                    {execution.retrieval_config ? (
                        <RetrievalConfigDisplay config={execution.retrieval_config} />
                    ) : (
                        <p className="text-sm text-gray-400 italic">No retrieval configuration stored for this execution</p>
                    )}
                </div>
            </div>

            {/* Section 1: Report Output (Primary) */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <DocumentTextIcon className="h-5 w-5 text-gray-400" />
                        Report Output
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        What will be sent to subscribers - verify summaries are correct
                    </p>
                </div>

                <div className="p-4">
                    {(
                        <div className="space-y-6">
                            {loadingReport ? (
                                <div className="flex items-center justify-center py-12">
                                    <ArrowPathIcon className="h-8 w-8 text-gray-400 animate-spin" />
                                    <span className="ml-2 text-gray-500">Loading report...</span>
                                </div>
                            ) : !report ? (
                                <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                                    No report available for this execution
                                </p>
                            ) : (
                                <>
                                    {/* Report Header */}
                                    <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                                                    {report.report_name}
                                                </h2>
                                                <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 dark:text-gray-400">
                                                    <span>{report.articles?.length || 0} articles</span>
                                                    {execution.start_date && execution.end_date && (
                                                        <span>Date range: {execution.start_date} to {execution.end_date}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setShowEmailModal(true)}
                                                className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors flex items-center gap-2"
                                                title="Email Report"
                                            >
                                                <EnvelopeIcon className="h-5 w-5" />
                                                <span className="text-sm">Email</span>
                                                {emailStored && (
                                                    <CheckCircleIcon className="h-4 w-4 text-green-500" />
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Executive Summary */}
                                    {report.enrichments?.executive_summary && (
                                        <div>
                                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                                                <DocumentTextIcon className="h-5 w-5 text-gray-400" />
                                                Executive Summary
                                            </h3>
                                            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                                                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                                                    {report.enrichments.executive_summary}
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Articles by Category */}
                                    {report.articles && report.articles.length > 0 ? (
                                        <div>
                                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                                                Articles ({report.articles.length})
                                            </h3>
                                            {Object.entries(getArticlesByCategory()).map(([categoryId, articles]) => {
                                                const isExpanded = expandedCategories.includes(categoryId);
                                                const categoryName = categoryId === 'uncategorized'
                                                    ? 'Uncategorized'
                                                    : categoryId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                                                const categorySummary = report.enrichments?.category_summaries?.[categoryId];

                                                return (
                                                    <div key={categoryId} className="border border-gray-200 dark:border-gray-700 rounded-lg mb-3 overflow-hidden">
                                                        <button
                                                            onClick={() => toggleCategory(categoryId)}
                                                            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 bg-gray-50 dark:bg-gray-800"
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                {isExpanded ? (
                                                                    <ChevronDownIcon className="h-4 w-4 text-gray-400" />
                                                                ) : (
                                                                    <ChevronRightIcon className="h-4 w-4 text-gray-400" />
                                                                )}
                                                                <span className="font-medium text-gray-900 dark:text-white">{categoryName}</span>
                                                                <span className="text-sm text-gray-500 dark:text-gray-400">
                                                                    ({articles.length} article{articles.length !== 1 ? 's' : ''})
                                                                </span>
                                                            </div>
                                                        </button>

                                                        {isExpanded && (
                                                            <div className="bg-white dark:bg-gray-900">
                                                                {/* Category Summary */}
                                                                {categorySummary && (
                                                                    <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                                                                        <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                                                            Category Summary
                                                                        </h5>
                                                                        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                                                                            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                                                                                {categorySummary}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {/* Articles */}
                                                                <div className="p-4 space-y-3">
                                                                    {articles.map((article) => (
                                                                        <ReportArticleCard key={article.article_id} article={article} />
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                                            No articles in this report
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Section 2: Pipeline Details (Collapsible) */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                <button
                    onClick={() => setShowPipelineDetails(!showPipelineDetails)}
                    className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg"
                >
                    <div className="flex items-center gap-2">
                        <FunnelIcon className="h-5 w-5 text-gray-400" />
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                            Pipeline Details
                        </h2>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                            ({filteredOutArticles.length} filtered, {duplicateArticles.length} duplicates)
                        </span>
                    </div>
                    {showPipelineDetails ? (
                        <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                    ) : (
                        <ChevronRightIcon className="h-5 w-5 text-gray-400" />
                    )}
                </button>

                {showPipelineDetails && (
                    <div className="border-t border-gray-200 dark:border-gray-700">
                        {/* Filtered Out Articles */}
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                                <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                                    {filteredOutArticles.length}
                                </span>
                                Filtered Out
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                                Articles that did not pass the semantic filter
                            </p>
                            {filteredOutArticles.length > 0 ? (
                                <div className="space-y-2 max-h-96 overflow-y-auto">
                                    {filteredOutArticles.map((article) => (
                                        <WipArticleCard key={article.id} article={article} type="filtered" />
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-400 italic">No articles filtered out</p>
                            )}
                        </div>

                        {/* Duplicate Articles */}
                        <div className="p-4">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                                <span className="px-2 py-0.5 text-xs rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                                    {duplicateArticles.length}
                                </span>
                                Duplicates
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                                Articles detected as duplicates of existing articles
                            </p>
                            {duplicateArticles.length > 0 ? (
                                <div className="space-y-2 max-h-96 overflow-y-auto">
                                    {duplicateArticles.map((article) => (
                                        <WipArticleCard key={article.id} article={article} type="duplicate" />
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-400 italic">No duplicates detected</p>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Email Modal */}
            {showEmailModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex flex-col">
                    <div className="bg-white dark:bg-gray-800 w-screen h-screen flex flex-col">
                        {/* Modal Header with Controls */}
                        <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                        <EnvelopeIcon className="h-5 w-5" />
                                        Email Report
                                    </h2>
                                    {emailStored && (
                                        <span className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                                            <CheckCircleIcon className="h-4 w-4" />
                                            Stored
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={() => setShowEmailModal(false)}
                                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                                >
                                    <XMarkIcon className="h-5 w-5 text-gray-500" />
                                </button>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex flex-wrap items-center gap-3 mt-4">
                                <button
                                    onClick={handleLoadStoredEmail}
                                    disabled={emailLoading}
                                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {emailLoading ? (
                                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <EnvelopeIcon className="h-4 w-4" />
                                    )}
                                    Load Stored
                                </button>
                                <button
                                    onClick={handleGenerateEmail}
                                    disabled={emailLoading}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {emailLoading ? (
                                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <ArrowPathIcon className="h-4 w-4" />
                                    )}
                                    Generate Email
                                </button>
                                {emailHtml && !emailStored && (
                                    <button
                                        onClick={handleStoreEmail}
                                        disabled={emailLoading}
                                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                                    >
                                        <CheckIcon className="h-4 w-4" />
                                        Store Email
                                    </button>
                                )}

                                {/* Divider */}
                                {emailStored && <div className="h-8 w-px bg-gray-300 dark:bg-gray-600 mx-2" />}

                                {/* Send Email Form */}
                                {emailStored && (
                                    <>
                                        <input
                                            type="email"
                                            value={emailRecipient}
                                            onChange={(e) => setEmailRecipient(e.target.value)}
                                            placeholder="recipient@example.com"
                                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white w-64"
                                        />
                                        <button
                                            onClick={handleSendEmail}
                                            disabled={sendingEmail || !emailRecipient.trim()}
                                            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
                                        >
                                            {sendingEmail ? (
                                                <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <PaperAirplaneIcon className="h-4 w-4" />
                                            )}
                                            Send
                                        </button>
                                    </>
                                )}

                                {/* Send Result */}
                                {emailSendResult && (
                                    <span className="text-sm">
                                        {emailSendResult.success.length > 0 && (
                                            <span className="text-green-600 dark:text-green-400">
                                                Sent to {emailSendResult.success.join(', ')}
                                            </span>
                                        )}
                                        {emailSendResult.failed.length > 0 && (
                                            <span className="text-red-600 dark:text-red-400">
                                                Failed: {emailSendResult.failed.join(', ')}
                                            </span>
                                        )}
                                    </span>
                                )}
                            </div>

                            {/* Error Display */}
                            {emailError && (
                                <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
                                    {emailError}
                                </div>
                            )}
                        </div>

                        {/* Email Preview Area */}
                        <div className="flex-1 overflow-hidden">
                            {emailHtml ? (
                                <iframe
                                    srcDoc={emailHtml}
                                    title="Email Preview"
                                    className="w-full h-full bg-white"
                                    sandbox="allow-same-origin"
                                />
                            ) : (
                                <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                                    <div className="text-center">
                                        <EnvelopeIcon className="h-16 w-16 mx-auto mb-4 opacity-50" />
                                        <p className="text-lg">No email preview</p>
                                        <p className="text-sm mt-1">Click "Load Stored" to load existing email or "Generate Email" to create a new one</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Card for displaying articles in report preview
function ReportArticleCard({ article }: { article: ReportArticle }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
            <div className="flex items-start gap-2">
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="mt-0.5 text-gray-400 hover:text-gray-600"
                >
                    {expanded ? (
                        <ChevronDownIcon className="h-4 w-4" />
                    ) : (
                        <ChevronRightIcon className="h-4 w-4" />
                    )}
                </button>
                <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-gray-900 dark:text-white text-sm">
                        <a
                            href={`https://pubmed.ncbi.nlm.nih.gov/${article.pmid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                        >
                            {article.title}
                        </a>
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {article.authors.join(', ')}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                        {article.journal} · {article.year} · PMID: {article.pmid}
                    </p>
                    {article.relevance_score != null && (
                        <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded mt-1 inline-block">
                            {(article.relevance_score * 100).toFixed(0)}% relevant
                        </span>
                    )}
                </div>
            </div>

            {/* Expanded content - abstract */}
            {expanded && article.abstract && (
                <div className="mt-3 ml-6 p-3 bg-gray-50 dark:bg-gray-900 rounded text-sm text-gray-600 dark:text-gray-400">
                    <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Abstract</p>
                    {article.abstract}
                </div>
            )}
        </div>
    );
}

function ExecutionStatusBadge({ status }: { status: ExecutionStatus }) {
    const config: Record<ExecutionStatus, { bg: string; text: string; label: string }> = {
        pending: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-700 dark:text-gray-300', label: 'Pending' },
        running: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', label: 'Running' },
        completed: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', label: 'Completed' },
        failed: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', label: 'Failed' },
    };
    const { bg, text, label } = config[status];
    return <span className={`inline-flex items-center px-2 py-1 text-sm font-medium rounded ${bg} ${text}`}>{label}</span>;
}

function ApprovalStatusBadge({ status }: { status: string | null }) {
    const config: Record<string, { bg: string; text: string; icon: typeof CheckCircleIcon | null; label: string }> = {
        awaiting_approval: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300', icon: null, label: 'Awaiting Approval' },
        approved: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', icon: CheckCircleIcon, label: 'Approved' },
        rejected: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', icon: XCircleIcon, label: 'Rejected' },
    };
    if (!status || !config[status]) {
        return <span className="inline-flex items-center px-2 py-1 text-sm font-medium rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">Unknown</span>;
    }
    const { bg, text, icon: Icon, label } = config[status];
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-1 text-sm font-medium rounded ${bg} ${text}`}>
            {Icon && <Icon className="h-4 w-4" />}
            {label}
        </span>
    );
}

// Display retrieval configuration - PubMed query and semantic filter
interface RetrievalConfigProps {
    config: Record<string, unknown>;
}

interface BroadQueryConfig {
    query_id: string;
    query_expression: string;
    semantic_filter?: {
        enabled: boolean;
        criteria: string;
        threshold?: number;
    };
}

interface ConceptConfig {
    concept_id: string;
    name: string;
    source_queries?: Record<string, { query_expression: string; enabled: boolean }>;
    semantic_filter?: {
        enabled: boolean;
        criteria: string;
        threshold?: number;
    };
}

function RetrievalConfigDisplay({ config }: RetrievalConfigProps) {
    const [showQuery, setShowQuery] = useState(false);
    const [showFilter, setShowFilter] = useState(false);
    const [showRaw, setShowRaw] = useState(false);

    // Extract from broad_search (one retrieval method)
    const broadSearch = config.broad_search as { queries: BroadQueryConfig[] } | undefined;
    const broadQueries = broadSearch?.queries || [];

    // Extract from concepts (alternative retrieval method)
    const concepts = config.concepts as ConceptConfig[] | undefined;

    // Get query expressions from broad_search
    let pubmedQuery = broadQueries.map(q => q.query_expression).filter(Boolean).join('\n\nOR\n\n');

    // If no broad_search, try to get queries from concepts
    if (!pubmedQuery && concepts && concepts.length > 0) {
        const conceptQueries = concepts
            .filter(c => c.source_queries?.pubmed?.enabled && c.source_queries?.pubmed?.query_expression)
            .map(c => `# ${c.name}\n${c.source_queries!.pubmed.query_expression}`)
            .filter(Boolean);
        pubmedQuery = conceptQueries.join('\n\n---\n\n');
    }

    // Get semantic filters from broad_search
    let semanticFilter = broadQueries
        .filter(q => q.semantic_filter?.enabled && q.semantic_filter?.criteria)
        .map(q => q.semantic_filter!.criteria)
        .join('\n\n---\n\n');

    // If no broad_search filters, try to get filters from concepts
    if (!semanticFilter && concepts && concepts.length > 0) {
        const conceptFilters = concepts
            .filter(c => c.semantic_filter?.enabled && c.semantic_filter?.criteria)
            .map(c => `# ${c.name}\n${c.semantic_filter!.criteria}`)
            .filter(Boolean);
        semanticFilter = conceptFilters.join('\n\n---\n\n');
    }

    if (!pubmedQuery && !semanticFilter) {
        return (
            <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400 italic">No query data available</span>
                <button
                    onClick={() => setShowRaw(!showRaw)}
                    className="text-xs text-gray-400 hover:text-gray-600 underline"
                >
                    {showRaw ? 'Hide' : 'Show'} raw config
                </button>
                {showRaw && (
                    <pre className="mt-2 text-xs bg-gray-100 dark:bg-gray-900 p-2 rounded overflow-auto max-h-40 w-full">
                        {JSON.stringify(config, null, 2)}
                    </pre>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-wrap items-center gap-2">
            {/* PubMed Query Button */}
            {pubmedQuery && (
                <button
                    onClick={() => setShowQuery(!showQuery)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                        showQuery
                            ? 'bg-purple-100 dark:bg-purple-900/30 border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300'
                            : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                >
                    <DocumentTextIcon className="h-4 w-4" />
                    PubMed Query
                    {showQuery ? <ChevronDownIcon className="h-3 w-3" /> : <ChevronRightIcon className="h-3 w-3" />}
                </button>
            )}

            {/* Semantic Filter Button */}
            {semanticFilter && (
                <button
                    onClick={() => setShowFilter(!showFilter)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                        showFilter
                            ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                            : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                >
                    <FunnelIcon className="h-4 w-4" />
                    Semantic Filter
                    {showFilter ? <ChevronDownIcon className="h-3 w-3" /> : <ChevronRightIcon className="h-3 w-3" />}
                </button>
            )}

            {/* Raw Config Link */}
            <button
                onClick={() => setShowRaw(!showRaw)}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline ml-2"
            >
                {showRaw ? 'Hide' : 'Show'} raw
            </button>

            {/* Expanded Content */}
            {(showQuery || showFilter || showRaw) && (
                <div className="w-full mt-3 space-y-3">
                    {showQuery && (
                        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3">
                            <p className="text-xs font-medium text-purple-700 dark:text-purple-300 mb-2">PubMed Query</p>
                            <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono">
                                {pubmedQuery}
                            </pre>
                        </div>
                    )}

                    {showFilter && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                            <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-2">Semantic Filter Criteria</p>
                            <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                                {semanticFilter}
                            </p>
                        </div>
                    )}

                    {showRaw && (
                        <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Raw Configuration</p>
                            <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-auto max-h-60">
                                {JSON.stringify(config, null, 2)}
                            </pre>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// Card for displaying WIP articles in pipeline tabs
function WipArticleCard({ article, type }: { article: WipArticle; type: 'included' | 'duplicate' | 'filtered' }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
            <div className="flex items-start gap-2">
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="mt-0.5 text-gray-400 hover:text-gray-600"
                >
                    {expanded ? (
                        <ChevronDownIcon className="h-4 w-4" />
                    ) : (
                        <ChevronRightIcon className="h-4 w-4" />
                    )}
                </button>
                <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-gray-900 dark:text-white text-sm">
                        <a
                            href={`https://pubmed.ncbi.nlm.nih.gov/${article.pmid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                        >
                            {article.title}
                        </a>
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {article.authors.join(', ')}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                        {article.journal} · {article.year} · PMID: {article.pmid}
                    </p>

                    {/* Status indicator */}
                    <div className="mt-2">
                        {type === 'duplicate' && (
                            <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                                Duplicate of article #{article.duplicate_of_id}
                            </span>
                        )}
                        {type === 'filtered' && (
                            <div className="space-y-1">
                                {article.filter_rejection_reason && (
                                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                                        {article.filter_rejection_reason}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Expanded content - abstract */}
            {expanded && article.abstract && (
                <div className="mt-3 ml-6 p-3 bg-gray-50 dark:bg-gray-900 rounded text-sm text-gray-600 dark:text-gray-400">
                    <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Abstract</p>
                    {article.abstract}
                </div>
            )}
        </div>
    );
}
