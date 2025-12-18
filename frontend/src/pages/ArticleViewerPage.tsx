import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
    ArrowLeftIcon,
    DocumentMagnifyingGlassIcon,
    ArrowTopRightOnSquareIcon,
    XMarkIcon,
    DocumentTextIcon,
    BeakerIcon,
    PencilSquareIcon,
    ChatBubbleLeftRightIcon
} from '@heroicons/react/24/outline';
import { articleApi } from '../lib/api/articleApi';
import { documentAnalysisApi } from '../lib/api/documentAnalysisApi';
import { CanonicalResearchArticle } from '../types/canonical_types';
import {
    DocumentAnalysisResult,
    ViewMode,
    AnalysisStreamMessage
} from '../types/document_analysis';
import { TreeView, GraphView, SplitView } from '../components/tools/DocumentAnalysis';

interface ProgressStep {
    id: string;
    label: string;
    status: 'pending' | 'active' | 'complete' | 'error';
    result?: string;
}

type WorkspaceTab = 'overview' | 'analysis' | 'notes' | 'chat';

export default function ArticleViewerPage() {
    const { pmid } = useParams<{ pmid: string }>();
    const [article, setArticle] = useState<CanonicalResearchArticle | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Workspace state
    const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
    const [notes, setNotes] = useState<string>('');

    // Analysis state
    const [analysisResults, setAnalysisResults] = useState<DocumentAnalysisResult | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);
    const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);
    const [currentMessage, setCurrentMessage] = useState<string>('');
    const [viewMode, setViewMode] = useState<ViewMode>('tree');
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

    useEffect(() => {
        if (pmid) {
            fetchArticle(pmid);
        }
    }, [pmid]);

    const fetchArticle = async (pmid: string) => {
        setLoading(true);
        setError(null);
        try {
            const data = await articleApi.getArticleByPmid(pmid);
            setArticle(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load article');
        } finally {
            setLoading(false);
        }
    };

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
        setAnalysisResults(null);
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
                setAnalysisResults(result);
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

    const tabs = [
        { id: 'overview' as WorkspaceTab, label: 'Overview', icon: DocumentTextIcon },
        { id: 'analysis' as WorkspaceTab, label: 'Analysis', icon: BeakerIcon },
        { id: 'notes' as WorkspaceTab, label: 'Notes', icon: PencilSquareIcon },
        { id: 'chat' as WorkspaceTab, label: 'Chat', icon: ChatBubbleLeftRightIcon }
    ];

    const viewModes = [
        { id: 'tree' as ViewMode, label: 'Tree' },
        { id: 'graph' as ViewMode, label: 'Graph' },
        { id: 'split' as ViewMode, label: 'Split' }
    ];

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="animate-pulse space-y-4 w-full max-w-2xl px-4">
                    <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                    <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded"></div>
                </div>
            </div>
        );
    }

    if (error || !article) {
        return (
            <div className="h-full flex items-center justify-center p-4">
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 max-w-md">
                    <h2 className="text-red-800 dark:text-red-200 font-medium">Error loading article</h2>
                    <p className="text-red-600 dark:text-red-300 mt-2">{error || 'Article not found'}</p>
                    <Link to="/reports" className="inline-flex items-center gap-2 mt-4 text-blue-600 hover:underline">
                        <ArrowLeftIcon className="h-4 w-4" />
                        Back to Reports
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            {/* Top bar with back button */}
            <div className="flex-shrink-0 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <Link
                    to="/reports"
                    className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                >
                    <ArrowLeftIcon className="h-4 w-4" />
                    Back to Reports
                </Link>
            </div>

            {/* Main workbench area */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left sidebar - Article metadata */}
                <div className="w-80 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-y-auto">
                    <div className="p-4 space-y-4">
                        {/* Title */}
                        <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
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

                        {/* Volume/Issue/Pages */}
                        {(article.source_metadata?.volume || article.source_metadata?.issue || article.source_metadata?.pages) && (
                            <div>
                                <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                                    Citation
                                </h3>
                                <p className="text-sm text-gray-700 dark:text-gray-300">
                                    {[
                                        article.source_metadata?.volume && `Vol. ${article.source_metadata.volume}`,
                                        article.source_metadata?.issue && `Issue ${article.source_metadata.issue}`,
                                        article.source_metadata?.pages && `pp. ${article.source_metadata.pages}`
                                    ].filter(Boolean).join(', ')}
                                </p>
                            </div>
                        )}

                        {/* Divider */}
                        <hr className="border-gray-200 dark:border-gray-700" />

                        {/* External Links */}
                        <div>
                            <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                                Links
                            </h3>
                            <div className="space-y-2">
                                {article.pmid && (
                                    <a
                                        href={`https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center justify-between px-3 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-md text-sm hover:bg-blue-100 dark:hover:bg-blue-900/30"
                                    >
                                        <span>PubMed: {article.pmid}</span>
                                        <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                                    </a>
                                )}
                                {article.doi && (
                                    <a
                                        href={`https://doi.org/${article.doi}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center justify-between px-3 py-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-md text-sm hover:bg-green-100 dark:hover:bg-green-900/30"
                                    >
                                        <span>DOI</span>
                                        <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                                    </a>
                                )}
                                {article.source_metadata?.pmc_id && (
                                    <a
                                        href={`https://www.ncbi.nlm.nih.gov/pmc/articles/${article.source_metadata.pmc_id}/`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center justify-between px-3 py-2 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded-md text-sm hover:bg-purple-100 dark:hover:bg-purple-900/30"
                                    >
                                        <span>Full Text (PMC)</span>
                                        <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                                    </a>
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
                                            className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded text-xs"
                                        >
                                            {kw}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* MeSH Terms */}
                        {article.mesh_terms && article.mesh_terms.length > 0 && (
                            <div>
                                <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                                    MeSH Terms
                                </h3>
                                <div className="flex flex-wrap gap-1">
                                    {article.mesh_terms.map((term, idx) => (
                                        <span
                                            key={idx}
                                            className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded text-xs"
                                        >
                                            {term}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right workspace - Tabbed content */}
                <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
                    {/* Tab bar */}
                    <div className="flex-shrink-0 flex items-center gap-1 px-4 pt-3 bg-gray-50 dark:bg-gray-900">
                        {tabs.map(({ id, label, icon: Icon }) => (
                            <button
                                key={id}
                                onClick={() => setActiveTab(id)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
                                    activeTab === id
                                        ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-t border-l border-r border-gray-200 dark:border-gray-700'
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
                    <div className="flex-1 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 overflow-y-auto">
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

                        {/* Chat Tab */}
                        {activeTab === 'chat' && (
                            <div className="h-full flex items-center justify-center">
                                <div className="text-center text-gray-500 dark:text-gray-400">
                                    <ChatBubbleLeftRightIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                    <p>Chat with this article coming soon</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
