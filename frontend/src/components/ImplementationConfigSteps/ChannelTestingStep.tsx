import { useState } from 'react';
import { useImplementationConfig } from '../../context/ImplementationConfigContext';
import { ArrowPathIcon, CheckCircleIcon, XCircleIcon, PencilIcon } from '@heroicons/react/24/outline';
import { CanonicalResearchArticle } from '../../types/canonical_types';

interface TestResults {
    sourceResults: {
        sourceId: string;
        sourceName: string;
        totalAvailable: number;    // Total available from source
        maxRequested: number;      // Cap we requested (10)
        actualRetrieved: number;   // Actually retrieved (min of available and cap)
        sampleArticles: CanonicalResearchArticle[];
        error?: string;
    }[];
    filterResults: {
        filtered_articles: Array<{
            article: CanonicalResearchArticle;
            confidence: number;
            reasoning: string;
            passed: boolean;
        }>;
        pass_count: number;
        fail_count: number;
        average_confidence: number;
    } | null;
}

// Helper to get default date range (last 7 days)
const getDefaultDateRange = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 7);
    return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0]
    };
};

export default function ChannelTestingStep() {
    const {
        stream,
        currentChannel,
        currentChannelWorkflowConfig,
        availableSources,
        testQuery,
        testFilter,
        completeChannel,
        navigateToChannel,
        currentChannelIndex
    } = useImplementationConfig();

    const [isTesting, setIsTesting] = useState(false);
    const [testResults, setTestResults] = useState<TestResults | null>(null);
    const [selectedTab, setSelectedTab] = useState<'summary' | 'results'>('summary');

    // Test configuration
    const [dateRange, setDateRange] = useState(getDefaultDateRange());
    const [maxResults] = useState(10); // Fixed cap at 10
    const [threshold, setThreshold] = useState(currentChannelWorkflowConfig?.semantic_filter?.threshold || 0.7);

    const filterConfig = currentChannelWorkflowConfig?.semantic_filter;
    const sourceQueries = currentChannelWorkflowConfig?.source_queries || {};
    const configuredSources = Object.entries(sourceQueries).filter(([_, query]) => query !== null);

    const handleRunTest = async () => {
        if (!currentChannel) return;

        setIsTesting(true);
        try {
            // Test all source queries
            const sourceResults = await Promise.all(
                configuredSources.map(async ([sourceId, sourceQuery]) => {
                    const source = availableSources.find(s => s.source_id === sourceId);
                    try {
                        const testRequest: any = {
                            source_id: sourceId,
                            query_expression: sourceQuery?.query_expression || '',
                            max_results: maxResults
                        };

                        // Add date range for PubMed
                        if (sourceId === 'pubmed') {
                            testRequest.start_date = dateRange.start;
                            testRequest.end_date = dateRange.end;
                            testRequest.date_type = 'entrez';
                        }

                        const result = await testQuery(testRequest);

                        return {
                            sourceId,
                            sourceName: source?.name || sourceId,
                            totalAvailable: result.article_count,
                            maxRequested: maxResults,
                            actualRetrieved: result.sample_articles?.length || 0,
                            sampleArticles: result.sample_articles || [],
                            error: result.success ? undefined : result.error_message
                        };
                    } catch (error) {
                        return {
                            sourceId,
                            sourceName: source?.name || sourceId,
                            totalAvailable: 0,
                            maxRequested: maxResults,
                            actualRetrieved: 0,
                            sampleArticles: [],
                            error: error instanceof Error ? error.message : 'Failed to test query'
                        };
                    }
                })
            );

            // Collect all articles for filter testing
            const allArticles = sourceResults.flatMap(r => r.sampleArticles);

            // Test filter if enabled and we have articles
            let filterResults = null;
            if (filterConfig?.criteria && allArticles.length > 0) {
                filterResults = await testFilter(
                    allArticles,
                    filterConfig.criteria,
                    threshold  // Use threshold from state, not config
                );
            }

            setTestResults({
                sourceResults,
                filterResults
            });
            setSelectedTab('results');
        } catch (error) {
            console.error('Channel test failed:', error);
            alert('Failed to test channel. Please try again.');
        } finally {
            setIsTesting(false);
        }
    };

    const handleEditQuery = (sourceId: string) => {
        // Find the source index
        const sourceIndex = Object.keys(sourceQueries).indexOf(sourceId);
        if (sourceIndex >= 0) {
            // Navigate back to query definition for this source
            // This would need to set the step back - for now, just alert
            alert(`To edit the query for ${sourceId}, go back to the Query Definition step in the sidebar.`);
        }
    };

    const handleEditFilter = () => {
        alert('To edit the filter, go back to the Semantic Filter step in the sidebar.');
    };

    if (!currentChannel || !currentChannelWorkflowConfig) return null;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                    Channel Testing: {currentChannel.name}
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                    Test your complete channel configuration to see how it performs
                </p>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200 dark:border-gray-700">
                <nav className="-mb-px flex gap-6">
                    <button
                        onClick={() => setSelectedTab('summary')}
                        className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                            selectedTab === 'summary'
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                        }`}
                    >
                        Configuration Summary
                    </button>
                    <button
                        onClick={() => setSelectedTab('results')}
                        className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                            selectedTab === 'results'
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                        }`}
                    >
                        Test Results
                        {testResults && (
                            <span className="ml-2 px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-xs">
                                Ready
                            </span>
                        )}
                    </button>
                </nav>
            </div>

            {/* Summary Tab */}
            {selectedTab === 'summary' && (
                <div className="space-y-6">
                    {/* Test Configuration */}
                    <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-6 bg-white dark:bg-gray-800">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            Test Configuration
                        </h3>

                        <div className="space-y-4">
                            {/* Max Results */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Maximum Results per Source
                                </label>
                                <div className="flex items-center gap-2">
                                    <div className="px-4 py-2 bg-gray-100 dark:bg-gray-900 rounded border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white font-medium">
                                        {maxResults}
                                    </div>
                                    <span className="text-sm text-gray-500 dark:text-gray-400">
                                        articles (capped for testing performance)
                                    </span>
                                </div>
                            </div>

                            {/* Date Range for PubMed */}
                            {configuredSources.some(([sourceId]) => sourceId === 'pubmed') && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Date Range (PubMed only)
                                    </label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                                                Start Date
                                            </label>
                                            <input
                                                type="date"
                                                value={dateRange.start}
                                                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                                                End Date
                                            </label>
                                            <input
                                                type="date"
                                                value={dateRange.end}
                                                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                            />
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setDateRange(getDefaultDateRange())}
                                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-2"
                                    >
                                        Reset to last 7 days
                                    </button>
                                </div>
                            )}

                            {/* Threshold Slider */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Filter Confidence Threshold
                                </label>
                                <div className="flex items-center gap-4">
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.05"
                                        value={threshold}
                                        onChange={(e) => setThreshold(parseFloat(e.target.value))}
                                        className="flex-1"
                                    />
                                    <span className="text-lg font-semibold text-gray-900 dark:text-white min-w-[4rem] text-right">
                                        {(threshold * 100).toFixed(0)}%
                                    </span>
                                </div>
                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                    Articles with confidence scores below this threshold will be filtered out
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Source Queries Summary */}
                    <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-6 bg-white dark:bg-gray-800">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Configured Sources ({configuredSources.length})
                            </h3>
                        </div>

                        <div className="space-y-4">
                            {configuredSources.map(([sourceId, sourceQuery]) => {
                                const source = availableSources.find(s => s.source_id === sourceId);
                                return (
                                    <div key={sourceId} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                                        <div className="flex items-start justify-between mb-2">
                                            <h4 className="font-medium text-gray-900 dark:text-white">
                                                {source?.name || sourceId}
                                            </h4>
                                            <button
                                                onClick={() => handleEditQuery(sourceId)}
                                                className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                            >
                                                <PencilIcon className="h-3 w-3" />
                                                Edit
                                            </button>
                                        </div>
                                        <div className="bg-gray-50 dark:bg-gray-900 rounded p-3">
                                            <code className="text-xs text-gray-900 dark:text-white break-all">
                                                {sourceQuery?.query_expression}
                                            </code>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Semantic Filter Summary */}
                    <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-6 bg-white dark:bg-gray-800">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Semantic Filter
                            </h3>
                            <button
                                onClick={handleEditFilter}
                                className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                            >
                                <PencilIcon className="h-3 w-3" />
                                Edit
                            </button>
                        </div>

                        {filterConfig?.criteria ? (
                            <div className="space-y-3">
                                <div className="bg-gray-50 dark:bg-gray-900 rounded p-3">
                                    <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">
                                        {filterConfig.criteria}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                    <span className="font-medium">Threshold:</span>
                                    <span>{(filterConfig.threshold * 100).toFixed(0)}%</span>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400">No filter configured</p>
                        )}
                    </div>

                    {/* Run Test Button */}
                    <div className="flex justify-end">
                        <button
                            onClick={handleRunTest}
                            disabled={isTesting}
                            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                            {isTesting ? (
                                <>
                                    <ArrowPathIcon className="h-5 w-5 animate-spin" />
                                    Running Test...
                                </>
                            ) : (
                                <>
                                    <ArrowPathIcon className="h-5 w-5" />
                                    Run Channel Test
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* Results Tab */}
            {selectedTab === 'results' && (
                <div className="space-y-6">
                    {!testResults ? (
                        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                            <p className="mb-4">No test results yet</p>
                            <button
                                onClick={() => setSelectedTab('summary')}
                                className="text-blue-600 dark:text-blue-400 hover:underline"
                            >
                                Go to Configuration Summary to run a test
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* Threshold Slider - Interactive */}
                            <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-6 bg-white dark:bg-gray-800">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                    Adjust Filter Threshold
                                </h3>
                                <div className="flex items-center gap-4">
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.05"
                                        value={threshold}
                                        onChange={(e) => setThreshold(parseFloat(e.target.value))}
                                        className="flex-1"
                                    />
                                    <span className="text-lg font-semibold text-gray-900 dark:text-white min-w-[4rem] text-right">
                                        {(threshold * 100).toFixed(0)}%
                                    </span>
                                </div>
                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                    Move the slider to see how different thresholds affect the pass/fail counts below
                                </p>
                            </div>

                            {/* Statistics Summary */}
                            <div className="grid grid-cols-3 gap-4">
                                <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-white dark:bg-gray-800">
                                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                                        {testResults.sourceResults.reduce((sum, r) => sum + r.totalAvailable, 0)}
                                    </div>
                                    <div className="text-sm text-gray-600 dark:text-gray-400">Total Available</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                        Retrieved: {testResults.sourceResults.reduce((sum, r) => sum + r.actualRetrieved, 0)}
                                    </div>
                                </div>
                                <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-white dark:bg-gray-800">
                                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                                        {testResults.filterResults?.filtered_articles.filter(fa => fa.confidence >= threshold).length || 0}
                                    </div>
                                    <div className="text-sm text-gray-600 dark:text-gray-400">Passed Filter</div>
                                </div>
                                <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-white dark:bg-gray-800">
                                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                                        {testResults.filterResults?.average_confidence
                                            ? `${(testResults.filterResults.average_confidence * 100).toFixed(0)}%`
                                            : 'N/A'
                                        }
                                    </div>
                                    <div className="text-sm text-gray-600 dark:text-gray-400">Avg Confidence</div>
                                </div>
                            </div>

                            {/* Source Results */}
                            <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-6 bg-white dark:bg-gray-800">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                    Source Results
                                </h3>
                                <div className="space-y-3">
                                    {testResults.sourceResults.map((result) => (
                                        <div key={result.sourceId} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                                            <div className="flex items-start justify-between mb-2">
                                                <div className="flex items-center gap-3">
                                                    {result.error ? (
                                                        <XCircleIcon className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0" />
                                                    ) : (
                                                        <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                                                    )}
                                                    <span className="font-medium text-gray-900 dark:text-white">
                                                        {result.sourceName}
                                                    </span>
                                                </div>
                                            </div>
                                            {result.error ? (
                                                <div className="ml-8 text-sm text-red-600 dark:text-red-400">
                                                    {result.error}
                                                </div>
                                            ) : (
                                                <div className="ml-8 space-y-1 text-sm">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-gray-600 dark:text-gray-400">Total Available:</span>
                                                        <span className="font-medium text-gray-900 dark:text-white">{result.totalAvailable}</span>
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-gray-600 dark:text-gray-400">Maximum Requested:</span>
                                                        <span className="font-medium text-gray-900 dark:text-white">{result.maxRequested}</span>
                                                    </div>
                                                    <div className="flex items-center justify-between pt-1 border-t border-gray-200 dark:border-gray-700">
                                                        <span className="text-gray-600 dark:text-gray-400">Actually Retrieved:</span>
                                                        <span className="font-semibold text-blue-600 dark:text-blue-400">{result.actualRetrieved}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Filtered Articles */}
                            {testResults.filterResults && testResults.filterResults.filtered_articles.length > 0 && (
                                <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-6 bg-white dark:bg-gray-800">
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                        Sample Filtered Articles (showing first 10)
                                    </h3>
                                    <div className="space-y-3">
                                        {testResults.filterResults.filtered_articles.slice(0, 10).map((fa, idx) => {
                                            const passesThreshold = fa.confidence >= threshold;
                                            return (
                                                <div
                                                    key={idx}
                                                    className={`rounded-lg p-4 border ${passesThreshold
                                                        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                                                        : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                                                    }`}
                                                >
                                                    <div className="flex items-start gap-3">
                                                        {passesThreshold ? (
                                                            <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                                                        ) : (
                                                            <XCircleIcon className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                                                        )}
                                                        <div className="flex-1 min-w-0">
                                                            <h5 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                                                                {fa.article.title}
                                                            </h5>
                                                            {fa.article.abstract && (
                                                                <p className="text-xs text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                                                                    {fa.article.abstract}
                                                                </p>
                                                            )}
                                                            <div className="flex items-center gap-2 text-xs">
                                                                <span className={`font-medium ${passesThreshold
                                                                    ? 'text-green-700 dark:text-green-300'
                                                                    : 'text-red-700 dark:text-red-300'
                                                                }`}>
                                                                    {(fa.confidence * 100).toFixed(0)}% confidence
                                                                </span>
                                                                {fa.reasoning && (
                                                                    <span className="text-gray-600 dark:text-gray-400">
                                                                        • {fa.reasoning}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex items-center justify-between pt-4">
                                <button
                                    onClick={handleRunTest}
                                    disabled={isTesting}
                                    className="px-4 py-2 text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                                >
                                    Run Test Again
                                </button>
                                <button
                                    onClick={completeChannel}
                                    className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                                >
                                    Accept & Complete Channel
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
