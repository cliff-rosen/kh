import { CheckIcon, XMarkIcon, MagnifyingGlassIcon } from '@heroicons/react/24/solid';

interface QueryItem {
    query_id: string;
    search_terms: string[];
    query_expression: string;
    rationale: string;
    covered_topics: string[];
    estimated_weekly_volume?: number | null;
}

interface CoverageAnalysis {
    total_topics: number;
    covered_topics: string[];
    uncovered_topics: string[];
    expected_false_positive_rate: string;
}

export interface RetrievalConfigProposalData {
    queries: QueryItem[];
    strategy_rationale: string;
    coverage_analysis: CoverageAnalysis;
}

interface RetrievalConfigProposalCardProps {
    data: RetrievalConfigProposalData;
    onAccept?: (data: RetrievalConfigProposalData) => void;
    onReject?: () => void;
}

export default function RetrievalConfigProposalCard({ data, onAccept, onReject }: RetrievalConfigProposalCardProps) {
    const coverage = data.coverage_analysis;
    const coveragePercent = coverage.total_topics > 0
        ? Math.round((coverage.covered_topics.length / coverage.total_topics) * 100)
        : 0;

    return (
        <div className="space-y-4">
            {/* Header */}
            <div>
                <div className="flex items-center gap-2 mb-2">
                    <MagnifyingGlassIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <h4 className="font-semibold text-gray-900 dark:text-white">
                        Retrieval Config Proposal
                    </h4>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    {data.queries.length} search {data.queries.length === 1 ? 'query' : 'queries'} covering {coveragePercent}% of topics
                </p>
            </div>

            {/* Strategy Rationale */}
            {data.strategy_rationale && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide mb-1">
                        Strategy
                    </p>
                    <p className="text-sm text-blue-900 dark:text-blue-100 italic">
                        {data.strategy_rationale}
                    </p>
                </div>
            )}

            {/* Queries */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">
                    Queries ({data.queries.length})
                </p>
                <div className="space-y-3">
                    {data.queries.map((query, idx) => (
                        <div key={idx} className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
                            <div className="flex items-start justify-between mb-2">
                                <p className="font-medium text-gray-900 dark:text-white text-sm">
                                    {query.query_id}
                                </p>
                                {query.estimated_weekly_volume != null && (
                                    <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 ml-2">
                                        ~{query.estimated_weekly_volume}/week
                                    </span>
                                )}
                            </div>
                            <code className="block text-sm bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-2 py-1 rounded mb-2 break-all">
                                {query.query_expression}
                            </code>
                            <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                                {query.rationale}
                            </p>
                            {query.covered_topics.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                    {query.covered_topics.map((topic, tidx) => (
                                        <span key={tidx} className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                                            {topic}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Coverage Analysis */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">
                    Coverage Analysis
                </p>
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div
                                className="bg-green-500 h-2 rounded-full transition-all"
                                style={{ width: `${coveragePercent}%` }}
                            />
                        </div>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {coveragePercent}%
                        </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        {coverage.covered_topics.length} of {coverage.total_topics} topics covered
                    </p>
                    {coverage.uncovered_topics.length > 0 && (
                        <div className="text-xs text-orange-600 dark:text-orange-400">
                            Uncovered: {coverage.uncovered_topics.join(', ')}
                        </div>
                    )}
                    {coverage.expected_false_positive_rate && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Expected false positive rate: {coverage.expected_false_positive_rate}
                        </p>
                    )}
                </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
                {onAccept && (
                    <button
                        onClick={() => onAccept(data)}
                        className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm"
                    >
                        <CheckIcon className="h-5 w-5" />
                        Accept Queries
                    </button>
                )}
                {onReject && (
                    <button
                        onClick={onReject}
                        className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm"
                    >
                        <XMarkIcon className="h-5 w-5" />
                        Dismiss
                    </button>
                )}
            </div>
        </div>
    );
}
