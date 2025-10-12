import { useState } from 'react';
import { useImplementationConfig } from '../../context/ImplementationConfigContext';
import { CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon, ChevronDownIcon, ChevronRightIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { researchStreamApi } from '../../lib/api/researchStreamApi';

export default function SummaryReportStep() {
    const {
        stream,
        channelTestResults,
        navigateToChannel
    } = useImplementationConfig();

    const channels = stream?.channels || [];
    const [expandedChannels, setExpandedChannels] = useState<Set<string>>(new Set());
    const [executiveSummary, setExecutiveSummary] = useState<any>(null);
    const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

    const toggleChannel = (channelId: string) => {
        setExpandedChannels(prev => {
            const next = new Set(prev);
            if (next.has(channelId)) {
                next.delete(channelId);
            } else {
                next.add(channelId);
            }
            return next;
        });
    };

    const handleGenerateExecutiveSummary = async () => {
        if (!stream) return;

        setIsGeneratingSummary(true);
        try {
            // Prepare channel test data from channelTestResults
            const channelTestData = channels
                .filter(channel => channelTestResults[channel.channel_id])
                .map(channel => {
                    const results = channelTestResults[channel.channel_id];
                    const acceptedArticles = results.filterResults?.filtered_articles
                        .filter(fa => fa.confidence >= results.threshold)
                        .map(fa => fa.article) || [];

                    return {
                        channel_id: channel.channel_id,
                        channel_name: channel.name,
                        accepted_articles: acceptedArticles
                    };
                });

            const summary = await researchStreamApi.generateExecutiveSummary(
                stream.stream_id,
                channelTestData
            );

            setExecutiveSummary(summary);
        } catch (error) {
            console.error('Failed to generate executive summary:', error);
            alert('Failed to generate executive summary. Please try again.');
        } finally {
            setIsGeneratingSummary(false);
        }
    };

    // Calculate overall stats
    const testedChannels = channels.filter(ch => channelTestResults[ch.channel_id]);
    const untestedChannels = channels.filter(ch => !channelTestResults[ch.channel_id]);

    const totalPassedArticles = testedChannels.reduce((sum, ch) => {
        const results = channelTestResults[ch.channel_id];
        if (!results?.filterResults) return sum;
        return sum + results.filterResults.filtered_articles.filter(
            fa => fa.confidence >= results.threshold
        ).length;
    }, 0);

    const totalFailedArticles = testedChannels.reduce((sum, ch) => {
        const results = channelTestResults[ch.channel_id];
        if (!results?.filterResults) return sum;
        return sum + results.filterResults.filtered_articles.filter(
            fa => fa.confidence < results.threshold
        ).length;
    }, 0);

    const totalArticlesRetrieved = testedChannels.reduce((sum, ch) => {
        const results = channelTestResults[ch.channel_id];
        return sum + results.sourceResults.reduce((s, sr) => s + sr.actualRetrieved, 0);
    }, 0);

    if (untestedChannels.length === channels.length) {
        // No channels tested yet
        return (
            <div className="space-y-6">
                <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                        Summary Report
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400">
                        Aggregated test results across all channels
                    </p>
                </div>

                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-8 text-center">
                    <ExclamationTriangleIcon className="h-12 w-12 text-yellow-600 dark:text-yellow-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                        No Test Results Yet
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                        Configure and test your channels to see aggregated results here.
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Click on a channel in the sidebar to get started.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                    Channel Configuration Test Report
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    {stream?.stream_name} • Generated {new Date().toLocaleDateString()}
                </p>
            </div>

            {/* AI Executive Summary */}
            {testedChannels.length > 0 && (
                <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-6">
                    {!executiveSummary ? (
                        <div className="text-center">
                            <SparklesIcon className="h-12 w-12 text-purple-600 dark:text-purple-400 mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                                AI Executive Summary
                            </h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                                Get AI-powered insights and themes from your accepted articles
                            </p>
                            <button
                                onClick={handleGenerateExecutiveSummary}
                                disabled={isGeneratingSummary}
                                className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2 mx-auto"
                            >
                                {isGeneratingSummary ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <SparklesIcon className="h-5 w-5" />
                                        Generate Executive Summary
                                    </>
                                )}
                            </button>
                        </div>
                    ) : (
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <SparklesIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                        AI Executive Summary
                                    </h3>
                                </div>
                                <button
                                    onClick={handleGenerateExecutiveSummary}
                                    disabled={isGeneratingSummary}
                                    className="text-sm text-purple-600 dark:text-purple-400 hover:underline"
                                >
                                    Regenerate
                                </button>
                            </div>

                            {/* Overview */}
                            <div className="mb-4">
                                <p className="text-gray-900 dark:text-white leading-relaxed">
                                    {executiveSummary.overview}
                                </p>
                            </div>

                            {/* Key Themes */}
                            <div className="mb-4">
                                <h4 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide mb-2">
                                    Key Themes
                                </h4>
                                <ul className="list-disc list-inside space-y-1">
                                    {executiveSummary.key_themes.map((theme: string, idx: number) => (
                                        <li key={idx} className="text-gray-700 dark:text-gray-300 text-sm">
                                            {theme}
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            {/* Channel Highlights */}
                            {executiveSummary.channel_highlights.length > 0 && (
                                <div className="mb-4">
                                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide mb-2">
                                        Channel Highlights
                                    </h4>
                                    <div className="space-y-2">
                                        {executiveSummary.channel_highlights.map((highlight: any, idx: number) => (
                                            <div key={idx} className="bg-white/50 dark:bg-gray-800/50 rounded p-3">
                                                <div className="font-medium text-gray-900 dark:text-white text-sm mb-1">
                                                    {highlight.channel_name}
                                                </div>
                                                <div className="text-gray-700 dark:text-gray-300 text-sm">
                                                    {highlight.highlight}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Recommendations */}
                            <div>
                                <h4 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide mb-2">
                                    Recommendations
                                </h4>
                                <p className="text-gray-700 dark:text-gray-300 text-sm">
                                    {executiveSummary.recommendations}
                                </p>
                            </div>

                            <div className="mt-4 pt-4 border-t border-purple-200 dark:border-purple-800 text-xs text-gray-500 dark:text-gray-400">
                                Generated {new Date(executiveSummary.generated_at).toLocaleString()}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Executive Statistics Summary */}
            <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Executive Summary
                </h3>
                <div className="grid grid-cols-4 gap-6">
                    <div>
                        <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                            Channels Tested
                        </div>
                        <div className="text-3xl font-bold text-gray-900 dark:text-white">
                            {testedChannels.length}<span className="text-lg text-gray-500 dark:text-gray-400">/{channels.length}</span>
                        </div>
                    </div>
                    <div>
                        <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                            Articles Retrieved
                        </div>
                        <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                            {totalArticlesRetrieved}
                        </div>
                    </div>
                    <div>
                        <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                            Passed Filter
                        </div>
                        <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                            {totalPassedArticles}
                        </div>
                    </div>
                    <div>
                        <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                            Failed Filter
                        </div>
                        <div className="text-3xl font-bold text-red-600 dark:text-red-400">
                            {totalFailedArticles}
                        </div>
                    </div>
                </div>
            </div>

            {/* Channel Details */}
            <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Channel Details
                </h3>

                {channels.map((channel, idx) => {
                    const results = channelTestResults[channel.channel_id];
                    const hasResults = !!results;
                    const isExpanded = expandedChannels.has(channel.channel_id);

                    if (!hasResults) {
                        return (
                            <div key={channel.channel_id} className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg">
                                <div className="px-6 py-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <XCircleIcon className="h-6 w-6 text-gray-400 flex-shrink-0" />
                                        <div>
                                            <h4 className="text-base font-semibold text-gray-900 dark:text-white">
                                                {channel.name}
                                            </h4>
                                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                                Not tested yet
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => navigateToChannel(idx)}
                                        className="px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                                    >
                                        Configure & Test →
                                    </button>
                                </div>
                            </div>
                        );
                    }

                    const passedArticles = results.filterResults?.filtered_articles.filter(
                        fa => fa.confidence >= results.threshold
                    ) || [];
                    const failedCount = results.filterResults?.filtered_articles.filter(
                        fa => fa.confidence < results.threshold
                    ).length || 0;
                    const retrievedCount = results.sourceResults.reduce((sum, sr) => sum + sr.actualRetrieved, 0);

                    return (
                        <div key={channel.channel_id} className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                            {/* Channel Header */}
                            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3 flex-1">
                                        <CheckCircleIcon className="h-6 w-6 text-green-600 dark:text-green-400 flex-shrink-0" />
                                        <div className="flex-1">
                                            <h4 className="text-base font-bold text-gray-900 dark:text-white">
                                                {channel.name}
                                            </h4>
                                            <div className="flex items-center gap-4 mt-1 text-sm">
                                                <span className="text-blue-600 dark:text-blue-400 font-semibold">
                                                    {retrievedCount} retrieved
                                                </span>
                                                <span className="text-green-600 dark:text-green-400 font-semibold">
                                                    {passedArticles.length} passed
                                                </span>
                                                <span className="text-red-600 dark:text-red-400 font-semibold">
                                                    {failedCount} failed
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => toggleChannel(channel.channel_id)}
                                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                                    >
                                        {isExpanded ? (
                                            <>
                                                <ChevronDownIcon className="h-4 w-4" />
                                                Hide Articles
                                            </>
                                        ) : (
                                            <>
                                                <ChevronRightIcon className="h-4 w-4" />
                                                Show Articles
                                            </>
                                        )}
                                    </button>
                                </div>

                                {/* Channel Metadata */}
                                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-600 dark:text-gray-400">
                                    <div>
                                        <span className="font-medium">Sources:</span>{' '}
                                        {results.sourceResults.map(sr => sr.sourceName).join(', ')}
                                    </div>
                                    <div>
                                        <span className="font-medium">Threshold:</span> {(results.threshold * 100).toFixed(0)}%
                                    </div>
                                    {results.dateRange && (
                                        <div>
                                            <span className="font-medium">Date Range:</span> {results.dateRange.start} to {results.dateRange.end}
                                        </div>
                                    )}
                                    <button
                                        onClick={() => navigateToChannel(idx)}
                                        className="text-blue-600 dark:text-blue-400 hover:underline ml-auto"
                                    >
                                        View Test Details →
                                    </button>
                                </div>
                            </div>

                            {/* Accepted Articles (Collapsible) */}
                            {isExpanded && passedArticles.length > 0 && (
                                <div className="px-6 py-4">
                                    <h5 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 uppercase tracking-wide">
                                        Accepted Articles ({passedArticles.length})
                                    </h5>
                                    <div className="space-y-3">
                                        {passedArticles.map((fa, idx) => (
                                            <div key={idx} className="border-l-2 border-green-500 pl-4 py-2">
                                                <div className="font-medium text-gray-900 dark:text-white mb-1">
                                                    {fa.article.title}
                                                </div>
                                                {fa.article.abstract && (
                                                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                                        {fa.article.abstract}
                                                    </p>
                                                )}
                                                <div className="flex items-center gap-3 text-xs">
                                                    <span className="font-semibold text-green-700 dark:text-green-300">
                                                        {(fa.confidence * 100).toFixed(0)}% confidence
                                                    </span>
                                                    {fa.article.authors && fa.article.authors.length > 0 && (
                                                        <span className="text-gray-500 dark:text-gray-400">
                                                            {fa.article.authors.slice(0, 3).join(', ')}
                                                            {fa.article.authors.length > 3 && ' et al.'}
                                                        </span>
                                                    )}
                                                    {fa.article.publication_date && (
                                                        <span className="text-gray-500 dark:text-gray-400">
                                                            {fa.article.publication_date}
                                                        </span>
                                                    )}
                                                </div>
                                                {fa.reasoning && (
                                                    <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 italic">
                                                        {fa.reasoning}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {isExpanded && passedArticles.length === 0 && (
                                <div className="px-6 py-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                                    No articles passed the filter for this channel.
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
