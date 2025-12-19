import { useState, useEffect, useCallback } from 'react';
import {
    XMarkIcon,
    DocumentMagnifyingGlassIcon,
    ArrowTopRightOnSquareIcon,
    DocumentTextIcon,
    BeakerIcon,
    PencilSquareIcon,
    ChevronLeftIcon,
    ChevronRightIcon
} from '@heroicons/react/24/outline';
import { documentAnalysisApi } from '../lib/api/documentAnalysisApi';
import { CanonicalResearchArticle } from '../types/canonical_types';
import {
    DocumentAnalysisResult,
    ViewMode,
    AnalysisStreamMessage
} from '../types/document_analysis';
import { TreeView, GraphView, SplitView } from './tools/DocumentAnalysis';

interface ProgressStep {
    id: string;
    label: string;
    status: 'pending' | 'active' | 'complete' | 'error';
    result?: string;
}

type WorkspaceTab = 'overview' | 'analysis' | 'notes';

interface ArticleViewerModalProps {
    articles: CanonicalResearchArticle[];
    initialIndex?: number;
    onClose: () => void;
}

export default function ArticleViewerModal({
    articles,
    initialIndex = 0,
    onClose
}: ArticleViewerModalProps) {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const article = articles[currentIndex];

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
    const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
    const [notes, setNotes] = useState<string>('');

    // Analysis state - keyed by article id to preserve results when navigating
    const [analysisCache, setAnalysisCache] = useState<Record<string, DocumentAnalysisResult>>({});
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);
    const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);
    const [currentMessage, setCurrentMessage] = useState<string>('');
    const [viewMode, setViewMode] = useState<ViewMode>('tree');
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

    const analysisResults = article ? analysisCache[article.id] : null;

    // Reset tab when switching articles (but keep analysis cache)
    useEffect(() => {
        setActiveTab('overview');
        setAnalysisError(null);
        setSelectedNodeId(null);
    }, [currentIndex]);

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

    const handleStreamMessage = useCallback((message: AnalysisStreamMessage) => {
        setCurrentMessage(message.message);

        switch (message.type) {
            case 'status':
                if (message.data?.options) {
                    const steps: ProgressStep[] = [];
                    if (message.data.options.hierarchical_summary) {
                        steps.push({ id: 'summary', label: 'Hierarchical Summary', status: 'pending' });
                    }
                    if (message.data.options.entity_extraction) {
                        steps.push({ id: 'entities', label: 'Entity Extraction', status: 'pending' });
                    }
                    if (message.data.options.claim_extraction) {
                        steps.push({ id: 'claims', label: 'Claim Extraction', status: 'pending' });
                    }
                    setProgressSteps(steps);
                }
                break;

            case 'progress':
                if (message.data?.phase) {
                    const phaseId = message.data.phase === 'hierarchical_summary' ? 'summary' :
                                   message.data.phase === 'entity_extraction' ? 'entities' : 'claims';
                    setProgressSteps(prev => prev.map(step =>
                        step.id === phaseId ? { ...step, status: 'active' } : step
                    ));
                }
                break;

            case 'summary':
                setProgressSteps(prev => prev.map(step =>
                    step.id === 'summary' ? {
                        ...step,
                        status: 'complete',
                        result: `${message.data?.result?.sections?.length || 0} sections`
                    } : step
                ));
                break;

            case 'entities':
                setProgressSteps(prev => prev.map(step =>
                    step.id === 'entities' ? {
                        ...step,
                        status: 'complete',
                        result: `${message.data?.result?.length || 0} entities`
                    } : step
                ));
                break;

            case 'claims':
                setProgressSteps(prev => prev.map(step =>
                    step.id === 'claims' ? {
                        ...step,
                        status: 'complete',
                        result: `${message.data?.result?.length || 0} claims`
                    } : step
                ));
                break;

            case 'error':
                setProgressSteps(prev => prev.map(step =>
                    step.status === 'active' ? { ...step, status: 'error' } : step
                ));
                break;
        }
    }, []);

    const runAnalysis = async () => {
        if (!article?.abstract) {
            setAnalysisError('No abstract available for analysis');
            return;
        }

        setIsAnalyzing(true);
        setAnalysisError(null);
        setProgressSteps([]);
        setCurrentMessage('Starting analysis...');

        try {
            const result = await documentAnalysisApi.analyzeDocumentStream(
                {
                    document_text: article.abstract,
                    document_title: article.title,
                    analysis_options: {
                        hierarchical_summary: true,
                        entity_extraction: true,
                        claim_extraction: true
                    }
                },
                handleStreamMessage
            );

            if (result) {
                setAnalysisCache(prev => ({ ...prev, [article.id]: result }));
                setSelectedNodeId('executive');
                setActiveTab('analysis');
            }
        } catch (err) {
            setAnalysisError(err instanceof Error ? err.message : 'Analysis failed');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const formatAuthors = (authors: string[]) => {
        if (!authors || authors.length === 0) return 'Unknown authors';
        if (authors.length <= 3) return authors.join(', ');
        return `${authors.slice(0, 3).join(', ')} et al.`;
    };

    const truncateTitle = (title: string, maxLength: number = 80) => {
        if (title.length <= maxLength) return title;
        return title.substring(0, maxLength).trim() + '...';
    };

    const tabs = [
        { id: 'overview' as WorkspaceTab, label: 'Overview', icon: DocumentTextIcon },
        { id: 'analysis' as WorkspaceTab, label: 'Analysis', icon: BeakerIcon },
        { id: 'notes' as WorkspaceTab, label: 'Notes', icon: PencilSquareIcon }
    ];

    const viewModes = [
        { id: 'tree' as ViewMode, label: 'Tree' },
        { id: 'graph' as ViewMode, label: 'Graph' },
        { id: 'split' as ViewMode, label: 'Split' }
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
                    {/* Left sidebar */}
                    <div className="w-80 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex flex-col overflow-hidden">
                        {/* Current article metadata - fixed height to prevent list jumping */}
                        <div className="h-[350px] flex-shrink-0 p-4 space-y-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-y-auto">
                            {/* Title */}
                            <h1 className="text-base font-bold text-gray-900 dark:text-white leading-tight">
                                {article.title}
                            </h1>

                            {/* Authors */}
                            <div>
                                <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                                    Authors
                                </h3>
                                <p className="text-sm text-gray-700 dark:text-gray-300">
                                    {formatAuthors(article.authors)}
                                </p>
                            </div>

                            {/* Journal & Year */}
                            <div className="grid grid-cols-2 gap-4">
                                {article.journal && (
                                    <div>
                                        <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                                            Journal
                                        </h3>
                                        <p className="text-sm text-gray-700 dark:text-gray-300">
                                            {article.journal}
                                        </p>
                                    </div>
                                )}
                                {article.publication_year && (
                                    <div>
                                        <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                                            Year
                                        </h3>
                                        <p className="text-sm text-gray-700 dark:text-gray-300">
                                            {article.publication_year}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Divider */}
                            <hr className="border-gray-200 dark:border-gray-700" />

                            {/* Full Text Access */}
                            <div>
                                <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                                    Full Text Access
                                </h3>
                                <div className="space-y-2">
                                    {article.source_metadata?.pmc_id ? (
                                        <a
                                            href={`https://www.ncbi.nlm.nih.gov/pmc/articles/${article.source_metadata.pmc_id}/`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block px-3 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md hover:bg-green-100 dark:hover:bg-green-900/30"
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="font-medium text-green-700 dark:text-green-300">PubMed Central</span>
                                                <ArrowTopRightOnSquareIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
                                            </div>
                                            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                                                Free full text available
                                            </p>
                                        </a>
                                    ) : (
                                        <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md">
                                            <span className="text-sm text-gray-500 dark:text-gray-400">No free full text</span>
                                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                                Not available in PubMed Central
                                            </p>
                                        </div>
                                    )}

                                    {article.doi && (
                                        <a
                                            href={`https://doi.org/${article.doi}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md hover:bg-amber-100 dark:hover:bg-amber-900/30"
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="font-medium text-amber-700 dark:text-amber-300">Publisher Site</span>
                                                <ArrowTopRightOnSquareIcon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                            </div>
                                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                                May require subscription
                                            </p>
                                        </a>
                                    )}
                                </div>
                            </div>

                            {/* Reference Links */}
                            <div>
                                <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                                    Reference
                                </h3>
                                <div className="space-y-2">
                                    {article.pmid && (
                                        <a
                                            href={`https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center justify-between px-3 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-md text-sm hover:bg-blue-100 dark:hover:bg-blue-900/30"
                                        >
                                            <div>
                                                <span className="font-medium">PubMed</span>
                                                <span className="text-xs text-blue-500 dark:text-blue-400 ml-2">PMID: {article.pmid}</span>
                                            </div>
                                            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                                        </a>
                                    )}
                                    {article.doi && (
                                        <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-md">
                                            <span className="text-xs text-gray-500 dark:text-gray-400">DOI: </span>
                                            <span className="text-xs text-gray-700 dark:text-gray-300 font-mono">{article.doi}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Keywords */}
                            {article.keywords && article.keywords.length > 0 && (
                                <div>
                                    <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                                        Keywords
                                    </h3>
                                    <div className="flex flex-wrap gap-1">
                                        {article.keywords.map((kw, idx) => (
                                            <span
                                                key={idx}
                                                className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded text-xs"
                                            >
                                                {kw}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Article list (if multiple) */}
                        {articles.length > 1 && (
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
                                                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                                                    idx === currentIndex
                                                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100'
                                                        : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                                                }`}
                                            >
                                                <div className="font-medium leading-tight line-clamp-2">
                                                    {truncateTitle(art.title, 60)}
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                    {art.publication_year} {art.journal && `• ${art.journal.substring(0, 20)}`}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right workspace - Tabbed content */}
                    <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-800">
                        {/* Tab bar */}
                        <div className="flex-shrink-0 flex items-center gap-1 px-4 pt-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                            {tabs.map(({ id, label, icon: Icon }) => (
                                <button
                                    key={id}
                                    onClick={() => setActiveTab(id)}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
                                        activeTab === id
                                            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white'
                                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                                    }`}
                                >
                                    <Icon className="h-4 w-4" />
                                    {label}
                                    {id === 'analysis' && analysisResults && (
                                        <span className="ml-1 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs">
                                            {analysisResults.entities.length + analysisResults.claims.length}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Tab content */}
                        <div className="flex-1 overflow-y-auto">
                            {/* Overview Tab */}
                            {activeTab === 'overview' && (
                                <div className="p-6 space-y-6">
                                    {/* Abstract */}
                                    <div>
                                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                                            Abstract
                                        </h2>
                                        {article.abstract ? (
                                            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                                                {article.abstract}
                                            </p>
                                        ) : (
                                            <p className="text-gray-500 dark:text-gray-400 italic">
                                                No abstract available
                                            </p>
                                        )}
                                    </div>

                                    {/* Quick Actions */}
                                    {article.abstract && !analysisResults && (
                                        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                                            <button
                                                onClick={runAnalysis}
                                                disabled={isAnalyzing}
                                                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <DocumentMagnifyingGlassIcon className="h-5 w-5" />
                                                {isAnalyzing ? 'Analyzing...' : 'Run AI Analysis'}
                                            </button>
                                            {isAnalyzing && (
                                                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                                                    {currentMessage}
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* Analysis summary if available */}
                                    {analysisResults && (
                                        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                                            <h3 className="text-md font-semibold text-gray-900 dark:text-white mb-3">
                                                AI Summary
                                            </h3>
                                            <p className="text-gray-700 dark:text-gray-300 mb-4">
                                                {analysisResults.hierarchical_summary.executive_summary.main_finding}
                                            </p>
                                            <div className="flex items-center gap-4">
                                                <div className="text-center px-4 py-2 bg-gray-50 dark:bg-gray-900 rounded">
                                                    <div className="text-xl font-bold text-blue-600">{analysisResults.entities.length}</div>
                                                    <div className="text-xs text-gray-500">Entities</div>
                                                </div>
                                                <div className="text-center px-4 py-2 bg-gray-50 dark:bg-gray-900 rounded">
                                                    <div className="text-xl font-bold text-purple-600">{analysisResults.claims.length}</div>
                                                    <div className="text-xs text-gray-500">Claims</div>
                                                </div>
                                                <button
                                                    onClick={() => setActiveTab('analysis')}
                                                    className="ml-auto text-sm text-blue-600 hover:underline"
                                                >
                                                    View full analysis
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Analysis Tab */}
                            {activeTab === 'analysis' && (
                                <div className="h-full flex flex-col">
                                    {!analysisResults && !isAnalyzing && (
                                        <div className="flex-1 flex items-center justify-center">
                                            <div className="text-center">
                                                <DocumentMagnifyingGlassIcon className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                                                <p className="text-gray-600 dark:text-gray-400 mb-4">
                                                    {article.abstract ? 'Run AI analysis to extract insights from this article' : 'No abstract available for analysis'}
                                                </p>
                                                {article.abstract && (
                                                    <button
                                                        onClick={runAnalysis}
                                                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                                                    >
                                                        <DocumentMagnifyingGlassIcon className="h-5 w-5" />
                                                        Run Analysis
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {isAnalyzing && (
                                        <div className="flex-1 flex items-center justify-center">
                                            <div className="w-full max-w-md p-6">
                                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 text-center">
                                                    {currentMessage}
                                                </p>
                                                <div className="space-y-3">
                                                    {progressSteps.map((step) => (
                                                        <div key={step.id} className="flex items-center gap-3">
                                                            <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                                                                step.status === 'pending' ? 'bg-gray-200 dark:bg-gray-700' :
                                                                step.status === 'active' ? 'bg-blue-500 animate-pulse' :
                                                                step.status === 'complete' ? 'bg-green-500' :
                                                                'bg-red-500'
                                                            }`}>
                                                                {step.status === 'active' && (
                                                                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                                    </svg>
                                                                )}
                                                                {step.status === 'complete' && (
                                                                    <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                )}
                                                                {step.status === 'error' && (
                                                                    <XMarkIcon className="h-4 w-4 text-white" />
                                                                )}
                                                            </div>
                                                            <div className="flex-1">
                                                                <span className={`text-sm font-medium ${
                                                                    step.status === 'pending' ? 'text-gray-400' :
                                                                    step.status === 'active' ? 'text-blue-600 dark:text-blue-400' :
                                                                    step.status === 'complete' ? 'text-green-600 dark:text-green-400' :
                                                                    'text-red-600'
                                                                }`}>
                                                                    {step.label}
                                                                </span>
                                                                {step.result && (
                                                                    <span className="ml-2 text-xs text-gray-500">({step.result})</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {analysisError && (
                                        <div className="p-4">
                                            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                                                <p className="text-red-800 dark:text-red-200">{analysisError}</p>
                                            </div>
                                        </div>
                                    )}

                                    {analysisResults && (
                                        <div className="flex-1 flex flex-col p-4 gap-4">
                                            {/* Stats bar */}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-6">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-2xl font-bold text-blue-600">{analysisResults.hierarchical_summary.sections.length}</span>
                                                        <span className="text-sm text-gray-500">Sections</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-2xl font-bold text-green-600">{analysisResults.entities.length}</span>
                                                        <span className="text-sm text-gray-500">Entities</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-2xl font-bold text-purple-600">{analysisResults.claims.length}</span>
                                                        <span className="text-sm text-gray-500">Claims</span>
                                                    </div>
                                                </div>

                                                {/* View toggle */}
                                                <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                                                    {viewModes.map(({ id, label }) => (
                                                        <button
                                                            key={id}
                                                            onClick={() => setViewMode(id)}
                                                            className={`px-3 py-1 rounded text-sm ${
                                                                viewMode === id
                                                                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                                                                    : 'text-gray-600 dark:text-gray-400'
                                                            }`}
                                                        >
                                                            {label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Visualization */}
                                            <div className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden" style={{ minHeight: '400px' }}>
                                                {viewMode === 'tree' && (
                                                    <TreeView
                                                        results={analysisResults}
                                                        onNodeSelect={setSelectedNodeId}
                                                        selectedNodeId={selectedNodeId}
                                                    />
                                                )}
                                                {viewMode === 'graph' && (
                                                    <GraphView
                                                        results={analysisResults}
                                                        onNodeSelect={setSelectedNodeId}
                                                        selectedNodeId={selectedNodeId}
                                                    />
                                                )}
                                                {viewMode === 'split' && (
                                                    <SplitView
                                                        results={analysisResults}
                                                        originalText={article.abstract || ''}
                                                        onNodeSelect={setSelectedNodeId}
                                                        selectedNodeId={selectedNodeId}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Notes Tab */}
                            {activeTab === 'notes' && (
                                <div className="h-full flex flex-col p-4">
                                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                                        Notes
                                    </h2>
                                    <textarea
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        placeholder="Add your notes about this article..."
                                        className="flex-1 w-full p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                    <p className="mt-2 text-xs text-gray-500">
                                        Notes are saved locally in this session
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
