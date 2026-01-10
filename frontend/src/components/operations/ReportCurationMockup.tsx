/**
 * Report Curation View - Mockup
 *
 * This is a mockup of the enhanced curation experience for reviewing
 * and approving reports. Shows:
 * - Report content editing (title, summaries)
 * - Article curation (include/exclude, categorize, reorder)
 * - Curation notes for retrieval improvement
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
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
    ArrowsUpDownIcon,
    ChatBubbleLeftIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon,
    ClockIcon,
} from '@heroicons/react/24/outline';

// Mock data for the curation view
const MOCK_REPORT = {
    execution_id: 'exec-001',
    report_id: 101,
    report_name: 'Weekly Oncology Update - Jan 6, 2025',
    original_report_name: 'Weekly Oncology Update - Jan 6, 2025',
    stream_name: 'Oncology Research',
    status: 'pending_approval',
    created_at: '2025-01-06T14:30:00Z',
    date_range: 'Dec 30, 2024 - Jan 6, 2025',
    executive_summary: `This week's oncology research highlights significant advances in immunotherapy resistance mechanisms and novel drug delivery systems. Three key studies demonstrate promising results in overcoming PD-1 resistance through combination therapies, while two breakthrough papers introduce nanoparticle-based targeting approaches for solid tumors.

Notable findings include a Phase II trial showing 40% improvement in response rates when combining checkpoint inhibitors with metabolic modulators, and preclinical evidence supporting a new class of bispecific antibodies for treatment-resistant melanoma.`,
    original_executive_summary: `This week's oncology research highlights significant advances in immunotherapy resistance mechanisms and novel drug delivery systems. Three key studies demonstrate promising results in overcoming PD-1 resistance through combination therapies, while two breakthrough papers introduce nanoparticle-based targeting approaches for solid tumors.

Notable findings include a Phase II trial showing 40% improvement in response rates when combining checkpoint inhibitors with metabolic modulators, and preclinical evidence supporting a new class of bispecific antibodies for treatment-resistant melanoma.`,
    categories: [
        {
            id: 'immunotherapy',
            name: 'Immunotherapy',
            summary: 'Three studies this week focused on overcoming resistance to checkpoint inhibitors. The standout paper from MD Anderson demonstrates that metabolic reprogramming of the tumor microenvironment can restore T-cell function in previously unresponsive patients.',
            original_summary: 'Three studies this week focused on overcoming resistance to checkpoint inhibitors. The standout paper from MD Anderson demonstrates that metabolic reprogramming of the tumor microenvironment can restore T-cell function in previously unresponsive patients.',
            article_count: 8,
        },
        {
            id: 'drug-delivery',
            name: 'Drug Delivery',
            summary: 'Novel nanoparticle formulations show promise for targeted delivery to solid tumors, with two papers reporting improved penetration and reduced off-target effects.',
            original_summary: 'Novel nanoparticle formulations show promise for targeted delivery to solid tumors, with two papers reporting improved penetration and reduced off-target effects.',
            article_count: 5,
        },
        {
            id: 'biomarkers',
            name: 'Biomarkers',
            summary: 'New liquid biopsy approaches enable earlier detection of treatment resistance, potentially allowing for timely therapeutic adjustments.',
            original_summary: 'New liquid biopsy approaches enable earlier detection of treatment resistance, potentially allowing for timely therapeutic adjustments.',
            article_count: 4,
        },
    ],
};

const MOCK_ARTICLES = {
    included: [
        {
            id: 1,
            title: 'Metabolic reprogramming restores T-cell function in checkpoint inhibitor-resistant tumors',
            authors: ['Zhang Y', 'Smith J', 'Johnson M', 'et al.'],
            journal: 'Nature Medicine',
            date: '2025-01-04',
            category: 'immunotherapy',
            ranking: 1,
            ai_summary: 'This study demonstrates that targeting tumor metabolism can overcome resistance to PD-1 inhibitors by restoring T-cell infiltration and function in previously unresponsive solid tumors.',
            original_ai_summary: 'This study demonstrates that targeting tumor metabolism can overcome resistance to PD-1 inhibitors by restoring T-cell infiltration and function in previously unresponsive solid tumors.',
            pipeline_score: 0.94,
            curation_notes: '',
            manually_modified: false,
        },
        {
            id: 2,
            title: 'Bispecific antibody targeting CD3 and TYRP1 shows efficacy in treatment-resistant melanoma',
            authors: ['Chen L', 'Williams R'],
            journal: 'Cancer Cell',
            date: '2025-01-03',
            category: 'immunotherapy',
            ranking: 2,
            ai_summary: 'A novel bispecific antibody construct demonstrates potent anti-tumor activity in melanoma models resistant to conventional checkpoint blockade.',
            original_ai_summary: 'A novel bispecific antibody construct demonstrates potent anti-tumor activity in melanoma models resistant to conventional checkpoint blockade.',
            pipeline_score: 0.89,
            curation_notes: '',
            manually_modified: false,
        },
        {
            id: 3,
            title: 'Lipid nanoparticle-mediated delivery improves CAR-T persistence in solid tumors',
            authors: ['Park S', 'Lee K', 'Brown A'],
            journal: 'Science Translational Medicine',
            date: '2025-01-02',
            category: 'drug-delivery',
            ranking: 3,
            ai_summary: 'Novel lipid nanoparticle formulation enhances CAR-T cell persistence and tumor penetration, addressing key limitations in solid tumor therapy.',
            original_ai_summary: 'Novel lipid nanoparticle formulation enhances CAR-T cell persistence and tumor penetration, addressing key limitations in solid tumor therapy.',
            pipeline_score: 0.87,
            curation_notes: '',
            manually_modified: false,
        },
    ],
    filtered_out: [
        {
            id: 101,
            title: 'Agricultural applications of CRISPR-Cas9 in crop improvement',
            authors: ['Miller T', 'Davis P'],
            journal: 'Plant Biotechnology',
            date: '2025-01-05',
            category: null,
            ranking: null,
            ai_summary: 'Review of CRISPR applications in agricultural biotechnology for improved crop yields.',
            pipeline_score: 0.32,
            pipeline_reason: 'Topic drift - agricultural focus, not oncology',
            curation_notes: '',
            manually_modified: false,
        },
        {
            id: 102,
            title: 'Machine learning approaches for drug-drug interaction prediction',
            authors: ['Kumar R', 'Patel S'],
            journal: 'Journal of Computational Biology',
            date: '2025-01-04',
            category: null,
            ranking: null,
            ai_summary: 'General ML methods for predicting drug interactions, with limited oncology-specific applications.',
            pipeline_score: 0.45,
            pipeline_reason: 'Low relevance - general computational methods',
            curation_notes: '',
            manually_modified: false,
        },
    ],
    duplicates: [
        {
            id: 201,
            title: 'Metabolic reprogramming in cancer immunotherapy (preprint)',
            authors: ['Zhang Y', 'Smith J'],
            journal: 'bioRxiv',
            date: '2024-12-15',
            duplicate_of: 1,
            duplicate_reason: 'Same study, earlier preprint version',
        },
    ],
    curated: [] as any[],
};

type ArticleTab = 'included' | 'filtered_out' | 'duplicates' | 'curated';

export default function ReportCurationMockup() {
    const [report, setReport] = useState(MOCK_REPORT);
    const [articles, setArticles] = useState(MOCK_ARTICLES);
    const [activeTab, setActiveTab] = useState<ArticleTab>('included');
    const [contentExpanded, setContentExpanded] = useState(true);
    const [editingTitle, setEditingTitle] = useState(false);
    const [editingSummary, setEditingSummary] = useState<string | null>(null);
    const [expandedArticle, setExpandedArticle] = useState<number | null>(null);

    const categories = report.categories;

    // Check if anything has been modified
    const hasChanges = report.report_name !== report.original_report_name ||
        report.executive_summary !== report.original_executive_summary ||
        articles.curated.length > 0;

    const handleIncludeArticle = (article: any) => {
        // Move from filtered_out to included (and curated)
        setArticles(prev => ({
            ...prev,
            filtered_out: prev.filtered_out.filter(a => a.id !== article.id),
            included: [...prev.included, { ...article, manually_modified: true, ranking: prev.included.length + 1 }],
            curated: [...prev.curated, { ...article, action: 'included' }],
        }));
    };

    const handleExcludeArticle = (article: any) => {
        // Move from included to filtered_out (and curated)
        setArticles(prev => ({
            ...prev,
            included: prev.included.filter(a => a.id !== article.id),
            filtered_out: [...prev.filtered_out, { ...article, manually_modified: true }],
            curated: [...prev.curated, { ...article, action: 'excluded' }],
        }));
    };

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
                                <span className="px-2 py-1 text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full">
                                    Awaiting Approval
                                </span>
                                {hasChanges && (
                                    <span className="px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full">
                                        Unsaved Changes
                                    </span>
                                )}
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                {report.stream_name} &bull; {report.date_range}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                            Save Draft
                        </button>
                        <button className="px-4 py-2 text-red-600 hover:text-red-700 border border-red-300 rounded-lg hover:bg-red-50">
                            Reject
                        </button>
                        <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2">
                            <CheckIcon className="h-4 w-4" />
                            Approve Report
                        </button>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6 space-y-6">
                {/* Report Content Section */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    <button
                        onClick={() => setContentExpanded(!contentExpanded)}
                        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                        <div className="flex items-center gap-2">
                            <DocumentTextIcon className="h-5 w-5 text-gray-400" />
                            <span className="font-semibold text-gray-900 dark:text-white">Report Content</span>
                            {(report.report_name !== report.original_report_name ||
                              report.executive_summary !== report.original_executive_summary) && (
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
                                    {report.report_name !== report.original_report_name && (
                                        <span className="text-xs text-blue-600 dark:text-blue-400">Modified</span>
                                    )}
                                </div>
                                {editingTitle ? (
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={report.report_name}
                                            onChange={(e) => setReport({ ...report, report_name: e.target.value })}
                                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                            autoFocus
                                        />
                                        <button
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
                                        <span className="text-gray-900 dark:text-white">{report.report_name}</span>
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
                                        {report.executive_summary !== report.original_executive_summary && (
                                            <span className="text-xs text-blue-600 dark:text-blue-400">Modified</span>
                                        )}
                                        <button className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1">
                                            <ArrowPathIcon className="h-3 w-3" />
                                            Regenerate
                                        </button>
                                    </div>
                                </div>
                                {editingSummary === 'executive' ? (
                                    <div className="space-y-2">
                                        <textarea
                                            value={report.executive_summary}
                                            onChange={(e) => setReport({ ...report, executive_summary: e.target.value })}
                                            rows={6}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                        <button
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
                                            {report.executive_summary}
                                        </p>
                                        <div className="mt-2 text-xs text-gray-400 group-hover:text-blue-500 flex items-center gap-1">
                                            <PencilIcon className="h-3 w-3" />
                                            Click to edit
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Category Summaries */}
                            <div>
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 block">
                                    Category Summaries
                                </label>
                                <div className="space-y-3">
                                    {categories.map((cat) => (
                                        <div key={cat.id} className="border border-gray-200 dark:border-gray-700 rounded-lg">
                                            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                                                <span className="font-medium text-gray-900 dark:text-white text-sm">
                                                    {cat.name}
                                                    <span className="ml-2 text-gray-500 font-normal">({cat.article_count} articles)</span>
                                                </span>
                                                <button className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                                                    <ArrowPathIcon className="h-3 w-3" />
                                                    Regenerate
                                                </button>
                                            </div>
                                            <div
                                                onClick={() => setEditingSummary(cat.id)}
                                                className="px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
                                            >
                                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                                    {cat.summary}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Articles Section */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-4">
                            <h2 className="font-semibold text-gray-900 dark:text-white">Articles</h2>
                        </div>

                        {/* Tabs */}
                        <div className="flex gap-2 mt-4">
                            <button
                                onClick={() => setActiveTab('included')}
                                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                                    activeTab === 'included'
                                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                                }`}
                            >
                                Included
                                <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200">
                                    {articles.included.length}
                                </span>
                            </button>
                            <button
                                onClick={() => setActiveTab('filtered_out')}
                                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                                    activeTab === 'filtered_out'
                                        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                                }`}
                            >
                                Filtered Out
                                <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200">
                                    {articles.filtered_out.length}
                                </span>
                            </button>
                            <button
                                onClick={() => setActiveTab('duplicates')}
                                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                                    activeTab === 'duplicates'
                                        ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                                }`}
                            >
                                Duplicates
                                <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300">
                                    {articles.duplicates.length}
                                </span>
                            </button>
                            <button
                                onClick={() => setActiveTab('curated')}
                                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                                    activeTab === 'curated'
                                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                                }`}
                            >
                                Curated
                                <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200">
                                    {articles.curated.length}
                                </span>
                            </button>
                        </div>
                    </div>

                    {/* Article List */}
                    <div className="p-4 space-y-3">
                        {activeTab === 'included' && articles.included.map((article) => (
                            <ArticleCard
                                key={article.id}
                                article={article}
                                type="included"
                                categories={categories}
                                expanded={expandedArticle === article.id}
                                onToggleExpand={() => setExpandedArticle(expandedArticle === article.id ? null : article.id)}
                                onExclude={() => handleExcludeArticle(article)}
                            />
                        ))}

                        {activeTab === 'filtered_out' && articles.filtered_out.map((article) => (
                            <ArticleCard
                                key={article.id}
                                article={article}
                                type="filtered_out"
                                categories={categories}
                                expanded={expandedArticle === article.id}
                                onToggleExpand={() => setExpandedArticle(expandedArticle === article.id ? null : article.id)}
                                onInclude={() => handleIncludeArticle(article)}
                            />
                        ))}

                        {activeTab === 'duplicates' && articles.duplicates.map((article) => (
                            <div key={article.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                                <h4 className="font-medium text-gray-900 dark:text-white">{article.title}</h4>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    {article.authors.join(', ')} &bull; {article.journal} &bull; {article.date}
                                </p>
                                <p className="text-sm text-amber-600 dark:text-amber-400 mt-2">
                                    {article.duplicate_reason}
                                </p>
                            </div>
                        ))}

                        {activeTab === 'curated' && (
                            articles.curated.length === 0 ? (
                                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                    <CheckCircleIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                    <p>No manual changes yet</p>
                                    <p className="text-sm mt-1">Articles you include or exclude will appear here</p>
                                </div>
                            ) : (
                                articles.curated.map((article) => (
                                    <div key={article.id} className="p-4 border border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                                                        article.action === 'included'
                                                            ? 'bg-green-100 text-green-700'
                                                            : 'bg-red-100 text-red-700'
                                                    }`}>
                                                        {article.action === 'included' ? 'Manually Included' : 'Manually Excluded'}
                                                    </span>
                                                </div>
                                                <h4 className="font-medium text-gray-900 dark:text-white mt-2">{article.title}</h4>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// Article Card Component
function ArticleCard({
    article,
    type,
    categories,
    expanded,
    onToggleExpand,
    onInclude,
    onExclude,
}: {
    article: any;
    type: 'included' | 'filtered_out';
    categories: any[];
    expanded: boolean;
    onToggleExpand: () => void;
    onInclude?: () => void;
    onExclude?: () => void;
}) {
    const [showNotes, setShowNotes] = useState(false);
    const [notes, setNotes] = useState(article.curation_notes || '');

    return (
        <div className={`border rounded-lg overflow-hidden ${
            article.manually_modified
                ? 'border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/10'
                : 'border-gray-200 dark:border-gray-700'
        }`}>
            {/* Main content */}
            <div className="p-4">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-3">
                            {type === 'included' && (
                                <div className="flex-shrink-0 flex items-center gap-1 text-gray-400">
                                    <span className="text-sm font-medium">#{article.ranking}</span>
                                    <div className="flex flex-col">
                                        <button className="hover:text-gray-600 p-0.5">
                                            <ChevronUpIcon className="h-3 w-3" />
                                        </button>
                                        <button className="hover:text-gray-600 p-0.5">
                                            <ChevronDownIcon className="h-3 w-3" />
                                        </button>
                                    </div>
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-gray-900 dark:text-white">
                                    {article.title}
                                </h4>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    {article.authors?.join(', ')} &bull; {article.journal} &bull; {article.date}
                                </p>
                            </div>
                        </div>

                        {/* Pipeline info for filtered articles */}
                        {type === 'filtered_out' && article.pipeline_reason && (
                            <div className="mt-3 flex items-center gap-2 text-sm">
                                <span className="text-red-600 dark:text-red-400">
                                    Score: {article.pipeline_score?.toFixed(2)}
                                </span>
                                <span className="text-gray-400">&bull;</span>
                                <span className="text-gray-500 dark:text-gray-400">
                                    {article.pipeline_reason}
                                </span>
                            </div>
                        )}

                        {/* AI Summary (expandable) */}
                        {expanded && (
                            <div className="mt-4 space-y-4">
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">AI Summary</span>
                                        <button className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                                            <PencilIcon className="h-3 w-3" />
                                            Edit
                                        </button>
                                    </div>
                                    <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/50 p-3 rounded">
                                        {article.ai_summary}
                                    </p>
                                </div>

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

                                {/* Category assignment for included articles */}
                                {type === 'included' && (
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Category:</span>
                                        <select className="text-sm border border-gray-200 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                                            {categories.map(cat => (
                                                <option key={cat.id} value={cat.id} selected={cat.id === article.category}>
                                                    {cat.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex-shrink-0 flex items-center gap-2">
                        {type === 'included' ? (
                            <button
                                onClick={onExclude}
                                className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                                title="Exclude from report"
                            >
                                <MinusIcon className="h-5 w-5" />
                            </button>
                        ) : (
                            <button
                                onClick={onInclude}
                                className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg"
                                title="Include in report"
                            >
                                <PlusIcon className="h-5 w-5" />
                            </button>
                        )}
                        <button
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
