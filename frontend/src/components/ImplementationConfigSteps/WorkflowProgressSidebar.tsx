import { useImplementationConfig } from '../../context/ImplementationConfigContext';
import { CheckCircleIcon, ArrowRightIcon, DocumentChartBarIcon } from '@heroicons/react/24/solid';
import { ConfigStep } from '../../types/implementation-config';

export default function WorkflowProgressSidebar() {
    const {
        stream,
        currentChannelIndex,
        currentStep,
        currentSourceIndex,
        availableSources,
        isViewingSummary,
        channelTestResults,
        navigateToChannel,
        viewSummaryReport
    } = useImplementationConfig();

    const channels = stream?.channels || [];

    // Map of step names for display
    const stepNames: Record<ConfigStep, string> = {
        'source_selection': 'Select Sources',
        'query_definition': 'Define Query',
        'semantic_filter_definition': 'Define Filter',
        'channel_testing': 'Test Channel',
        'channel_complete': 'Complete'
    };


    return (
        <div className="w-80 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 p-6 overflow-y-auto h-screen fixed left-0 top-0">
            <div className="mb-6">
                <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-1">
                    Implementation Configuration
                </div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                    Channel Workflow Progress
                </h3>
            </div>

            <div className="space-y-4">
                {channels.map((channel, channelIdx) => {
                    const isCurrent = channelIdx === currentChannelIndex;
                    const channelConfig = stream?.workflow_config?.channel_configs?.[channel.channel_id];
                    const channelSources = channelConfig ? Object.keys(channelConfig.source_queries) : [];

                    // Determine channel completion status based on configuration
                    const hasConfig = channelConfig && Object.keys(channelConfig.source_queries).length > 0;
                    const hasAllQueries = hasConfig ? Object.values(channelConfig.source_queries).every(sq => sq !== null) : false;
                    const hasFilter = hasConfig && channelConfig.semantic_filter?.criteria && channelConfig.semantic_filter.criteria.length > 0;
                    const isComplete = hasAllQueries && hasFilter;
                    const isInProgress = hasConfig && !isComplete;

                    return (
                        <button
                            key={channel.channel_id || channelIdx}
                            onClick={() => navigateToChannel(channelIdx)}
                            className={`w-full text-left rounded-lg p-3 transition-all ${isCurrent
                                    ? 'bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-500'
                                    : isComplete || isInProgress
                                        ? 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 cursor-pointer'
                                        : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 opacity-50 hover:opacity-70 cursor-pointer'
                                }`}
                        >
                            <div className="flex items-center gap-2 mb-2">
                                {isComplete ? (
                                    <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                                ) : isCurrent ? (
                                    <ArrowRightIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                                ) : isInProgress ? (
                                    <div className="h-5 w-5 rounded-full border-2 border-yellow-500 dark:border-yellow-400 flex-shrink-0 relative">
                                        <div className="absolute inset-0 rounded-full border-2 border-yellow-500 dark:border-yellow-400 animate-ping opacity-75" />
                                    </div>
                                ) : (
                                    <div className="h-5 w-5 rounded-full border-2 border-gray-300 dark:border-gray-600 flex-shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                    <h4 className={`text-sm font-semibold truncate ${isCurrent ? 'text-blue-900 dark:text-blue-100' : 'text-gray-900 dark:text-white'
                                        }`}>
                                        {channel.name}
                                    </h4>
                                    <p className={`text-xs truncate ${isCurrent ? 'text-blue-700 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'
                                        }`}>
                                        Channel {channelIdx + 1} of {channels.length}
                                    </p>
                                </div>
                            </div>

                            {/* Show sources if this channel has configuration */}
                            {(isCurrent || isInProgress || isComplete) && channelSources.length > 0 && (
                                <div className="ml-7 mt-2 space-y-2 border-l-2 border-gray-200 dark:border-gray-700 pl-3">
                                    {channelSources.map((sourceId, sourceIdx) => {
                                        const source = availableSources.find(s => s.source_id === sourceId);
                                        const isCurrentSource = isCurrent && sourceIdx === currentSourceIndex;
                                        const sourceQuery = channelConfig?.source_queries[sourceId];
                                        const isSourceComplete = sourceQuery !== null;

                                        return (
                                            <div
                                                key={sourceId}
                                                className={`text-xs ${isCurrentSource
                                                        ? 'font-semibold text-blue-900 dark:text-blue-100'
                                                        : 'text-gray-600 dark:text-gray-400'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-1">
                                                    {isSourceComplete ? (
                                                        <CheckCircleIcon className="h-3 w-3 text-green-600 dark:text-green-400" />
                                                    ) : isCurrentSource ? (
                                                        <div className="h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-400" />
                                                    ) : (
                                                        <div className="h-2 w-2 rounded-full border border-gray-400" />
                                                    )}
                                                    <span>{source?.name || sourceId}</span>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* Channel-level steps */}
                                    {isCurrent && (currentStep === 'semantic_filter_definition' || currentStep === 'channel_testing') && (
                                        <div className="text-xs font-semibold text-blue-900 dark:text-blue-100 mt-2">
                                            <div className="flex items-center gap-1">
                                                <div className="h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-400" />
                                                <span>{stepNames[currentStep]}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Show "Select sources" if current channel and on source selection */}
                            {isCurrent && currentStep === 'source_selection' && (
                                <div className="ml-7 mt-2 text-xs text-blue-600 dark:text-blue-400 italic">
                                    Select information sources...
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Summary Report Button */}
            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <button
                    onClick={viewSummaryReport}
                    className={`w-full text-left rounded-lg p-3 transition-all ${
                        isViewingSummary
                            ? 'bg-purple-100 dark:bg-purple-900/30 border-2 border-purple-500'
                            : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-purple-400 dark:hover:border-purple-500 cursor-pointer'
                    }`}
                >
                    <div className="flex items-center gap-2">
                        <DocumentChartBarIcon className={`h-5 w-5 flex-shrink-0 ${
                            isViewingSummary ? 'text-purple-600 dark:text-purple-400' : 'text-gray-600 dark:text-gray-400'
                        }`} />
                        <div className="flex-1 min-w-0">
                            <h4 className={`text-sm font-semibold ${
                                isViewingSummary ? 'text-purple-900 dark:text-purple-100' : 'text-gray-900 dark:text-white'
                            }`}>
                                Summary Report
                            </h4>
                            <p className={`text-xs ${
                                isViewingSummary ? 'text-purple-700 dark:text-purple-300' : 'text-gray-500 dark:text-gray-400'
                            }`}>
                                {Object.keys(channelTestResults).length} / {channels.length} tested
                            </p>
                        </div>
                    </div>
                </button>
            </div>
        </div>
    );
}
