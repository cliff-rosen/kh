import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    XMarkIcon,
    ArrowTopRightOnSquareIcon,
    BeakerIcon,
    PencilSquareIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    LinkIcon,
    ShieldCheckIcon,
    ScaleIcon,
    ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { CheckBadgeIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/solid';
import { documentAnalysisApi } from '../lib/api/documentAnalysisApi';
import { articleApi, FullTextLink } from '../lib/api/articleApi';
import { reportApi } from '../lib/api/reportApi';
import { CanonicalResearchArticle } from '../types/canonical_types';
import { StanceAnalysisResult, StanceType } from '../types/document_analysis';
import ChatTray from './chat/ChatTray';
import { PayloadHandler } from '../types/chat';

type WorkspaceTab = 'analysis' | 'notes' | 'links';

interface ArticleViewerModalProps {
    articles: CanonicalResearchArticle[];
    initialIndex?: number;
    onClose: () => void;
    /** Chat context to pass to the embedded chat tray */
    chatContext?: Record<string, any>;
    /** Payload handlers for chat */
    chatPayloadHandlers?: Record<string, PayloadHandler>;
}

export default function ArticleViewerModal({
    articles,
    initialIndex = 0,
    onClose,
    chatContext,
    chatPayloadHandlers
}: ArticleViewerModalProps) {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const article = articles[currentIndex];

    // Chat state
    const [isChatOpen, setIsChatOpen] = useState(false);

    // Memoize chat context to include current article info
    const articleChatContext = useMemo(() => {
        if (!chatContext) return undefined;
        return {
            ...chatContext,
            current_article: article ? {
                pmid: article.pmid,
                title: article.title,
                authors: article.authors,
                journal: article.journal,
                year: article.publication_year
            } : undefined
        };
    }, [chatContext, article]);

    const hasPrevious = currentIndex > 0;
    const hasNext = currentIndex < articles.length - 1;

    const prevArticle = hasPrevious ? articles[currentIndex - 1] : null;
    const nextArticle = hasNext ? articles[currentIndex + 1] : null;

    const handlePrevious = useCallback(() => {
        if (currentIndex > 0) {
            setCurrentIndex(currentIndex - 1);
        }
    }, [currentIndex]);

    const handleNext = useCallback(() => {
        if (currentIndex < articles.length - 1) {
            setCurrentIndex(currentIndex + 1);
        }
    }, [currentIndex, articles.length]);

    // Workspace state
    const [activeTab, setActiveTab] = useState<WorkspaceTab>('analysis');

    // Full text links state - keyed by pmid to cache results
    const [fullTextLinksCache, setFullTextLinksCache] = useState<Record<string, FullTextLink[]>>({});
    const [loadingLinks, setLoadingLinks] = useState(false);

    // Stance analysis state - keyed by article id to preserve results when navigating
    const [stanceCache, setStanceCache] = useState<Record<string, StanceAnalysisResult>>({});
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);

    // Notes state - keyed by article id
    const [notesCache, setNotesCache] = useState<Record<string, string>>({});
    const [isSavingNotes, setIsSavingNotes] = useState(false);
    const notesDebounceRef = useRef<NodeJS.Timeout | null>(null);

    const stanceResult = article ? stanceCache[article.id] : null;
    const currentNotes = article ? (notesCache[article.id] ?? '') : '';
    const streamId = chatContext?.stream_id as number | undefined;
    const reportId = chatContext?.report_id as number | undefined;

    // Initialize caches from article data when article changes
    useEffect(() => {
        if (!article) return;

        // Skip if we already have cached data for this article
        if (stanceCache[article.id] !== undefined || notesCache[article.id] !== undefined) return;

        // Initialize from article data (passed from report)
        if (article.ai_enrichments?.stance_analysis) {
            setStanceCache(prev => ({ ...prev, [article.id]: article.ai_enrichments!.stance_analysis! }));
        }
        setNotesCache(prev => ({ ...prev, [article.id]: article.notes ?? '' }));
    }, [article?.id]);

    // Reset error state when switching articles (cache is preserved)
    useEffect(() => {
        setAnalysisError(null);
    }, [currentIndex]);

    // Save notes with debouncing
    const handleNotesChange = useCallback((newNotes: string) => {
        if (!article || !reportId) return;

        setNotesCache(prev => ({ ...prev, [article.id]: newNotes }));

        // Clear existing timeout
        if (notesDebounceRef.current) {
            clearTimeout(notesDebounceRef.current);
        }

        // Set new timeout to save
        notesDebounceRef.current = setTimeout(async () => {
            setIsSavingNotes(true);
            try {
                const articleIdNum = parseInt(article.id, 10);
                await reportApi.updateArticleNotes(reportId, articleIdNum, newNotes || null);
            } catch (err) {
                console.error('Failed to save notes:', err);
            } finally {
                setIsSavingNotes(false);
            }
        }, 1000); // 1 second debounce
    }, [article?.id, reportId]);

    // Cleanup debounce on unmount
    useEffect(() => {
        return () => {
            if (notesDebounceRef.current) {
                clearTimeout(notesDebounceRef.current);
            }
        };
    }, []);

    // Fetch full text links when article changes (on demand, cached)
    const currentLinks = article?.pmid ? fullTextLinksCache[article.pmid] : undefined;

    const fetchFullTextLinks = useCallback(async () => {
        if (!article?.pmid || fullTextLinksCache[article.pmid]) return;

        setLoadingLinks(true);
        try {
            const response = await articleApi.getFullTextLinks(article.pmid);
            setFullTextLinksCache(prev => ({
                ...prev,
                [article.pmid as string]: response.links
            }));
        } catch (error) {
            console.error('Failed to fetch full text links:', error);
            // Cache empty array to prevent repeated failed requests
            setFullTextLinksCache(prev => ({
                ...prev,
                [article.pmid as string]: []
            }));
        } finally {
            setLoadingLinks(false);
        }
    }, [article?.pmid, fullTextLinksCache]);

    // Handle escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    // Handle arrow keys for navigation
    useEffect(() => {
        const handleArrowKeys = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft' && hasPrevious) {
                handlePrevious();
            } else if (e.key === 'ArrowRight' && hasNext) {
                handleNext();
            }
        };
        window.addEventListener('keydown', handleArrowKeys);
        return () => window.removeEventListener('keydown', handleArrowKeys);
    }, [hasPrevious, hasNext, handlePrevious, handleNext]);

    const runAnalysis = async () => {
        if (!article?.abstract) {
            setAnalysisError('No abstract available for analysis');
            return;
        }

        if (!streamId) {
            setAnalysisError('No research stream context available');
            return;
        }

        setIsAnalyzing(true);
        setAnalysisError(null);

        try {
            const result = await documentAnalysisApi.analyzeStance({
                article: {
                    title: article.title,
                    abstract: article.abstract,
                    authors: article.authors,
                    journal: article.journal,
                    publication_year: article.publication_year,
                    pmid: article.pmid,
                    doi: article.doi
                },
                stream_id: streamId
            });

            // Update local cache
            setStanceCache(prev => ({ ...prev, [article.id]: result }));
            setActiveTab('analysis');

            // Persist to backend if we have a report context
            if (reportId) {
                try {
                    const articleIdNum = parseInt(article.id, 10);
                    await reportApi.updateArticleEnrichments(reportId, articleIdNum, { stance_analysis: result });
                } catch (saveErr) {
                    console.error('Failed to save stance analysis:', saveErr);
                    // Don't fail the operation - the analysis is still visible locally
                }
            }
        } catch (err) {
            setAnalysisError(err instanceof Error ? err.message : 'Analysis failed');
        } finally {
            setIsAnalyzing(false);
        }
    };

    // Helper to get stance display info
    const getStanceInfo = (stance: StanceType) => {
        switch (stance) {
            case 'pro-defense':
                return { label: 'Pro-Defense', color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-100 dark:bg-blue-900/30', icon: ShieldCheckIcon };
            case 'pro-plaintiff':
                return { label: 'Pro-Plaintiff', color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-900/30', icon: ExclamationTriangleIcon };
            case 'neutral':
                return { label: 'Neutral', color: 'text-gray-600 dark:text-gray-400', bgColor: 'bg-gray-100 dark:bg-gray-700', icon: ScaleIcon };
            case 'mixed':
                return { label: 'Mixed', color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-100 dark:bg-amber-900/30', icon: ScaleIcon };
            default:
                return { label: 'Unclear', color: 'text-gray-500 dark:text-gray-500', bgColor: 'bg-gray-100 dark:bg-gray-700', icon: ScaleIcon };
        }
    };

    const formatAuthors = (authors: string[]) => {
        if (!authors || authors.length === 0) return 'Unknown authors';
        return authors.join(', ');
    };

    const truncateTitle = (title: string, maxLength: number = 80) => {
        if (title.length <= maxLength) return title;
        return title.substring(0, maxLength).trim() + '...';
    };

    const tabs = [
        { id: 'analysis' as WorkspaceTab, label: 'Analysis', icon: BeakerIcon },
        { id: 'notes' as WorkspaceTab, label: 'Notes', icon: PencilSquareIcon },
        { id: 'links' as WorkspaceTab, label: 'Full Text', icon: LinkIcon }
    ];

    if (!article) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative w-[95vw] h-[90vh] bg-white dark:bg-gray-800 rounded-lg shadow-2xl flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-4">
                        {/* Navigation arrows */}
                        {articles.length > 1 && (
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={handlePrevious}
                                    disabled={!hasPrevious}
                                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                                    title={prevArticle ? `Previous: ${prevArticle.title.substring(0, 50)}${prevArticle.title.length > 50 ? '...' : ''}` : 'Previous article'}
                                >
                                    <ChevronLeftIcon className="h-5 w-5" />
                                </button>
                                <span className="text-sm text-gray-500 min-w-[60px] text-center">
                                    {currentIndex + 1} / {articles.length}
                                </span>
                                <button
                                    onClick={handleNext}
                                    disabled={!hasNext}
                                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                                    title={nextArticle ? `Next: ${nextArticle.title.substring(0, 50)}${nextArticle.title.length > 50 ? '...' : ''}` : 'Next article'}
                                >
                                    <ChevronRightIcon className="h-5 w-5" />
                                </button>
                            </div>
                        )}
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                            Article Viewer
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                        title="Close (Escape)"
                    >
                        <XMarkIcon className="h-5 w-5" />
                    </button>
                </div>

                {/* Main content */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Embedded Chat Tray */}
                    {articleChatContext && (
                        <ChatTray
                            embedded
                            isOpen={isChatOpen}
                            onOpenChange={setIsChatOpen}
                            initialContext={articleChatContext}
                            payloadHandlers={chatPayloadHandlers}
                        />
                    )}

                    {/* Left sidebar - Article list (only if multiple articles) */}
                    {articles.length > 1 && (
                        <div className="w-64 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex flex-col overflow-hidden">
                            <div className="flex-1 overflow-y-auto">
                                <div className="p-2">
                                    <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide px-2 py-1">
                                        Articles ({articles.length})
                                    </h3>
                                    <div className="space-y-1">
                                        {articles.map((art, idx) => (
                                            <button
                                                key={art.id}
                                                onClick={() => setCurrentIndex(idx)}
                                                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${idx === currentIndex
                                                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100'
                                                    : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                                                    }`}
                                            >
                                                <div className="font-medium leading-tight line-clamp-2">
                                                    {truncateTitle(art.title, 50)}
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                    {art.publication_year} {art.journal && `• ${art.journal.substring(0, 15)}`}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Main panel */}
                    <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-800">
                        {/* Article header section */}
                        <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-6">
                            {/* Title */}
                            <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">
                                {article.title}
                            </h1>

                            {/* Authors */}
                            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                                {formatAuthors(article.authors)}
                            </p>

                            {/* Journal, Date, PMID row */}
                            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                                {article.journal && (
                                    <span className="text-gray-700 dark:text-gray-300 font-medium">{article.journal}</span>
                                )}
                                {(article.publication_date || article.publication_year) && (
                                    <span className="text-gray-500 dark:text-gray-400">
                                        {article.publication_date
                                            ? new Date(article.publication_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                                            : article.publication_year}
                                    </span>
                                )}
                                {article.pmid && (
                                    <a
                                        href={`https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 dark:text-blue-400 font-mono hover:underline flex items-center gap-1"
                                    >
                                        PMID: {article.pmid}
                                        <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                                    </a>
                                )}
                                {article.doi && (
                                    <a
                                        href={`https://doi.org/${article.doi}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                                    >
                                        DOI: {article.doi}
                                        <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                                    </a>
                                )}
                            </div>

                            {/* Keywords */}
                            {article.keywords && article.keywords.length > 0 && (
                                <div className="mt-3">
                                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Keywords: </span>
                                    <span className="text-sm text-gray-700 dark:text-gray-300">
                                        {article.keywords.join(', ')}
                                    </span>
                                </div>
                            )}

                            {/* MeSH Terms */}
                            {article.mesh_terms && article.mesh_terms.length > 0 && (
                                <div className="mt-2">
                                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">MeSH Terms: </span>
                                    <div className="mt-1 flex flex-wrap gap-1">
                                        {article.mesh_terms.map((term, idx) => (
                                            <span
                                                key={idx}
                                                className="inline-block px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
                                            >
                                                {term}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Abstract */}
                            <div className="mt-4">
                                {article.abstract ? (
                                    <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
                                        {article.abstract}
                                    </p>
                                ) : (
                                    <p className="text-gray-500 dark:text-gray-400 italic text-sm">
                                        No abstract available
                                    </p>
                                )}
                            </div>

                            {/* Quick action for analysis - hidden when Analysis tab is active, but space preserved */}
                            {article.abstract && !stanceResult && !isAnalyzing && streamId && (
                                <div className={`mt-4 ${activeTab === 'analysis' ? 'invisible' : ''}`}>
                                    <button
                                        onClick={runAnalysis}
                                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                                    >
                                        <BeakerIcon className="h-4 w-4" />
                                        Run AI Analysis
                                    </button>
                                </div>
                            )}
                            {isAnalyzing && (
                                <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                                    Analyzing article stance...
                                </p>
                            )}
                        </div>

                        {/* Tab bar */}
                        <div className="flex-shrink-0 flex items-center gap-1 px-4 pt-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                            {tabs.map(({ id, label, icon: Icon }) => (
                                <button
                                    key={id}
                                    onClick={() => setActiveTab(id)}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${activeTab === id
                                        ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white'
                                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                                        }`}
                                >
                                    <Icon className="h-4 w-4" />
                                    {label}
                                    {id === 'analysis' && stanceResult && (
                                        <span className={`ml-1 px-1.5 py-0.5 ${getStanceInfo(stanceResult.stance).bgColor} ${getStanceInfo(stanceResult.stance).color} rounded text-xs`}>
                                            {getStanceInfo(stanceResult.stance).label}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Tab content */}
                        <div className="flex-1 overflow-y-auto">
                            {/* Analysis Tab */}
                            {activeTab === 'analysis' && (
                                <div className="h-full flex flex-col">
                                    {/* Empty state - no analysis yet */}
                                    {!stanceResult && !isAnalyzing && !analysisError && (
                                        <div className="flex-1 flex items-center justify-center">
                                            <div className="text-center max-w-md">
                                                <ScaleIcon className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                                                <p className="text-gray-600 dark:text-gray-400 mb-4">
                                                    {!streamId
                                                        ? 'No research stream context available for stance analysis'
                                                        : article.abstract
                                                            ? 'Run AI analysis to evaluate this article\'s stance'
                                                            : 'No abstract available for analysis'}
                                                </p>
                                                {article.abstract && streamId && (
                                                    <button
                                                        onClick={runAnalysis}
                                                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                                                    >
                                                        <BeakerIcon className="h-5 w-5" />
                                                        Run AI Analysis
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Loading state */}
                                    {isAnalyzing && (
                                        <div className="flex-1 flex items-center justify-center">
                                            <div className="text-center">
                                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                                                <p className="text-gray-600 dark:text-gray-400">
                                                    Analyzing article stance...
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Error state */}
                                    {analysisError && (
                                        <div className="p-4">
                                            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                                                <p className="text-red-800 dark:text-red-200">{analysisError}</p>
                                                {streamId && article.abstract && (
                                                    <button
                                                        onClick={runAnalysis}
                                                        className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
                                                    >
                                                        Try Again
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Results state */}
                                    {stanceResult && (
                                        <div className="p-6 space-y-6">
                                            {/* Stance header */}
                                            <div className={`p-6 rounded-lg ${getStanceInfo(stanceResult.stance).bgColor}`}>
                                                <div className="flex items-center gap-4">
                                                    {(() => {
                                                        const StanceIcon = getStanceInfo(stanceResult.stance).icon;
                                                        return <StanceIcon className={`h-12 w-12 ${getStanceInfo(stanceResult.stance).color}`} />;
                                                    })()}
                                                    <div>
                                                        <h3 className={`text-2xl font-bold ${getStanceInfo(stanceResult.stance).color}`}>
                                                            {getStanceInfo(stanceResult.stance).label}
                                                        </h3>
                                                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                                            Confidence: {Math.round(stanceResult.confidence * 100)}%
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Analysis explanation */}
                                            <div>
                                                <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                                                    Analysis
                                                </h4>
                                                <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                                                    {stanceResult.analysis}
                                                </p>
                                            </div>

                                            {/* Key factors */}
                                            {stanceResult.key_factors.length > 0 && (
                                                <div>
                                                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                                                        Key Factors
                                                    </h4>
                                                    <ul className="space-y-2">
                                                        {stanceResult.key_factors.map((factor, idx) => (
                                                            <li key={idx} className="flex items-start gap-2">
                                                                <CheckBadgeIcon className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                                                                <span className="text-gray-700 dark:text-gray-300">{factor}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}

                                            {/* Relevant quotes */}
                                            {stanceResult.relevant_quotes.length > 0 && (
                                                <div>
                                                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                                                        Relevant Quotes
                                                    </h4>
                                                    <div className="space-y-3">
                                                        {stanceResult.relevant_quotes.map((quote, idx) => (
                                                            <blockquote
                                                                key={idx}
                                                                className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic text-gray-600 dark:text-gray-400"
                                                            >
                                                                "{quote}"
                                                            </blockquote>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Re-analyze button */}
                                            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                                                <button
                                                    onClick={runAnalysis}
                                                    className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                                                >
                                                    <BeakerIcon className="h-4 w-4" />
                                                    Re-analyze
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Notes Tab */}
                            {activeTab === 'notes' && (
                                <div className="h-full flex flex-col p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                                            Notes
                                        </h2>
                                        {isSavingNotes && (
                                            <span className="text-xs text-gray-500 flex items-center gap-1">
                                                <div className="animate-spin rounded-full h-3 w-3 border-b border-gray-500"></div>
                                                Saving...
                                            </span>
                                        )}
                                    </div>
                                    <textarea
                                        value={currentNotes}
                                        onChange={(e) => handleNotesChange(e.target.value)}
                                        placeholder="Add your notes about this article..."
                                        className="flex-1 w-full p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        disabled={!reportId}
                                    />
                                    <p className="mt-2 text-xs text-gray-500">
                                        {reportId ? 'Notes are saved automatically' : 'Notes require a report context to save'}
                                    </p>
                                </div>
                            )}

                            {/* Full Text Links Tab */}
                            {activeTab === 'links' && (
                                <div className="p-6">
                                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                        Full Text Access
                                    </h2>
                                    <div className="space-y-3 max-w-xl">
                                        {/* PMC link if available */}
                                        {article.source_metadata?.pmc_id && (
                                            <a
                                                href={`https://www.ncbi.nlm.nih.gov/pmc/articles/${article.source_metadata.pmc_id}/`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="block px-4 py-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <CheckBadgeIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
                                                        <span className="font-medium text-green-700 dark:text-green-300">PubMed Central</span>
                                                    </div>
                                                    <ArrowTopRightOnSquareIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
                                                </div>
                                                <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                                                    Free full text available
                                                </p>
                                            </a>
                                        )}

                                        {/* Links from PubMed LinkOut */}
                                        {currentLinks && currentLinks.length > 0 && currentLinks.map((link, idx) => (
                                            <a
                                                key={`${link.provider}-${idx}`}
                                                href={link.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={`block px-4 py-3 rounded-lg ${link.is_free
                                                    ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/30'
                                                    : 'bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'
                                                    }`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        {link.is_free && <CheckBadgeIcon className="h-5 w-5 text-green-600 dark:text-green-400" />}
                                                        <span className={`font-medium ${link.is_free ? 'text-green-700 dark:text-green-300' : 'text-gray-700 dark:text-gray-300'}`}>
                                                            {link.provider}
                                                        </span>
                                                    </div>
                                                    <ArrowTopRightOnSquareIcon className={`h-5 w-5 ${link.is_free ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`} />
                                                </div>
                                                {link.categories.length > 0 && (
                                                    <p className={`text-sm mt-1 ${link.is_free ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                                                        {link.is_free ? 'Free full text' : link.categories.join(', ')}
                                                    </p>
                                                )}
                                            </a>
                                        ))}

                                        {/* Button to fetch links */}
                                        {currentLinks === undefined && (
                                            <button
                                                onClick={fetchFullTextLinks}
                                                disabled={loadingLinks}
                                                className="w-full px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 text-left"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <LinkIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                                        <span className="font-medium text-blue-700 dark:text-blue-300">
                                                            {loadingLinks ? 'Searching...' : 'Search for full text options'}
                                                        </span>
                                                    </div>
                                                    {loadingLinks && (
                                                        <svg className="animate-spin h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                        </svg>
                                                    )}
                                                </div>
                                                <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                                                    Check PubMed LinkOut for additional sources
                                                </p>
                                            </button>
                                        )}

                                        {/* No links found message */}
                                        {currentLinks !== undefined && currentLinks.length === 0 && !article.source_metadata?.pmc_id && (
                                            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg">
                                                <p className="text-gray-500 dark:text-gray-400">
                                                    No additional full text sources found in PubMed LinkOut
                                                </p>
                                            </div>
                                        )}

                                        {/* DOI link */}
                                        {article.doi && (
                                            <a
                                                href={`https://doi.org/${article.doi}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="block px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span className="font-medium text-amber-700 dark:text-amber-300">Publisher (via DOI)</span>
                                                    <ArrowTopRightOnSquareIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                                                </div>
                                                <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                                                    May require subscription or purchase
                                                </p>
                                            </a>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer with chat toggle */}
                {articleChatContext && (
                    <div className="flex-shrink-0 px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                        <button
                            onClick={() => setIsChatOpen(!isChatOpen)}
                            className={`p-2 rounded-lg transition-colors ${
                                isChatOpen
                                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                            }`}
                            title={isChatOpen ? 'Close chat' : 'Open chat'}
                        >
                            <ChatBubbleLeftRightIcon className="h-5 w-5" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
