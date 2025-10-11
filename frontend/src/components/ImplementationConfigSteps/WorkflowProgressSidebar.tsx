import { useImplementationConfig } from '../../context/ImplementationConfigContext';
import { CheckCircleIcon, ArrowRightIcon } from '@heroicons/react/24/solid';
import { ConfigStep } from '../../types/implementation-config';

export default function WorkflowProgressSidebar() {
    const {
        stream,
        currentChannelIndex,
        currentStep,
        currentSourceIndex,
        availableSources,
        isChannelComplete
    } = useImplementationConfig();

    const channels = stream?.channels || [];

    // Map of step names for display
    const stepNames: Record<ConfigStep, string> = {
        'source_selection': 'Select Sources',
        'query_generation': 'Generate Query',
        'query_testing': 'Test Query',
        'query_refinement': 'Refine Query',
        'semantic_filter_config': 'Configure Filter',
        'semantic_filter_testing': 'Test Filter',
        'channel_complete': 'Channel Complete'
    };

    // Determine if a step is completed for current source
    const isStepComplete = (step: ConfigStep): boolean => {
        const stepOrder: ConfigStep[] = [
            'source_selection',
            'query_generation',
            'query_testing',
            'query_refinement',
            'semantic_filter_config',
            'semantic_filter_testing'
        ];
        const currentStepIndex = stepOrder.indexOf(currentStep);
        const checkStepIndex = stepOrder.indexOf(step);
        return checkStepIndex < currentStepIndex;
    };

    return (
        <div className="w-80 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 p-6 overflow-y-auto">
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
                    const isComplete = channel.channel_id ? isChannelComplete(channel.channel_id) : false;
                    const isPast = channelIdx < currentChannelIndex;
                    const channelConfig = stream?.workflow_config?.channel_configs?.[channel.channel_id];
                    const channelSources = channelConfig ? Object.keys(channelConfig.source_queries) : [];

                    return (
                        <div
                            key={channel.channel_id || channelIdx}
                            className={`rounded-lg p-3 ${
                                isCurrent
                                    ? 'bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-500'
                                    : isComplete || isPast
                                    ? 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
                                    : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 opacity-50'
                            }`}
                        >
                            <div className="flex items-center gap-2 mb-2">
                                {isComplete ? (
                                    <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                                ) : isCurrent ? (
                                    <ArrowRightIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                                ) : (
                                    <div className="h-5 w-5 rounded-full border-2 border-gray-300 dark:border-gray-600 flex-shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                    <h4 className={`text-sm font-semibold truncate ${
                                        isCurrent ? 'text-blue-900 dark:text-blue-100' : 'text-gray-900 dark:text-white'
                                    }`}>
                                        {channel.name}
                                    </h4>
                                    <p className={`text-xs truncate ${
                                        isCurrent ? 'text-blue-700 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'
                                    }`}>
                                        Channel {channelIdx + 1} of {channels.length}
                                    </p>
                                </div>
                            </div>

                            {/* Show sources if this is current or past channel */}
                            {(isCurrent || isPast) && channelSources.length > 0 && (
                                <div className="ml-7 mt-2 space-y-2 border-l-2 border-gray-200 dark:border-gray-700 pl-3">
                                    {channelSources.map((sourceId, sourceIdx) => {
                                        const source = availableSources.find(s => s.source_id === sourceId);
                                        const isCurrentSource = isCurrent && sourceIdx === currentSourceIndex;
                                        const sourceQuery = channelConfig?.source_queries[sourceId];
                                        const isSourceComplete = sourceQuery !== null;

                                        return (
                                            <div
                                                key={sourceId}
                                                className={`text-xs ${
                                                    isCurrentSource
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

                                                {/* Show steps for current source */}
                                                {isCurrentSource && currentStep !== 'source_selection' && (
                                                    <div className="ml-4 mt-1 space-y-1">
                                                        {(['query_generation', 'query_testing', 'query_refinement'] as ConfigStep[]).map(step => {
                                                            const completed = isStepComplete(step);
                                                            const active = step === currentStep;

                                                            return (
                                                                <div
                                                                    key={step}
                                                                    className={`flex items-center gap-1 ${
                                                                        active
                                                                            ? 'text-blue-600 dark:text-blue-400 font-medium'
                                                                            : completed
                                                                            ? 'text-green-600 dark:text-green-400'
                                                                            : 'text-gray-400 dark:text-gray-600'
                                                                    }`}
                                                                >
                                                                    {completed ? (
                                                                        <CheckCircleIcon className="h-3 w-3" />
                                                                    ) : active ? (
                                                                        <div className="h-2 w-2 rounded-full bg-current" />
                                                                    ) : (
                                                                        <div className="h-2 w-2 rounded-full border border-current" />
                                                                    )}
                                                                    <span className="text-xs">{stepNames[step]}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {/* Semantic filter indicator */}
                                    {isCurrent && (currentStep === 'semantic_filter_config' || currentStep === 'semantic_filter_testing') && (
                                        <div className="text-xs font-semibold text-blue-900 dark:text-blue-100">
                                            <div className="flex items-center gap-1">
                                                <div className="h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-400" />
                                                <span>Semantic Filter</span>
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
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
