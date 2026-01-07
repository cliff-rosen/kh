import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { DocumentTextIcon, ChevronDownIcon, ChevronRightIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';

import { Report, ReportWithArticles, ReportArticle } from '../types';
import { ResearchStream, Category } from '../types';
import { PayloadHandler } from '../types/chat';

import { reportApi } from '../lib/api/reportApi';
import { researchStreamApi } from '../lib/api/researchStreamApi';
import { showErrorToast } from '../lib/errorToast';
import { useResearchStream } from '../context/ResearchStreamContext';
import { useAuth } from '../context/AuthContext';
import { useTracking } from '../hooks/useTracking';

import PipelineAnalyticsModal from '../components/stream/PipelineAnalyticsModal';
import ExecutionConfigModal from '../components/stream/ExecutionConfigModal';
import ArticleViewerModal from '../components/articles/ArticleViewerModal';
import ChatTray from '../components/chat/ChatTray';
import PubMedArticleCard, { PubMedArticleData } from '../components/chat/PubMedArticleCard';

import {
    ReportArticleTable,
    ReportStreamSelector,
    ReportSidebar,
    ReportHeader,
    ReportArticleCard,
    ReportView,
    CardFormat
} from '../components/reports';

export default function ReportsPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { researchStreams, loadResearchStreams } = useResearchStream();
    const { isPlatformAdmin, isOrgAdmin } = useAuth();
    const { track, trackViewChange, trackChatOpen, trackChatClose } = useTracking({ defaultContext: { page: 'reports' } });

    // Stream and report state
    const [selectedStream, setSelectedStream] = useState('');
    const [reports, setReports] = useState<Report[]>([]);
    const [selectedReport, setSelectedReport] = useState<ReportWithArticles | null>(null);
    const [streamDetails, setStreamDetails] = useState<ResearchStream | null>(null);

    // Loading state
    const [loadingReports, setLoadingReports] = useState(false);
    const [loadingReportDetails, setLoadingReportDetails] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // UI state
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [reportView, setReportView] = useState<ReportView>('all');
    const [cardFormat, setCardFormat] = useState<CardFormat>('compact');
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
    const [executiveSummaryCollapsed, setExecutiveSummaryCollapsed] = useState(false);

    // Modal state
    const [showAnalytics, setShowAnalytics] = useState(false);
    const [showExecutionConfig, setShowExecutionConfig] = useState(false);

    // Chat state
    const [isChatOpen, setIsChatOpen] = useState(false);

    // Article viewer modal state
    const [articleViewerOpen, setArticleViewerOpen] = useState(false);
    const [articleViewerArticles, setArticleViewerArticles] = useState<ReportArticle[]>([]);
    const [articleViewerInitialIndex, setArticleViewerInitialIndex] = useState(0);
    const [articleViewerIsFiltered, setArticleViewerIsFiltered] = useState(false);

    const hasStreams = researchStreams.length > 0;
    const hasPipelineData = selectedReport?.pipeline_execution_id != null;

    // Handle article updates from the modal (notes, enrichments)
    const handleArticleUpdate = useCallback((articleId: number, updates: { notes?: string; ai_enrichments?: any }) => {
        setArticleViewerArticles(prev => prev.map(article =>
            article.article_id === articleId ? { ...article, ...updates } : article
        ));

        if (selectedReport) {
            setSelectedReport(prev => prev ? {
                ...prev,
                articles: prev.articles?.map(article =>
                    article.article_id === articleId ? { ...article, ...updates } : article
                )
            } : null);
        }
    }, [selectedReport]);

    // Chat context for the general chat system
    const chatContext = useMemo(() => {
        const context: Record<string, any> = { current_page: 'reports' };
        if (selectedStream) {
            context.stream_id = parseInt(selectedStream, 10);
            if (streamDetails) {
                context.stream_name = streamDetails.stream_name;
            }
        }
        if (selectedReport) {
            context.report_id = selectedReport.report_id;
            context.report_name = selectedReport.report_name;
            context.article_count = selectedReport.articles?.length || 0;
        }
        return context;
    }, [selectedReport, selectedStream, streamDetails]);

    // Payload handlers for ChatTray
    const payloadHandlers = useMemo<Record<string, PayloadHandler>>(() => ({
        pubmed_article: {
            render: (data: PubMedArticleData) => <PubMedArticleCard article={data} />,
            renderOptions: {
                panelWidth: '550px',
                headerTitle: 'PubMed Article',
                headerIcon: '📄'
            }
        }
    }), []);

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
                    const stream = await researchStreamApi.getResearchStream(Number(selectedStream));
                    setStreamDetails(stream);

                    const streamReports = await reportApi.getReportsForStream(Number(selectedStream));
                    setReports(streamReports);

                    const reportParam = searchParams.get('report');
                    if (reportParam) {
                        const reportId = Number(reportParam);
                        const report = streamReports.find(r => r.report_id === reportId);
                        if (report) {
                            loadReportDetails(reportId);
                        } else if (streamReports.length > 0) {
                            loadReportDetails(streamReports[0].report_id);
                        }
                    } else if (streamReports.length > 0) {
                        loadReportDetails(streamReports[0].report_id);
                    }
                } catch (err: any) {
                    if (err.response?.status === 404) {
                        setError('no_reports');
                    } else {
                        setError('error');
                        showErrorToast(err, 'Failed to load reports');
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
        setCollapsedCategories(new Set());
        setExecutiveSummaryCollapsed(false);
        try {
            const reportDetails = await reportApi.getReportWithArticles(reportId);
            setSelectedReport(reportDetails);
        } catch (err) {
            showErrorToast(err, 'Failed to load report');
        } finally {
            setLoadingReportDetails(false);
        }
    };

    const handleReportClick = (report: Report) => {
        track('report_select', { report_id: report.report_id, report_name: report.report_name });
        loadReportDetails(report.report_id);
    };

    const handleDeleteReport = async (reportId: number, reportName: string) => {
        if (!confirm(`Are you sure you want to delete "${reportName}"? This action cannot be undone.`)) {
            return;
        }

        track('report_delete', { report_id: reportId, report_name: reportName });

        try {
            await reportApi.deleteReport(reportId);
            const updatedReports = reports.filter(r => r.report_id !== reportId);
            setReports(updatedReports);

            if (selectedReport?.report_id === reportId) {
                if (updatedReports.length > 0) {
                    loadReportDetails(updatedReports[0].report_id);
                } else {
                    setSelectedReport(null);
                }
            }
        } catch (err) {
            showErrorToast(err, 'Failed to delete report');
        }
    };

    const handleStreamChange = (streamId: string) => {
        setSelectedStream(streamId);
        if (streamId) {
            const stream = researchStreams.find(s => s.stream_id.toString() === streamId);
            track('stream_select', { stream_id: parseInt(streamId, 10), stream_name: stream?.stream_name });
        }
    };

    const handleViewChange = (view: ReportView) => {
        if (reportView !== view) {
            trackViewChange(reportView, view, 'reports');
            setReportView(view);
        }
    };

    const handleCardFormatChange = (format: CardFormat) => {
        if (cardFormat !== format) {
            track('card_format_change', { from: cardFormat, to: format });
            setCardFormat(format);
        }
    };

    const openArticleViewer = (articles: ReportArticle[], clickedIndex: number, isFiltered = false) => {
        const article = articles[clickedIndex];
        track('article_open', {
            pmid: article.pmid || undefined,
            article_id: article.article_id,
            report_id: selectedReport?.report_id,
            is_filtered: isFiltered
        });
        setArticleViewerArticles(articles);
        setArticleViewerInitialIndex(clickedIndex);
        setArticleViewerIsFiltered(isFiltered);
        setArticleViewerOpen(true);
    };

    const toggleCategory = (categoryId: string) => {
        setCollapsedCategories(prev => {
            const newSet = new Set(prev);
            const willCollapse = !newSet.has(categoryId);
            if (newSet.has(categoryId)) {
                newSet.delete(categoryId);
            } else {
                newSet.add(categoryId);
            }
            track('category_toggle', { category: categoryId, collapsed: willCollapse });
            return newSet;
        });
    };

    // Helper function to organize articles by category
    const getArticlesByCategory = () => {
        if (!selectedReport || !streamDetails) return {};

        const categories = streamDetails.presentation_config?.categories || [];
        const categoryMap: Record<string, { category: Category; articles: ReportArticle[] }> = {};

        categories.forEach(cat => {
            categoryMap[cat.id] = { category: cat, articles: [] };
        });

        categoryMap['uncategorized'] = {
            category: { id: 'uncategorized', name: 'Uncategorized', topics: [], specific_inclusions: [] },
            articles: []
        };

        selectedReport.articles?.forEach(article => {
            if (!article.presentation_categories || article.presentation_categories.length === 0) {
                categoryMap['uncategorized'].articles.push(article);
            } else {
                const catId = article.presentation_categories[0];
                if (categoryMap[catId]) {
                    categoryMap[catId].articles.push(article);
                }
            }
        });

        return Object.fromEntries(
            Object.entries(categoryMap).filter(([_, data]) => data.articles.length > 0)
        );
    };

    // Render empty states
    const renderEmptyState = () => {
        if (!hasStreams) {
            return (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                    <DocumentTextIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                        No Research Streams Created
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-2xl mx-auto">
                        You need to create a research stream before reports can be generated.
                    </p>
                </div>
            );
        }

        if (!selectedStream) {
            return (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                    <DocumentTextIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                        Select a Research Stream
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">
                        Choose a research stream above to view its reports.
                    </p>
                </div>
            );
        }

        if (loadingReports) {
            return (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600 dark:text-gray-400">Loading reports...</p>
                </div>
            );
        }

        if (error === 'error') {
            return (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                    <div className="text-red-500 text-5xl mb-4">⚠️</div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                        Unable to Load Reports
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                        We couldn't connect to the server. Please check your connection and try again.
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        Retry
                    </button>
                </div>
            );
        }

        if (error === 'no_reports' || reports.length === 0) {
            return (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                    <DocumentTextIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                        No Reports Yet
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">
                        No reports have been generated for this research stream yet.
                    </p>
                </div>
            );
        }

        return null;
    };

    // Render Tablizer (always mounted to preserve state, hidden when not active)
    const renderTablizer = () => {
        if (!selectedReport?.articles || selectedReport.articles.length === 0) return null;

        return (
            <div className={reportView !== 'tablizer' ? 'hidden' : ''}>
                <ReportArticleTable
                    articles={selectedReport.articles}
                    title={selectedReport.report_name}
                    showAbstract={cardFormat === 'expanded'}
                    onAbstractVisibilityChange={(visible) => setCardFormat(visible ? 'expanded' : 'compact')}
                    onRowClick={(articles, index, isFiltered) => openArticleViewer(articles, index, isFiltered)}
                />
            </div>
        );
    };

    // Render other report views (conditionally rendered - state not preserved)
    const renderReportContent = () => {
        if (!selectedReport?.articles || selectedReport.articles.length === 0) return null;

        // Tablizer is rendered separately to preserve state
        if (reportView === 'tablizer') {
            return null;
        }

        if (reportView === 'by-category') {
            return (
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                        Articles by Category ({selectedReport.articles.length})
                    </h3>
                    <div className="space-y-6">
                        {Object.entries(getArticlesByCategory()).map(([categoryId, data]) => {
                            const isCollapsed = collapsedCategories.has(categoryId);
                            return (
                                <div key={categoryId} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
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
                                    </button>
                                    {!isCollapsed && (
                                        <div className="bg-white dark:bg-gray-900">
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
                                            <div className="p-4 space-y-3">
                                                {data.articles.map((article, idx) => (
                                                    <ReportArticleCard
                                                        key={article.article_id}
                                                        article={article}
                                                        showAbstract={cardFormat === 'expanded'}
                                                        onClick={() => openArticleViewer(data.articles, idx)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            );
        }

        // Default: 'all' view
        return (
            <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    Articles ({selectedReport.articles.length})
                </h3>
                <div className="space-y-3">
                    {selectedReport.articles.map((article, idx) => (
                        <ReportArticleCard
                            key={article.article_id}
                            article={article}
                            showAbstract={cardFormat === 'expanded'}
                            onClick={() => openArticleViewer(selectedReport.articles, idx)}
                        />
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="h-[calc(100vh-4rem)] flex">
            {/* Chat Tray */}
            <ChatTray
                initialContext={chatContext}
                payloadHandlers={payloadHandlers}
                hidden={articleViewerOpen}
                isOpen={isChatOpen}
                onOpenChange={(open) => {
                    if (!open) trackChatClose('reports');
                    setIsChatOpen(open);
                }}
            />

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-6 relative">
                {/* Chat toggle button */}
                {!isChatOpen && !articleViewerOpen && (
                    <button
                        onClick={() => {
                            trackChatOpen('reports');
                            setIsChatOpen(true);
                        }}
                        className="fixed bottom-6 left-6 z-40 p-4 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-all hover:scale-110"
                        title="Open chat"
                    >
                        <ChatBubbleLeftRightIcon className="h-6 w-6" />
                    </button>
                )}

                {/* Page Header */}
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

                {/* Stream Selector */}
                {hasStreams && (
                    <ReportStreamSelector
                        researchStreams={researchStreams}
                        selectedStream={selectedStream}
                        onStreamChange={handleStreamChange}
                        onRunPipeline={() => {
                            track('pipeline_run_click', { stream_id: parseInt(selectedStream, 10) });
                            navigate(`/streams/${selectedStream}/edit?tab=execute&subtab=pipeline`);
                        }}
                        showRunPipeline={!!selectedStream && (isPlatformAdmin || isOrgAdmin)}
                    />
                )}

                {/* Empty States or Report Content */}
                {renderEmptyState() || (
                    <div className="flex gap-6">
                        {/* Report List Sidebar */}
                        <ReportSidebar
                            reports={reports}
                            selectedReportId={selectedReport?.report_id || null}
                            collapsed={sidebarCollapsed}
                            onToggleCollapse={() => {
                                track('sidebar_toggle', { collapsed: !sidebarCollapsed });
                                setSidebarCollapsed(!sidebarCollapsed);
                            }}
                            onSelectReport={handleReportClick}
                            onDeleteReport={handleDeleteReport}
                        />

                        {/* Report Details */}
                        <div className="flex-1 min-w-0">
                            {loadingReportDetails ? (
                                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                                    <p className="text-gray-600 dark:text-gray-400">Loading report details...</p>
                                </div>
                            ) : selectedReport ? (
                                <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                                    {/* Report Header */}
                                    <ReportHeader
                                        report={selectedReport}
                                        reportView={reportView}
                                        cardFormat={cardFormat}
                                        hasPipelineData={hasPipelineData}
                                        onViewChange={handleViewChange}
                                        onCardFormatChange={handleCardFormatChange}
                                        onShowExecutionConfig={() => {
                                            track('execution_config_open', { report_id: selectedReport.report_id });
                                            setShowExecutionConfig(true);
                                        }}
                                        onShowAnalytics={() => {
                                            track('analytics_open', { report_id: selectedReport.report_id });
                                            setShowAnalytics(true);
                                        }}
                                        onDeleteReport={() => handleDeleteReport(selectedReport.report_id, selectedReport.report_name)}
                                    />

                                    {/* Report Content */}
                                    <div className="p-6 space-y-6">
                                        {/* Executive Summary */}
                                        {selectedReport.enrichments?.executive_summary && (
                                            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                                                <button
                                                    onClick={() => {
                                                        track('executive_summary_toggle', { collapsed: !executiveSummaryCollapsed });
                                                        setExecutiveSummaryCollapsed(!executiveSummaryCollapsed);
                                                    }}
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

                                        {/* Articles */}
                                        {renderTablizer()}
                                        {renderReportContent()}
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

                {/* Article Viewer Modal */}
                {articleViewerOpen && articleViewerArticles.length > 0 && (
                    <ArticleViewerModal
                        articles={articleViewerArticles}
                        initialIndex={articleViewerInitialIndex}
                        onClose={() => setArticleViewerOpen(false)}
                        chatContext={chatContext}
                        chatPayloadHandlers={payloadHandlers}
                        onArticleUpdate={handleArticleUpdate}
                        isFiltered={articleViewerIsFiltered}
                    />
                )}
            </div>
        </div>
    );
}
