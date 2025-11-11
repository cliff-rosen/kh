import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarIcon, DocumentTextIcon, StarIcon, ChevronLeftIcon, ChevronRightIcon, Squares2X2Icon, ListBulletIcon, ChevronDownIcon, ChevronUpIcon, ChartBarIcon } from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';

import { Report, ReportWithArticles, ReportArticle } from '../types';
import { ResearchStream, Category } from '../types';

import { reportApi } from '../lib/api/reportApi';
import { researchStreamApi } from '../lib/api/researchStreamApi';
import { useResearchStream } from '../context/ResearchStreamContext';

type ReportView = 'all' | 'by-category';

export default function ReportsPage() {
    const [searchParams] = useSearchParams();
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

                    // Auto-select the first report
                    if (streamReports.length > 0) {
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
    }, [selectedStream]);

    const loadReportDetails = async (reportId: number) => {
        setLoadingReportDetails(true);
        setCollapsedCategories(new Set()); // Reset collapsed state when switching reports
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
        selectedReport.articles?.forEach(article => {
            if (!article.presentation_categories || article.presentation_categories.length === 0) {
                categoryMap['uncategorized'].articles.push(article);
            } else {
                article.presentation_categories.forEach(catId => {
                    if (categoryMap[catId]) {
                        categoryMap[catId].articles.push(article);
                    }
                });
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
                                            onClick={() => handleReportClick(report)}
                                            className={`bg-white dark:bg-gray-800 rounded-lg shadow p-4 cursor-pointer transition-all ${selectedReport?.report_id === report.report_id
                                                ? 'ring-2 ring-blue-600'
                                                : 'hover:shadow-md'
                                                }`}
                                        >
                                            <div className="flex items-start justify-between mb-2">
                                                <div>
                                                    <h3 className="font-semibold text-gray-900 dark:text-white">
                                                        {new Date(report.report_date).toLocaleDateString('en-US', {
                                                            month: 'short',
                                                            day: 'numeric',
                                                            year: 'numeric'
                                                        })}
                                                    </h3>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                        {report.article_count || 0} articles
                                                    </p>
                                                </div>
                                            </div>
                                            <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                                                {report.executive_summary || 'Pipeline report - view for details'}
                                            </p>
                                            {report.run_type && (
                                                <div className="mt-2">
                                                    <span className="inline-block px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 uppercase">
                                                        {report.run_type}
                                                    </span>
                                                </div>
                                            )}
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
                                        Report - {new Date(selectedReport.report_date).toLocaleDateString()}
                                    </h2>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                                        <span className="flex items-center gap-1">
                                            <CalendarIcon className="h-4 w-4" />
                                            Generated {new Date(selectedReport.created_at).toLocaleDateString()}
                                        </span>
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
                                        <div className="flex gap-2">
                                            {isTestReport && (
                                                <button
                                                    onClick={() => setShowAnalytics(true)}
                                                    className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors bg-purple-600 hover:bg-purple-700 text-white"
                                                    title="View pipeline analytics and detailed metrics"
                                                >
                                                    <ChartBarIcon className="h-4 w-4" />
                                                    Pipeline Analytics
                                                </button>
                                            )}
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
                                    </div>
                                </div>

                                {/* Report Content */}
                                <div className="p-6 space-y-6">
                                    {/* Pipeline Metrics */}
                                    {selectedReport.pipeline_metrics && Object.keys(selectedReport.pipeline_metrics).length > 0 && (
                                        <div>
                                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                                                Pipeline Metrics
                                            </h3>
                                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                    {selectedReport.pipeline_metrics.total_retrieved && (
                                                        <div>
                                                            <p className="text-xs text-gray-500 dark:text-gray-400">Retrieved</p>
                                                            <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                                                {selectedReport.pipeline_metrics.total_retrieved}
                                                            </p>
                                                        </div>
                                                    )}
                                                    {selectedReport.pipeline_metrics.duplicates_found !== undefined && (
                                                        <div>
                                                            <p className="text-xs text-gray-500 dark:text-gray-400">Duplicates</p>
                                                            <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                                                {selectedReport.pipeline_metrics.duplicates_found}
                                                            </p>
                                                        </div>
                                                    )}
                                                    {selectedReport.pipeline_metrics.filtered_out !== undefined && (
                                                        <div>
                                                            <p className="text-xs text-gray-500 dark:text-gray-400">Filtered Out</p>
                                                            <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                                                {selectedReport.pipeline_metrics.filtered_out}
                                                            </p>
                                                        </div>
                                                    )}
                                                    {selectedReport.pipeline_metrics.articles_included !== undefined && (
                                                        <div>
                                                            <p className="text-xs text-gray-500 dark:text-gray-400">Included</p>
                                                            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                                                                {selectedReport.pipeline_metrics.articles_included}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Executive Summary */}
                                    {selectedReport.executive_summary && (
                                        <div>
                                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                                                Executive Summary
                                            </h3>
                                            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                                                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                                    {selectedReport.executive_summary}
                                                </p>
                                            </div>
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
                                                                        <div className="p-4 space-y-3 bg-white dark:bg-gray-900">
                                                                            {data.articles.map((article) => (
                                                                                <ArticleCard key={article.article_id} article={article} showAbstract={true} />
                                                                            ))}
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
        </div>
    );
}
