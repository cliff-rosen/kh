/**
 * Report Review - Detailed view for approving/rejecting a single report
 *
 * Route: /operations/reports/:reportId
 * Features:
 * - View execution details (when ran, duration, filtering stats)
 * - View executive summary
 * - View articles by category (WIPP-style)
 * - Remove articles or change categories
 * - Approve or reject with reason
 * - View approval history
 */

import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
    ArrowLeftIcon,
    CheckIcon,
    XMarkIcon,
    ChevronDownIcon,
    ChevronRightIcon,
    TrashIcon,
    PencilIcon,
    ClockIcon,
    FunnelIcon,
    DocumentTextIcon,
    CheckCircleIcon,
    XCircleIcon,
} from '@heroicons/react/24/outline';

interface Article {
    article_id: number;
    title: string;
    authors: string[];
    journal: string;
    year: string;
    pmid: string;
    category_id: string;
    relevance_score: number;
    abstract?: string;
    filter_passed: boolean;
    filter_reason?: string;
}

interface Category {
    id: string;
    name: string;
    article_count: number;
}

// Types matching new schema
type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed';
type RunType = 'scheduled' | 'manual' | 'test';
type ApprovalStatus = 'awaiting_approval' | 'approved' | 'rejected';

// WIP article from pipeline - tracks full journey through the pipeline
interface WipArticle {
    id: number;
    title: string;
    authors: string[];
    journal: string;
    year: string;
    pmid: string;
    abstract?: string;
    // Pipeline status
    is_duplicate: boolean;
    duplicate_of_id?: number;
    passed_semantic_filter: boolean | null;  // null = not yet processed
    filter_rejection_reason?: string;
    included_in_report: boolean;
    presentation_categories: string[];
    relevance_score?: number;
}

interface PipelineExecution {
    id: string;  // UUID
    stream_id: number;
    status: ExecutionStatus;
    run_type: RunType;
    started_at: string | null;
    completed_at: string | null;
    error: string | null;
    report_id: number | null;
    // Extended pipeline metrics (from report.pipeline_metrics)
    articles_retrieved?: number;
    articles_after_dedup?: number;
    articles_after_filter?: number;
    filter_config?: string;
}

// Mock data - report only exists after successful pipeline execution
const mockReport = {
    report_id: 101,
    report_name: '2024.01.15',
    stream_id: 1,
    stream_name: 'Oncology Weekly',
    run_type: 'scheduled' as RunType,
    approval_status: 'awaiting_approval' as ApprovalStatus,
    created_at: '2024-01-15T10:00:00Z',
    article_count: 47,
    pipeline_execution_id: 'exec-001',  // UUID linking to pipeline_executions
    // Execution details - comes from joining pipeline_executions + report.pipeline_metrics
    execution: {
        id: 'exec-001',
        stream_id: 1,
        status: 'completed' as ExecutionStatus,
        run_type: 'scheduled' as RunType,
        started_at: '2024-01-15T08:00:00Z',
        completed_at: '2024-01-15T08:45:00Z',
        error: null,
        report_id: 101,
        // These come from report.pipeline_metrics
        articles_retrieved: 156,
        articles_after_dedup: 142,
        articles_after_filter: 47,
        filter_config: 'Relevance > 0.7, English only, Human studies',
    } as PipelineExecution,
    // Approval history (if any)
    approval_history: [] as Array<{
        action: 'approved' | 'rejected';
        by: string;
        at: string;
        reason?: string;
    }>,
    executive_summary: `This week's literature review identified 47 articles across 4 categories. Key findings include:

**Clinical Trials (12 articles):**
- Phase 3 results for pembrolizumab combination therapy showing improved PFS in NSCLC
- New biomarker data from CheckMate-227 long-term follow-up

**Treatment Updates (15 articles):**
- FDA advisory committee recommends approval of novel ADC for breast cancer
- Updated NCCN guidelines for first-line EGFR-mutated NSCLC

**Biomarkers (10 articles):**
- Liquid biopsy concordance study with tissue-based testing
- Novel ctDNA assay demonstrates high sensitivity for minimal residual disease

**Guidelines (10 articles):**
- ESMO updates recommendations for immunotherapy sequencing
- ASCO guideline update on antiemetic prophylaxis`,
    categories: [
        { id: 'clinical_trials', name: 'Clinical Trials', article_count: 12 },
        { id: 'treatment_updates', name: 'Treatment Updates', article_count: 15 },
        { id: 'biomarkers', name: 'Biomarkers', article_count: 10 },
        { id: 'guidelines', name: 'Guidelines', article_count: 10 },
    ] as Category[],
};

const mockArticles: Article[] = [
    { article_id: 1, title: 'Phase 3 Results of Pembrolizumab Plus Chemotherapy in Advanced NSCLC', authors: ['Smith J', 'Johnson M', 'et al'], journal: 'Journal of Clinical Oncology', year: '2024', pmid: '12345678', category_id: 'clinical_trials', relevance_score: 0.95, filter_passed: true, abstract: 'Background: Pembrolizumab combined with chemotherapy has shown promising results in non-small cell lung cancer. Methods: We conducted a phase 3 randomized trial...' },
    { article_id: 2, title: 'CheckMate-227: 5-Year Overall Survival Update', authors: ['Brown A', 'Davis R', 'et al'], journal: 'NEJM', year: '2024', pmid: '12345679', category_id: 'clinical_trials', relevance_score: 0.92, filter_passed: true, abstract: 'We report the 5-year overall survival results from the CheckMate-227 trial evaluating nivolumab plus ipilimumab...' },
    { article_id: 3, title: 'Novel Antibody-Drug Conjugate for HER2-Low Breast Cancer', authors: ['Wilson K', 'et al'], journal: 'Lancet Oncology', year: '2024', pmid: '12345680', category_id: 'treatment_updates', relevance_score: 0.89, filter_passed: true },
    { article_id: 4, title: 'Liquid Biopsy vs Tissue Testing: A Concordance Analysis', authors: ['Lee S', 'et al'], journal: 'Cancer Discovery', year: '2024', pmid: '12345681', category_id: 'biomarkers', relevance_score: 0.88, filter_passed: true },
    { article_id: 5, title: 'ESMO Consensus Guidelines for Immunotherapy Sequencing', authors: ['ESMO Panel'], journal: 'Annals of Oncology', year: '2024', pmid: '12345682', category_id: 'guidelines', relevance_score: 0.91, filter_passed: true },
];

// Full WIP articles from pipeline - includes all retrieved articles and their journey
const mockWipArticles: WipArticle[] = [
    // Included in report (47 total, showing sample)
    { id: 1, title: 'Phase 3 Results of Pembrolizumab Plus Chemotherapy in Advanced NSCLC', authors: ['Smith J', 'Johnson M', 'et al'], journal: 'Journal of Clinical Oncology', year: '2024', pmid: '12345678', is_duplicate: false, passed_semantic_filter: true, included_in_report: true, presentation_categories: ['clinical_trials'], relevance_score: 0.95, abstract: 'Background: Pembrolizumab combined with chemotherapy has shown promising results...' },
    { id: 2, title: 'CheckMate-227: 5-Year Overall Survival Update', authors: ['Brown A', 'Davis R', 'et al'], journal: 'NEJM', year: '2024', pmid: '12345679', is_duplicate: false, passed_semantic_filter: true, included_in_report: true, presentation_categories: ['clinical_trials'], relevance_score: 0.92, abstract: 'We report the 5-year overall survival results from the CheckMate-227 trial...' },
    { id: 3, title: 'Novel Antibody-Drug Conjugate for HER2-Low Breast Cancer', authors: ['Wilson K', 'et al'], journal: 'Lancet Oncology', year: '2024', pmid: '12345680', is_duplicate: false, passed_semantic_filter: true, included_in_report: true, presentation_categories: ['treatment_updates'], relevance_score: 0.89 },
    { id: 4, title: 'Liquid Biopsy vs Tissue Testing: A Concordance Analysis', authors: ['Lee S', 'et al'], journal: 'Cancer Discovery', year: '2024', pmid: '12345681', is_duplicate: false, passed_semantic_filter: true, included_in_report: true, presentation_categories: ['biomarkers'], relevance_score: 0.88 },
    { id: 5, title: 'ESMO Consensus Guidelines for Immunotherapy Sequencing', authors: ['ESMO Panel'], journal: 'Annals of Oncology', year: '2024', pmid: '12345682', is_duplicate: false, passed_semantic_filter: true, included_in_report: true, presentation_categories: ['guidelines'], relevance_score: 0.91 },

    // Duplicates (14 total - these were filtered as duplicates of articles already in DB)
    { id: 101, title: 'Pembrolizumab Plus Chemotherapy Phase 3 Trial Results', authors: ['Smith J', 'et al'], journal: 'JCO Oncology Practice', year: '2024', pmid: '12345690', is_duplicate: true, duplicate_of_id: 1, passed_semantic_filter: null, included_in_report: false, presentation_categories: [] },
    { id: 102, title: 'Five-Year Update from CheckMate-227', authors: ['Brown A', 'et al'], journal: 'NEJM Evidence', year: '2024', pmid: '12345691', is_duplicate: true, duplicate_of_id: 2, passed_semantic_filter: null, included_in_report: false, presentation_categories: [] },
    { id: 103, title: 'CheckMate-227 Long-term Survival Data', authors: ['Davis R', 'Brown A'], journal: 'Journal of Thoracic Oncology', year: '2024', pmid: '12345692', is_duplicate: true, duplicate_of_id: 2, passed_semantic_filter: null, included_in_report: false, presentation_categories: [] },

    // Filtered out by semantic filter (95 total - didn't meet relevance threshold)
    { id: 201, title: 'Cost-Effectiveness Analysis of Cancer Screening Programs in Rural Areas', authors: ['Garcia M', 'et al'], journal: 'Health Economics', year: '2024', pmid: '12345700', is_duplicate: false, passed_semantic_filter: false, filter_rejection_reason: 'Low relevance (0.32) - primarily health economics focus, not clinical oncology', included_in_report: false, presentation_categories: [], relevance_score: 0.32 },
    { id: 202, title: 'Nursing Workforce Challenges in Oncology Departments', authors: ['Thompson L', 'et al'], journal: 'Oncology Nursing Forum', year: '2024', pmid: '12345701', is_duplicate: false, passed_semantic_filter: false, filter_rejection_reason: 'Low relevance (0.28) - healthcare workforce topic, not clinical research', included_in_report: false, presentation_categories: [], relevance_score: 0.28 },
    { id: 203, title: 'Patient Experience Surveys in Chemotherapy Infusion Centers', authors: ['Miller R', 'et al'], journal: 'Patient Experience Journal', year: '2024', pmid: '12345702', is_duplicate: false, passed_semantic_filter: false, filter_rejection_reason: 'Low relevance (0.41) - patient experience metrics, not treatment outcomes', included_in_report: false, presentation_categories: [], relevance_score: 0.41 },
    { id: 204, title: 'Administrative Burden in Cancer Clinical Trials', authors: ['Chen W', 'et al'], journal: 'Clinical Trials', year: '2024', pmid: '12345703', is_duplicate: false, passed_semantic_filter: false, filter_rejection_reason: 'Low relevance (0.45) - trial administration topic', included_in_report: false, presentation_categories: [], relevance_score: 0.45 },
    { id: 205, title: 'Telemedicine Adoption in Oncology During Post-Pandemic Era', authors: ['Anderson K', 'et al'], journal: 'JCO Clinical Cancer Informatics', year: '2024', pmid: '12345704', is_duplicate: false, passed_semantic_filter: false, filter_rejection_reason: 'Low relevance (0.52) - telemedicine utilization, not clinical outcomes', included_in_report: false, presentation_categories: [], relevance_score: 0.52 },
    { id: 206, title: 'Pediatric Leukemia Treatment Protocols: A Meta-Analysis', authors: ['Roberts J', 'et al'], journal: 'Pediatric Blood & Cancer', year: '2024', pmid: '12345705', is_duplicate: false, passed_semantic_filter: false, filter_rejection_reason: 'Out of scope - pediatric oncology (stream focuses on adult solid tumors)', included_in_report: false, presentation_categories: [], relevance_score: 0.65 },
];

type PipelineTab = 'included' | 'duplicates' | 'filtered_out';

export default function ReportReview() {
    const { reportId } = useParams<{ reportId: string }>();
    const navigate = useNavigate();
    const [expandedCategories, setExpandedCategories] = useState<string[]>(['clinical_trials']);
    const [removedArticles, setRemovedArticles] = useState<number[]>([]);
    const [categoryChanges, setCategoryChanges] = useState<Record<number, string>>({});
    const [rejectionReason, setRejectionReason] = useState('');
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [pipelineTab, setPipelineTab] = useState<PipelineTab>('included');

    // Compute article counts for pipeline tabs
    const includedArticles = mockWipArticles.filter(a => a.included_in_report);
    const duplicateArticles = mockWipArticles.filter(a => a.is_duplicate);
    const filteredOutArticles = mockWipArticles.filter(a => !a.is_duplicate && a.passed_semantic_filter === false);

    const toggleCategory = (categoryId: string) => {
        setExpandedCategories((prev) =>
            prev.includes(categoryId) ? prev.filter((id) => id !== categoryId) : [...prev, categoryId]
        );
    };

    const removeArticle = (articleId: number) => {
        setRemovedArticles((prev) => [...prev, articleId]);
    };

    const restoreArticle = (articleId: number) => {
        setRemovedArticles((prev) => prev.filter((id) => id !== articleId));
    };

    const changeCategory = (articleId: number, newCategoryId: string) => {
        setCategoryChanges((prev) => ({ ...prev, [articleId]: newCategoryId }));
    };

    const getArticlesForCategory = (categoryId: string) => {
        return mockArticles.filter((a) => {
            const effectiveCategory = categoryChanges[a.article_id] || a.category_id;
            return effectiveCategory === categoryId && !removedArticles.includes(a.article_id);
        });
    };

    const hasChanges = removedArticles.length > 0 || Object.keys(categoryChanges).length > 0;

    const handleApprove = () => {
        // TODO: API call
        console.log('Approving report', { removedArticles, categoryChanges });
        navigate('/operations/reports');
    };

    const handleReject = () => {
        // TODO: API call
        console.log('Rejecting report', { reason: rejectionReason });
        setShowRejectModal(false);
        navigate('/operations/reports');
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link to="/operations/reports" className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                        <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            Review: {mockReport.stream_name}
                        </h1>
                        <p className="text-gray-600 dark:text-gray-400">
                            {mockReport.report_name} · {mockReport.article_count} articles · {mockReport.run_type}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {hasChanges && (
                        <span className="text-sm text-yellow-600 dark:text-yellow-400">
                            Unsaved changes
                        </span>
                    )}
                    <button
                        onClick={() => setShowRejectModal(true)}
                        className="px-4 py-2 border border-red-600 text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                    >
                        <XMarkIcon className="h-4 w-4" />
                        Reject
                    </button>
                    <button
                        onClick={handleApprove}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                    >
                        <CheckIcon className="h-4 w-4" />
                        Approve
                    </button>
                </div>
            </div>

            {/* Execution Details */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <ClockIcon className="h-5 w-5 text-gray-400" />
                    Execution Details
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Started</p>
                        <p className="font-medium text-gray-900 dark:text-white">
                            {mockReport.execution.started_at
                                ? new Date(mockReport.execution.started_at).toLocaleString()
                                : 'N/A'}
                        </p>
                    </div>
                    <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Duration</p>
                        <p className="font-medium text-gray-900 dark:text-white">
                            {mockReport.execution.started_at && mockReport.execution.completed_at
                                ? `${Math.round((new Date(mockReport.execution.completed_at).getTime() - new Date(mockReport.execution.started_at).getTime()) / 60000)} minutes`
                                : 'N/A'}
                        </p>
                    </div>
                    <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Run Type</p>
                        <p className="font-medium text-gray-900 dark:text-white capitalize">
                            {mockReport.run_type}
                        </p>
                    </div>
                    <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Status</p>
                        <ApprovalStatusBadge status={mockReport.approval_status} />
                    </div>
                </div>

                {/* Filter funnel */}
                <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2 mb-3">
                        <FunnelIcon className="h-4 w-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Article Filtering Pipeline</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                        <div className="px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded">
                            <p className="text-gray-500 dark:text-gray-400">Retrieved</p>
                            <p className="font-semibold text-gray-900 dark:text-white">{mockReport.execution.articles_retrieved}</p>
                        </div>
                        <span className="text-gray-400">→</span>
                        <div className="px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded">
                            <p className="text-gray-500 dark:text-gray-400">After Dedup</p>
                            <p className="font-semibold text-gray-900 dark:text-white">{mockReport.execution.articles_after_dedup}</p>
                        </div>
                        <span className="text-gray-400">→</span>
                        <div className="px-3 py-2 bg-blue-100 dark:bg-blue-900/30 rounded">
                            <p className="text-blue-600 dark:text-blue-400">After Filter</p>
                            <p className="font-semibold text-blue-700 dark:text-blue-300">{mockReport.execution.articles_after_filter}</p>
                        </div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        Filter: {mockReport.execution.filter_config}
                    </p>
                </div>
            </div>

            {/* Executive Summary */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <DocumentTextIcon className="h-5 w-5 text-gray-400" />
                        Executive Summary
                    </h2>
                    <button className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                        <PencilIcon className="h-4 w-4" />
                        Edit
                    </button>
                </div>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                    <pre className="whitespace-pre-wrap font-sans text-gray-700 dark:text-gray-300">
                        {mockReport.executive_summary}
                    </pre>
                </div>
            </div>

            {/* Pipeline Articles - Browse all stages */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Pipeline Articles</h2>

                    {/* Pipeline tabs */}
                    <div className="flex gap-1 bg-gray-100 dark:bg-gray-900 rounded-lg p-1">
                        <button
                            onClick={() => setPipelineTab('included')}
                            className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                                pipelineTab === 'included'
                                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow'
                                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                            }`}
                        >
                            Included in Report
                            <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                                {includedArticles.length}
                            </span>
                        </button>
                        <button
                            onClick={() => setPipelineTab('duplicates')}
                            className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                                pipelineTab === 'duplicates'
                                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow'
                                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                            }`}
                        >
                            Duplicates
                            <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                                {duplicateArticles.length}
                            </span>
                        </button>
                        <button
                            onClick={() => setPipelineTab('filtered_out')}
                            className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                                pipelineTab === 'filtered_out'
                                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow'
                                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                            }`}
                        >
                            Filtered Out
                            <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                                {filteredOutArticles.length}
                            </span>
                        </button>
                    </div>
                </div>

                {/* Tab content */}
                <div className="p-4">
                    {pipelineTab === 'included' && (
                        <div>
                            {/* Category view for included articles */}
                            {mockReport.categories.map((category) => {
                                const articles = getArticlesForCategory(category.id);
                                const isExpanded = expandedCategories.includes(category.id);

                                return (
                                    <div key={category.id} className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                                        <button
                                            onClick={() => toggleCategory(category.id)}
                                            className="w-full px-2 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 rounded"
                                        >
                                            <div className="flex items-center gap-2">
                                                {isExpanded ? (
                                                    <ChevronDownIcon className="h-4 w-4 text-gray-400" />
                                                ) : (
                                                    <ChevronRightIcon className="h-4 w-4 text-gray-400" />
                                                )}
                                                <span className="font-medium text-gray-900 dark:text-white">{category.name}</span>
                                                <span className="text-sm text-gray-500 dark:text-gray-400">
                                                    ({articles.length})
                                                </span>
                                            </div>
                                        </button>

                                        {isExpanded && (
                                            <div className="pl-6 pb-4 space-y-2">
                                                {articles.map((article) => (
                                                    <ArticleCard
                                                        key={article.article_id}
                                                        article={article}
                                                        categories={mockReport.categories}
                                                        currentCategory={categoryChanges[article.article_id] || article.category_id}
                                                        onRemove={() => removeArticle(article.article_id)}
                                                        onChangeCategory={(newCat) => changeCategory(article.article_id, newCat)}
                                                    />
                                                ))}
                                                {articles.length === 0 && (
                                                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                                                        No articles in this category
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {/* Removed Articles */}
                            {removedArticles.length > 0 && (
                                <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                                    <h3 className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">
                                        Articles to be removed ({removedArticles.length})
                                    </h3>
                                    <div className="space-y-2">
                                        {removedArticles.map((articleId) => {
                                            const article = mockArticles.find((a) => a.article_id === articleId);
                                            if (!article) return null;
                                            return (
                                                <div key={articleId} className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded">
                                                    <span className="text-sm text-gray-600 dark:text-gray-400 line-through">
                                                        {article.title}
                                                    </span>
                                                    <button
                                                        onClick={() => restoreArticle(articleId)}
                                                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                                    >
                                                        Restore
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {pipelineTab === 'duplicates' && (
                        <div className="space-y-3">
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                                These articles were detected as duplicates of existing articles and excluded from processing.
                            </p>
                            {duplicateArticles.map((article) => (
                                <WipArticleCard key={article.id} article={article} type="duplicate" />
                            ))}
                            {duplicateArticles.length === 0 && (
                                <p className="text-center text-gray-500 dark:text-gray-400 py-8">No duplicates detected</p>
                            )}
                        </div>
                    )}

                    {pipelineTab === 'filtered_out' && (
                        <div className="space-y-3">
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                                These articles did not pass the semantic filter and were excluded from the report.
                            </p>
                            {filteredOutArticles.map((article) => (
                                <WipArticleCard key={article.id} article={article} type="filtered" />
                            ))}
                            {filteredOutArticles.length === 0 && (
                                <p className="text-center text-gray-500 dark:text-gray-400 py-8">No articles filtered out</p>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Reject Modal */}
            {showRejectModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            Reject Report
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                            Please provide a reason for rejecting this report. This will be visible to the stream owner.
                        </p>
                        <textarea
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            placeholder="Reason for rejection..."
                            rows={4}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                        <div className="flex justify-end gap-3 mt-4">
                            <button
                                onClick={() => setShowRejectModal(false)}
                                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleReject}
                                disabled={!rejectionReason.trim()}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                            >
                                Reject Report
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function ArticleCard({
    article,
    categories,
    currentCategory,
    onRemove,
    onChangeCategory,
}: {
    article: Article;
    categories: Category[];
    currentCategory: string;
    onRemove: () => void;
    onChangeCategory: (categoryId: string) => void;
}) {
    const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
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
                        <div>
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
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                                    {(article.relevance_score * 100).toFixed(0)}% relevant
                                </span>
                                {article.filter_passed && (
                                    <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-0.5">
                                        <CheckCircleIcon className="h-3 w-3" />
                                        Passed filter
                                    </span>
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
                <div className="flex items-center gap-2">
                    {/* Category Selector */}
                    <div className="relative">
                        <button
                            onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                            className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                            {categories.find((c) => c.id === currentCategory)?.name || 'Category'}
                            <ChevronDownIcon className="h-3 w-3 inline ml-1" />
                        </button>
                        {showCategoryDropdown && (
                            <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10">
                                {categories.map((cat) => (
                                    <button
                                        key={cat.id}
                                        onClick={() => {
                                            onChangeCategory(cat.id);
                                            setShowCategoryDropdown(false);
                                        }}
                                        className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${
                                            cat.id === currentCategory ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600' : ''
                                        }`}
                                    >
                                        {cat.name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    {/* Remove Button */}
                    <button
                        onClick={onRemove}
                        className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                        title="Remove from report"
                    >
                        <TrashIcon className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}

function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
    const config = {
        awaiting_approval: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300', icon: null, label: 'Awaiting Approval' },
        approved: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', icon: CheckCircleIcon, label: 'Approved' },
        rejected: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', icon: XCircleIcon, label: 'Rejected' },
    };
    const { bg, text, icon: Icon, label } = config[status];
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-1 text-sm font-medium rounded ${bg} ${text}`}>
            {Icon && <Icon className="h-4 w-4" />}
            {label}
        </span>
    );
}

// Card for displaying WIP articles in duplicates and filtered out tabs
function WipArticleCard({ article, type }: { article: WipArticle; type: 'duplicate' | 'filtered' }) {
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
                                {article.relevance_score !== undefined && (
                                    <span className="text-xs px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded">
                                        {(article.relevance_score * 100).toFixed(0)}% relevance
                                    </span>
                                )}
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
