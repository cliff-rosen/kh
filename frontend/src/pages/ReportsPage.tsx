import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CalendarIcon, DocumentTextIcon, StarIcon, ChevronLeftIcon, ChevronRightIcon, Squares2X2Icon, ListBulletIcon, ChevronDownIcon, ChartBarIcon, Cog6ToothIcon, TrashIcon } from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';

import { Report, ReportWithArticles, ReportArticle } from '../types';
import { ResearchStream, Category } from '../types';
import { PayloadHandler } from '../types/chat';

import { reportApi } from '../lib/api/reportApi';
import { researchStreamApi } from '../lib/api/researchStreamApi';
import { useResearchStream } from '../context/ResearchStreamContext';
import PipelineAnalyticsModal from '../components/PipelineAnalyticsModal';
import ExecutionConfigModal from '../components/ExecutionConfigModal';
import ChatTray from '../components/chat/ChatTray';
import PubMedArticleCard, { PubMedArticleData } from '../components/chat/PubMedArticleCard';

type ReportView = 'all' | 'by-category';

export default function ReportsPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { researchStreams, loadResearchStreams } = useResearchStream();
    const [selectedStream, setSelectedStream] = useState('');
    const [reports, setReports] = useState<Report[]>([]);
    const [selectedReport, setSelectedReport] = useState<ReportWithArticles | null>(null);
    const [loadingReports, setLoadingReports] = useState(false);
    const [loadingReportDetails, setLoadingReportDetails] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [reportView, setReportView] = useState<ReportView>('all');
    const [streamDetails, setStreamDetails] = useState<ResearchStream | null>(null);
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
    const [showAnalytics, setShowAnalytics] = useState(false);
    const [showExecutionConfig, setShowExecutionConfig] = useState(false);
    const [executiveSummaryCollapsed, setExecutiveSummaryCollapsed] = useState(false);

    // Chat context for the general chat system
    const chatContext = useMemo(() => {
        if (!selectedReport) return undefined;
        return {
            current_page: 'reports',
            report_id: selectedReport.report_id,
            report_name: selectedReport.report_name,
            article_count: selectedReport.articles?.length || 0
        };
    }, [selectedReport]);

    // Payload handlers for ChatTray - handles custom payloads from the chat
    const payloadHandlers = useMemo<Record<string, PayloadHandler>>(() => ({
        pubmed_article: {
            render: (data: PubMedArticleData) => (
                <PubMedArticleCard article={data} />
            ),
            renderOptions: {
                panelWidth: '550px',
                headerTitle: 'PubMed Article',
                headerIcon: '📄'
            }
        }
    }), []);

    const hasStreams = researchStreams.length > 0;
    const isTestReport = selectedReport?.run_type?.toLowerCase() === 'test';

    const toggleCategory = (categoryId: string) => {
        setCollapsedCategories(prev => {
            const newSet = new Set(prev);
            if (newSet.has(categoryId)) {
                newSet.delete(categoryId);
            } else {
                newSet.add(categoryId);
            }
            return newSet;
        });
    };

    // Load research streams on mount
    useEffect(() => {
        loadResearchStreams();
    }, [loadResearchStreams]);

    // Set selected stream from URL parameter
    useEffect(() => {
        const streamParam = searchParams.get('stream');
        if (streamParam) {
            setSelectedStream(streamParam);
        }
    }, [searchParams]);

    // Load stream details and reports when stream is selected
    useEffect(() => {
        if (selectedStream) {
            const loadStreamAndReports = async () => {
                setLoadingReports(true);
                setError(null);
                setReports([]);
                setSelectedReport(null);
                setStreamDetails(null);
                try {
                    // Load stream details for presentation categories
                    const stream = await researchStreamApi.getResearchStream(Number(selectedStream));
                    setStreamDetails(stream);

                    // Load reports
                    const streamReports = await reportApi.getReportsForStream(Number(selectedStream));
                    setReports(streamReports);

                    // Auto-select report from URL param, or fall back to first report
                    const reportParam = searchParams.get('report');
                    if (reportParam) {
                        const reportId = Number(reportParam);
                        const report = streamReports.find(r => r.report_id === reportId);
                        if (report) {
                            loadReportDetails(reportId);
                        } else if (streamReports.length > 0) {
                            // Report not found, select first report
                            loadReportDetails(streamReports[0].report_id);
                        }
                    } else if (streamReports.length > 0) {
                        // No report param, select first report
                        loadReportDetails(streamReports[0].report_id);
                    }
                } catch (err: any) {
                    if (err.response?.status === 404) {
                        setError('no_reports');
                    } else {
                        setError('error');
                    }
                } finally {
                    setLoadingReports(false);
                }
            };
            loadStreamAndReports();
        }
    }, [selectedStream, searchParams]);

    const loadReportDetails = async (reportId: number) => {
        setLoadingReportDetails(true);
        setCollapsedCategories(new Set()); // Reset collapsed state when switching reports
        setExecutiveSummaryCollapsed(false); // Reset executive summary collapsed state
        try {
            const reportDetails = await reportApi.getReportWithArticles(reportId);
            setSelectedReport(reportDetails);
        } catch (err) {
            console.error('Error loading report details:', err);
        } finally {
            setLoadingReportDetails(false);
        }
    };

    const handleReportClick = (report: Report) => {
        loadReportDetails(report.report_id);
    };

    const handleDeleteReport = async (reportId: number, reportName: string) => {
        if (!confirm(`Are you sure you want to delete "${reportName}"? This action cannot be undone.`)) {
            return;
        }

        try {
            await reportApi.deleteReport(reportId);

            // Remove from local state
            const updatedReports = reports.filter(r => r.report_id !== reportId);
            setReports(updatedReports);

            // If we just deleted the selected report, select the first remaining report
            if (selectedReport?.report_id === reportId) {
                if (updatedReports.length > 0) {
                    loadReportDetails(updatedReports[0].report_id);
                } else {
                    setSelectedReport(null);
                }
            }
        } catch (err) {
            console.error('Error deleting report:', err);
            alert('Failed to delete report. Please try again.');
        }
    };

    // Helper function to organize articles by category
    const getArticlesByCategory = () => {
        if (!selectedReport || !streamDetails) return {};

        const categories = streamDetails.presentation_config?.categories || [];
        const categoryMap: Record<string, { category: Category; articles: ReportArticle[] }> = {};

        // Initialize with all categories
        categories.forEach(cat => {
            categoryMap[cat.id] = { category: cat, articles: [] };
        });

        // Add uncategorized bucket
        categoryMap['uncategorized'] = {
            category: { id: 'uncategorized', name: 'Uncategorized', topics: [], specific_inclusions: [] },
            articles: []
        };

        // Group articles by category
        // Each article is assigned to exactly one category (stored as single-item array)
        selectedReport.articles?.forEach(article => {
            if (!article.presentation_categories || article.presentation_categories.length === 0) {
                categoryMap['uncategorized'].articles.push(article);
            } else {
                // Article should have exactly one category
                const catId = article.presentation_categories[0];
                if (categoryMap[catId]) {
                    categoryMap[catId].articles.push(article);
                }
            }
        });

        // Filter out empty categories
        return Object.fromEntries(
            Object.entries(categoryMap).filter(([_, data]) => data.articles.length > 0)
        );
    };

    const ArticleCard = ({ article, showAbstract = false }: { article: ReportArticle; showAbstract?: boolean }) => (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                    <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                        {article.title}
                    </h4>
                    {article.authors && article.authors.length > 0 && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                            {article.authors.slice(0, 3).join(', ')}
                            {article.authors.length > 3 && ` et al.`}
                        </p>
                    )}
                    <div className="flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-500 mb-2">
                        {article.journal && <span>{article.journal}</span>}
                        {article.year && <span>• {article.year}</span>}
                        {article.pmid && <span>• PMID: {article.pmid}</span>}
                    </div>
                    {showAbstract && article.abstract && (
                        <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                                {article.abstract}
                            </p>
                        </div>
                    )}
                    {article.relevance_score && (
                        <div className="flex items-center gap-2 mt-2">
                            <div className="h-2 w-24 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-blue-600"
                                    style={{ width: `${article.relevance_score * 100}%` }}
                                ></div>
                            </div>
                            <span className="text-xs text-gray-600 dark:text-gray-400">
                                {Math.round(article.relevance_score * 100)}% relevant
                            </span>
                        </div>
                    )}
                    {article.relevance_rationale && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 italic">
                            {article.relevance_rationale}
                        </p>
                    )}
                </div>
                <button className="text-gray-400 hover:text-yellow-500 transition-colors">
                    {article.is_starred ? (
                        <StarIconSolid className="h-5 w-5 text-yellow-500" />
                    ) : (
                        <StarIcon className="h-5 w-5" />
                    )}
                </button>
            </div>
        </div>
    );

    return (
        <div className="w-full p-6">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                        Reports
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-2">
                        Generated reports from your research streams
                    </p>
                </div>
            </div>

            {hasStreams && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                Research Stream:
                            </label>
                            <select
                                value={selectedStream}
                                onChange={(e) => setSelectedStream(e.target.value)}
                                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white min-w-64"
                            >
                                <option value="">Select a research stream...</option>
                                {researchStreams.map(stream => (
                                    <option key={stream.stream_id} value={stream.stream_id}>
                                        {stream.stream_name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        {selectedStream && (
                            <button
                                onClick={() => navigate(`/streams/${selectedStream}/edit?tab=execute&subtab=pipeline`)}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                            >
                                <DocumentTextIcon className="h-5 w-5" />
                                Run Pipeline
                            </button>
                        )}
                    </div>
                </div>
            )}

            {!hasStreams ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                    <DocumentTextIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                        No Research Streams Created
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-2xl mx-auto">
                        You need to create a research stream before reports can be generated.
                    </p>
                </div>
            ) : !selectedStream ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                    <DocumentTextIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                        Select a Research Stream
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">
                        Choose a research stream above to view its reports.
                    </p>
                </div>
            ) : loadingReports ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600 dark:text-gray-400">Loading reports...</p>
                </div>
            ) : error === 'no_reports' || reports.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                    <DocumentTextIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                        No Reports Yet
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">
                        No reports have been generated for this research stream yet.
                    </p>
                </div>
            ) : (
                <div className="flex gap-6">
                    {/* Report List - Collapsible Left Panel */}
                    <div className={`transition-all duration-300 ${sidebarCollapsed ? 'w-12' : 'w-80'} flex-shrink-0`}>
                        <div className="sticky top-6">
                            {/* Collapse/Expand Button */}
                            <button
                                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                                className="w-full mb-4 flex items-center justify-center p-2 bg-white dark:bg-gray-800 rounded-lg shadow hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                            >
                                {sidebarCollapsed ? (
                                    <ChevronRightIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                                ) : (
                                    <ChevronLeftIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                                )}
                            </button>

                            {/* Reports List */}
                            {!sidebarCollapsed && (
                                <div className="space-y-4">
                                    {reports.map((report) => (
                                        <div
                                            key={report.report_id}
                                            className={`bg-white dark:bg-gray-800 rounded-lg shadow p-4 transition-all ${selectedReport?.report_id === report.report_id
                                                ? 'ring-2 ring-blue-600'
                                                : 'hover:shadow-md'
                                                }`}
                                        >
                                            <div className="flex items-start justify-between mb-2">
                                                <div
                                                    className="flex-1 cursor-pointer"
                                                    onClick={() => handleReportClick(report)}
                                                >
                                                    <h3 className="font-semibold text-gray-900 dark:text-white">
                                                        {report.report_name}
                                                    </h3>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                        {report.article_count || 0} articles
                                                    </p>
                                                    {report.retrieval_params?.start_date && report.retrieval_params?.end_date && (
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                            {new Date(report.retrieval_params.start_date).toLocaleDateString()} - {new Date(report.retrieval_params.end_date).toLocaleDateString()}
                                                        </p>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteReport(report.report_id, report.report_name);
                                                    }}
                                                    className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                                    title="Delete report"
                                                >
                                                    <TrashIcon className="h-5 w-5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Report Details - Right Panel */}
                    <div className="flex-1 min-w-0">
                        {loadingReportDetails ? (
                            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                                <p className="text-gray-600 dark:text-gray-400">Loading report details...</p>
                            </div>
                        ) : selectedReport ? (
                            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                                {/* Report Header */}
                                <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                                        {selectedReport.report_name}
                                    </h2>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                                        <span className="flex items-center gap-1">
                                            <CalendarIcon className="h-4 w-4" />
                                            Generated {new Date(selectedReport.created_at).toLocaleDateString()}
                                        </span>
                                        {selectedReport.retrieval_params?.start_date && selectedReport.retrieval_params?.end_date && (
                                            <span>
                                                Date Range: {new Date(selectedReport.retrieval_params.start_date).toLocaleDateString()} - {new Date(selectedReport.retrieval_params.end_date).toLocaleDateString()}
                                            </span>
                                        )}
                                        <span>{selectedReport.articles?.length || 0} articles</span>
                                        {selectedReport.key_highlights?.length > 0 && (
                                            <span>{selectedReport.key_highlights.length} key insights</span>
                                        )}
                                        {selectedReport.run_type && (
                                            <span className="inline-block px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 uppercase">
                                                {selectedReport.run_type}
                                            </span>
                                        )}
                                        </div>

                                        {/* View Selector and Analytics Button */}
                                        <div className="flex gap-4 items-center">
                                            {/* Article View Buttons */}
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => setReportView('all')}
                                                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                                        reportView === 'all'
                                                            ? 'bg-blue-600 text-white'
                                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                                    }`}
                                                >
                                                    <ListBulletIcon className="h-4 w-4" />
                                                    All Articles
                                                </button>
                                                <button
                                                    onClick={() => setReportView('by-category')}
                                                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                                        reportView === 'by-category'
                                                            ? 'bg-blue-600 text-white'
                                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                                    }`}
                                                >
                                                    <Squares2X2Icon className="h-4 w-4" />
                                                    By Category
                                                </button>
                                            </div>

                                            {/* Execution Config Button */}
                                            <button
                                                onClick={() => setShowExecutionConfig(true)}
                                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors bg-gray-600 hover:bg-gray-700 text-white"
                                                title="View execution configuration snapshot"
                                            >
                                                <Cog6ToothIcon className="h-3.5 w-3.5" />
                                                Config
                                            </button>

                                            {/* Pipeline Analytics Button (Test Reports Only) */}
                                            {isTestReport && (
                                                <button
                                                    onClick={() => setShowAnalytics(true)}
                                                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors bg-purple-600 hover:bg-purple-700 text-white"
                                                    title="View pipeline analytics and detailed metrics"
                                                >
                                                    <ChartBarIcon className="h-3.5 w-3.5" />
                                                    Analytics
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Report Content */}
                                <div className="p-6 space-y-6">
                                    {/* Executive Summary */}
                                    {selectedReport.enrichments?.executive_summary && (
                                        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                                            <button
                                                onClick={() => setExecutiveSummaryCollapsed(!executiveSummaryCollapsed)}
                                                className="w-full bg-gray-50 dark:bg-gray-800 px-4 py-3 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors text-left"
                                            >
                                                <div className="flex items-center gap-2">
                                                    {executiveSummaryCollapsed ? (
                                                        <ChevronRightIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                                                    ) : (
                                                        <ChevronDownIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                                                    )}
                                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                                        Executive Summary
                                                    </h3>
                                                </div>
                                            </button>
                                            {!executiveSummaryCollapsed && (
                                                <div className="bg-gray-50 dark:bg-gray-700 p-4">
                                                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                                                        {selectedReport.enrichments.executive_summary}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Key Highlights */}
                                    {selectedReport.key_highlights && selectedReport.key_highlights.length > 0 && (
                                        <div>
                                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                                                Key Highlights
                                            </h3>
                                            <ul className="list-disc list-inside space-y-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                                                {selectedReport.key_highlights.map((highlight, idx) => (
                                                    <li key={idx}>{highlight}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {/* Thematic Analysis */}
                                    {selectedReport.thematic_analysis && (
                                        <div>
                                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                                                Thematic Analysis
                                            </h3>
                                            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                                                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                                    {selectedReport.thematic_analysis}
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Articles - View based on selected mode */}
                                    {selectedReport.articles && selectedReport.articles.length > 0 && (
                                        <div>
                                            {reportView === 'all' ? (
                                                /* All Articles View */
                                                <div>
                                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                                                        Articles ({selectedReport.articles.length})
                                                    </h3>
                                                    <div className="space-y-3">
                                                        {selectedReport.articles.map((article) => (
                                                            <ArticleCard key={article.article_id} article={article} />
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : (
                                                /* By Category View */
                                                <div>
                                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                                                        Articles by Category ({selectedReport.articles.length})
                                                    </h3>
                                                    <div className="space-y-6">
                                                        {Object.entries(getArticlesByCategory()).map(([categoryId, data]) => {
                                                            const isCollapsed = collapsedCategories.has(categoryId);
                                                            return (
                                                                <div key={categoryId} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                                                                    {/* Category Header - Clickable */}
                                                                    <button
                                                                        onClick={() => toggleCategory(categoryId)}
                                                                        className="w-full bg-gray-50 dark:bg-gray-800 px-4 py-3 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors text-left"
                                                                    >
                                                                        <div className="flex items-center justify-between">
                                                                            <div className="flex items-center gap-2">
                                                                                {isCollapsed ? (
                                                                                    <ChevronRightIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                                                                                ) : (
                                                                                    <ChevronDownIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                                                                                )}
                                                                                <h4 className="font-semibold text-gray-900 dark:text-white">
                                                                                    {data.category.name}
                                                                                </h4>
                                                                            </div>
                                                                            <span className="text-sm text-gray-500 dark:text-gray-400">
                                                                                {data.articles.length} article{data.articles.length !== 1 ? 's' : ''}
                                                                            </span>
                                                                        </div>
                                                                        {!isCollapsed && data.category.topics.length > 0 && (
                                                                            <div className="mt-2 ml-7 flex flex-wrap gap-2">
                                                                                {data.category.topics.map((topic, idx) => (
                                                                                    <span
                                                                                        key={idx}
                                                                                        className="inline-block px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 rounded"
                                                                                    >
                                                                                        {topic}
                                                                                    </span>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </button>
                                                                    {/* Category Articles - Collapsible */}
                                                                    {!isCollapsed && (
                                                                        <div className="bg-white dark:bg-gray-900">
                                                                            {/* Category Summary */}
                                                                            {selectedReport.enrichments?.category_summaries?.[categoryId] && (
                                                                                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                                                                                    <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                                                                        Category Summary
                                                                                    </h5>
                                                                                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                                                                                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                                                                                            {selectedReport.enrichments.category_summaries[categoryId]}
                                                                                        </p>
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                            {/* Articles */}
                                                                            <div className="p-4 space-y-3">
                                                                                {data.articles.map((article) => (
                                                                                    <ArticleCard key={article.article_id} article={article} showAbstract={true} />
                                                                                ))}
                                                                            </div>
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
                            </div>
                        ) : (
                            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                                <DocumentTextIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                                <p className="text-gray-600 dark:text-gray-400">
                                    Select a report from the list to view details
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Pipeline Analytics Modal */}
            {showAnalytics && selectedReport && (
                <PipelineAnalyticsModal
                    reportId={selectedReport.report_id}
                    onClose={() => setShowAnalytics(false)}
                />
            )}

            {/* Execution Config Modal */}
            {showExecutionConfig && selectedReport && selectedReport.retrieval_params && (
                <ExecutionConfigModal
                    reportName={selectedReport.report_name}
                    retrievalParams={selectedReport.retrieval_params}
                    onClose={() => setShowExecutionConfig(false)}
                />
            )}

            {/* Chat Tray - uses general chat with report context */}
            {chatContext && <ChatTray initialContext={chatContext} payloadHandlers={payloadHandlers} />}
        </div>
    );
}
