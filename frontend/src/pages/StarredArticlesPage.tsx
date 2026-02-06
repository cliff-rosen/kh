import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { StarIcon } from '@heroicons/react/24/solid';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

import { StarredArticle } from '../types/starring';
import { ReportArticle } from '../types/report';
import { starringApi } from '../lib/api/starringApi';
import { showErrorToast } from '../lib/errorToast';
// Note: ResearchStreamContext could be used for stream name lookups if needed
// import { useResearchStream } from '../context/ResearchStreamContext';
import { useTracking } from '../hooks/useTracking';
import { formatArticleDate } from '../utils/dateUtils';

import ArticleViewerModal from '../components/articles/ArticleViewerModal';
import StarButton from '../components/articles/StarButton';

type FilterMode = 'all' | 'by-stream' | 'by-report';

export default function StarredArticlesPage() {
    const { streamId } = useParams<{ streamId?: string }>();
    const navigate = useNavigate();
    const { track } = useTracking({ defaultContext: { page: 'starred_articles' } });

    const [articles, setArticles] = useState<StarredArticle[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterMode, setFilterMode] = useState<FilterMode>(streamId ? 'by-stream' : 'all');
    const [selectedStreamFilter, setSelectedStreamFilter] = useState<string>(streamId || '');
    const [selectedReportFilter, setSelectedReportFilter] = useState<string>('');

    // Article viewer modal state
    const [viewerOpen, setViewerOpen] = useState(false);
    const [viewerArticles, setViewerArticles] = useState<ReportArticle[]>([]);
    const [viewerInitialIndex, setViewerInitialIndex] = useState(0);

    // Track which articles are starred (all displayed ones are starred)
    const starredArticleIds = useMemo(() => new Set(articles.map(a => a.article_id)), [articles]);

    // Load starred articles
    const loadArticles = useCallback(async () => {
        setLoading(true);
        try {
            let response;
            if (streamId) {
                response = await starringApi.getStarredForStream(Number(streamId));
            } else {
                response = await starringApi.getAllStarred();
            }
            setArticles(response.articles);
        } catch (err) {
            showErrorToast(err, 'Failed to load starred articles');
        } finally {
            setLoading(false);
        }
    }, [streamId]);

    useEffect(() => {
        loadArticles();
    }, [loadArticles]);

    // Handle unstar
    const handleToggleStar = useCallback(async (articleId: number) => {
        const article = articles.find(a => a.article_id === articleId);
        if (!article) return;

        try {
            const response = await starringApi.toggleStar(article.report_id, articleId);
            if (!response.is_starred) {
                // Remove from list
                setArticles(prev => prev.filter(a => a.article_id !== articleId));
                track('article_unstar', { article_id: articleId, report_id: article.report_id });
            }
        } catch (err) {
            showErrorToast(err, 'Failed to update star');
        }
    }, [articles, track]);

    // Get unique streams and reports for filters
    const uniqueStreams = useMemo(() => {
        const streams = new Map<number, string>();
        articles.forEach(a => streams.set(a.stream_id, a.stream_name));
        return Array.from(streams.entries()).map(([id, name]) => ({ id, name }));
    }, [articles]);

    const uniqueReports = useMemo(() => {
        const reports = new Map<number, { name: string; streamId: number }>();
        articles.forEach(a => reports.set(a.report_id, { name: a.report_name, streamId: a.stream_id }));
        return Array.from(reports.entries())
            .map(([id, { name, streamId }]) => ({ id, name, streamId }))
            .filter(r => !selectedStreamFilter || r.streamId === Number(selectedStreamFilter));
    }, [articles, selectedStreamFilter]);

    // Filter articles
    const filteredArticles = useMemo(() => {
        let filtered = articles;
        if (selectedStreamFilter) {
            filtered = filtered.filter(a => a.stream_id === Number(selectedStreamFilter));
        }
        if (selectedReportFilter) {
            filtered = filtered.filter(a => a.report_id === Number(selectedReportFilter));
        }
        return filtered;
    }, [articles, selectedStreamFilter, selectedReportFilter]);

    // Convert StarredArticle to ReportArticle for the viewer
    const toReportArticle = (sa: StarredArticle): ReportArticle => ({
        article_id: sa.article_id,
        title: sa.title,
        authors: sa.authors,
        journal: sa.journal,
        pub_year: sa.pub_year,
        pub_month: sa.pub_month,
        pub_day: sa.pub_day,
        pmid: sa.pmid,
        doi: sa.doi,
        abstract: sa.abstract,
    });

    const openViewer = (index: number) => {
        const article = filteredArticles[index];
        track('article_open', { article_id: article.article_id, report_id: article.report_id });
        setViewerArticles(filteredArticles.map(toReportArticle));
        setViewerInitialIndex(index);
        setViewerOpen(true);
    };

    const handleFilterModeChange = (mode: FilterMode) => {
        setFilterMode(mode);
        if (mode === 'all') {
            setSelectedStreamFilter('');
            setSelectedReportFilter('');
        } else if (mode === 'by-stream') {
            setSelectedReportFilter('');
        }
    };

    return (
        <div className="h-[calc(100vh-4rem)] overflow-y-auto p-6">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <button
                        onClick={() => navigate(-1)}
                        className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
                    >
                        <ArrowLeftIcon className="h-4 w-4" />
                        Back
                    </button>
                    <div className="flex items-center gap-3">
                        <StarIcon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                                Favorites
                            </h1>
                            <p className="text-gray-600 dark:text-gray-400 mt-1">
                                Your favorite articles across all reports
                            </p>
                        </div>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-6">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-600 dark:text-gray-400">Filter:</span>
                            <select
                                value={filterMode}
                                onChange={(e) => handleFilterModeChange(e.target.value as FilterMode)}
                                className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                            >
                                <option value="all">All Favorites</option>
                                <option value="by-stream">By Stream</option>
                                <option value="by-report">By Report</option>
                            </select>
                        </div>

                        {(filterMode === 'by-stream' || filterMode === 'by-report') && (
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-600 dark:text-gray-400">Stream:</span>
                                <select
                                    value={selectedStreamFilter}
                                    onChange={(e) => {
                                        setSelectedStreamFilter(e.target.value);
                                        setSelectedReportFilter('');
                                    }}
                                    className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                >
                                    <option value="">All Streams</option>
                                    {uniqueStreams.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {filterMode === 'by-report' && (
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-600 dark:text-gray-400">Report:</span>
                                <select
                                    value={selectedReportFilter}
                                    onChange={(e) => setSelectedReportFilter(e.target.value)}
                                    className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                >
                                    <option value="">All Reports</option>
                                    {uniqueReports.map(r => (
                                        <option key={r.id} value={r.id}>{r.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="ml-auto text-sm text-gray-500 dark:text-gray-400">
                            {filteredArticles.length} article{filteredArticles.length !== 1 ? 's' : ''}
                        </div>
                    </div>
                </div>

                {/* Content */}
                {loading ? (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                        <p className="text-gray-600 dark:text-gray-400">Loading starred articles...</p>
                    </div>
                ) : filteredArticles.length === 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                        <StarIcon className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                            No Favorites Yet
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400">
                            {articles.length === 0
                                ? "You haven't added any favorites yet. Star articles from reports to save them here."
                                : "No articles match your current filter."}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filteredArticles.map((article, idx) => (
                            <div
                                key={`${article.report_id}-${article.article_id}`}
                                onClick={() => openViewer(idx)}
                                className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 cursor-pointer hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 border border-gray-200 dark:border-gray-700 transition-all"
                            >
                                <div className="flex items-start gap-4">
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-medium text-blue-600 dark:text-blue-400 mb-1">
                                            {article.title}
                                        </h4>
                                        {article.authors && article.authors.length > 0 && (
                                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                                                {article.authors.slice(0, 3).join(', ')}
                                                {article.authors.length > 3 && ` et al.`}
                                            </p>
                                        )}
                                        <div className="flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-500">
                                            {article.journal && <span>{article.journal}</span>}
                                            {article.pub_year && (
                                                <span>• {formatArticleDate(article.pub_year, article.pub_month, article.pub_day)}</span>
                                            )}
                                            {article.pmid && <span>• PMID: {article.pmid}</span>}
                                        </div>
                                        <div className="flex flex-wrap gap-2 mt-2 text-xs">
                                            <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded">
                                                {article.stream_name}
                                            </span>
                                            <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded">
                                                {article.report_name}
                                            </span>
                                        </div>
                                    </div>
                                    <StarButton
                                        isStarred={true}
                                        onToggle={() => handleToggleStar(article.article_id)}
                                        size="md"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Article Viewer Modal */}
            {viewerOpen && viewerArticles.length > 0 && (
                <ArticleViewerModal
                    articles={viewerArticles}
                    initialIndex={viewerInitialIndex}
                    onClose={() => setViewerOpen(false)}
                    starredArticleIds={starredArticleIds}
                    onToggleStar={handleToggleStar}
                />
            )}
        </div>
    );
}
