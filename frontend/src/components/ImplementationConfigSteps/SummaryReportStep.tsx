import { useImplementationConfig } from '../../context/ImplementationConfigContext';
import { CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

export default function SummaryReportStep() {
    const {
        stream,
        channelTestResults,
        navigateToChannel
    } = useImplementationConfig();

    const channels = stream?.channels || [];

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
            <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                    Summary Report
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                    Aggregated test results across all channels
                </p>
            </div>

            {/* Overall Stats */}
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Channels Tested</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                        {testedChannels.length} / {channels.length}
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Articles Retrieved</div>
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                        {totalArticlesRetrieved}
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Passed Filter</div>
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {totalPassedArticles}
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Failed Filter</div>
                    <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                        {totalFailedArticles}
                    </div>
                </div>
            </div>

            {/* Channel Results */}
            <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Channel Results
                    </h3>
                </div>
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                    {channels.map((channel, idx) => {
                        const results = channelTestResults[channel.channel_id];
                        const hasResults = !!results;

                        if (!hasResults) {
                            return (
                                <div key={channel.channel_id} className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-900/50">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <XCircleIcon className="h-5 w-5 text-gray-400 flex-shrink-0" />
                                            <div>
                                                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                                                    {channel.name}
                                                </h4>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                    Not tested yet
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => navigateToChannel(idx)}
                                            className="px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                        >
                                            Configure & Test
                                        </button>
                                    </div>
                                </div>
                            );
                        }

                        const passedCount = results.filterResults?.filtered_articles.filter(
                            fa => fa.confidence >= results.threshold
                        ).length || 0;
                        const failedCount = results.filterResults?.filtered_articles.filter(
                            fa => fa.confidence < results.threshold
                        ).length || 0;
                        const retrievedCount = results.sourceResults.reduce((sum, sr) => sum + sr.actualRetrieved, 0);

                        return (
                            <div key={channel.channel_id} className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-900/50">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-start gap-3 flex-1">
                                        <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                                                {channel.name}
                                            </h4>

                                            {/* Stats */}
                                            <div className="grid grid-cols-3 gap-4 mb-3">
                                                <div>
                                                    <div className="text-xs text-gray-600 dark:text-gray-400">Retrieved</div>
                                                    <div className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                                                        {retrievedCount}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-xs text-gray-600 dark:text-gray-400">Passed</div>
                                                    <div className="text-sm font-semibold text-green-600 dark:text-green-400">
                                                        {passedCount}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-xs text-gray-600 dark:text-gray-400">Failed</div>
                                                    <div className="text-sm font-semibold text-red-600 dark:text-red-400">
                                                        {failedCount}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Sources */}
                                            <div className="flex flex-wrap gap-2">
                                                {results.sourceResults.map(sr => (
                                                    <div
                                                        key={sr.sourceId}
                                                        className="px-2 py-1 bg-gray-100 dark:bg-gray-900 rounded text-xs text-gray-700 dark:text-gray-300"
                                                    >
                                                        {sr.sourceName}: {sr.actualRetrieved}
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Test Config Info */}
                                            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                                Threshold: {(results.threshold * 100).toFixed(0)}%
                                                {results.dateRange && (
                                                    <span className="ml-3">
                                                        Date Range: {results.dateRange.start} to {results.dateRange.end}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => navigateToChannel(idx)}
                                        className="ml-4 px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0"
                                    >
                                        View Details
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Accepted Articles Summary */}
            {totalPassedArticles > 0 && (
                <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        Accepted Articles Summary
                    </h3>
                    <div className="space-y-3">
                        {testedChannels.map(channel => {
                            const results = channelTestResults[channel.channel_id];
                            if (!results?.filterResults) return null;

                            const passedArticles = results.filterResults.filtered_articles.filter(
                                fa => fa.confidence >= results.threshold
                            );

                            if (passedArticles.length === 0) return null;

                            return (
                                <div key={channel.channel_id} className="border-l-4 border-green-500 pl-4">
                                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                                        {channel.name} ({passedArticles.length} articles)
                                    </h4>
                                    <div className="space-y-2">
                                        {passedArticles.slice(0, 3).map((fa, idx) => (
                                            <div key={idx} className="text-sm">
                                                <div className="font-medium text-gray-900 dark:text-white">
                                                    {fa.article.title}
                                                </div>
                                                <div className="text-xs text-gray-600 dark:text-gray-400">
                                                    {(fa.confidence * 100).toFixed(0)}% confidence
                                                </div>
                                            </div>
                                        ))}
                                        {passedArticles.length > 3 && (
                                            <button
                                                onClick={() => navigateToChannel(channels.indexOf(channel))}
                                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                            >
                                                View all {passedArticles.length} articles
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
