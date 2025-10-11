import { useParams, useNavigate } from 'react-router-dom';

import { ImplementationConfigProvider, useImplementationConfig } from '../context/ImplementationConfigContext';

import SourceSelectionStep from '../components/ImplementationConfigSteps/SourceSelectionStep';
import QueryConfigStep from '../components/ImplementationConfigSteps/QueryConfigStep';
import SemanticFilterStep from '../components/ImplementationConfigSteps/SemanticFilterStep';
import WorkflowProgressSidebar from '../components/ImplementationConfigSteps/WorkflowProgressSidebar';

function ImplementationConfigContent() {
    const navigate = useNavigate();
    const {
        stream,
        currentChannelIndex,
        isComplete,
        isLoading,
        currentChannel,
        overallProgress,
        isChannelComplete,
        currentStep
    } = useImplementationConfig();

    const streamName = stream?.stream_name || '';
    const channels = stream?.channels || [];

    const { streamId } = useParams<{ streamId: string }>();

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600 dark:text-gray-400">Loading stream configuration...</p>
                </div>
            </div>
        );
    }

    if (isComplete) {
        return (
            <div className="max-w-2xl mx-auto mt-12 p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
                <div className="text-center">
                    <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                        Configuration Complete!
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                        All channels have been configured for {streamName}
                    </p>
                    <div className="flex gap-4 justify-center">
                        <button
                            onClick={() => navigate(`/streams/${streamId}`)}
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                            View Stream
                        </button>
                        <button
                            onClick={() => navigate('/streams')}
                            className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
                        >
                            All Streams
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen bg-gray-100 dark:bg-gray-950">
            {/* Sidebar */}
            <WorkflowProgressSidebar />

            {/* Main Content */}
            <div className="flex-1 p-6">
                {/* Header */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            Implementation Configuration
                        </h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {streamName}
                        </p>
                    </div>
                    <button
                        onClick={() => navigate(`/streams/${streamId}`)}
                        className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                    >
                        Exit
                    </button>
                </div>

                {/* Current Channel Highlight */}
                {currentChannel && (
                    <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
                                        Configuring Channel {currentChannelIndex + 1} of {channels.length}
                                    </span>
                                </div>
                                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                                    {currentChannel.name}
                                </h2>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                    {currentChannel.focus}
                                </p>
                            </div>
                            <div className="text-right">
                                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                                    Channels Remaining
                                </div>
                                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                                    {channels.length - currentChannelIndex}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Channel Progress Indicators */}
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Channel Progress</span>
                    </div>
                    <div className="flex gap-2">
                        {channels.map((channel, idx) => {
                            const channelComplete = channel.channel_id ? isChannelComplete(channel.channel_id) : false;
                            const isCurrent = idx === currentChannelIndex;

                            return (
                                <div
                                    key={channel.channel_id || channel.name}
                                    className={`flex-1 h-2 rounded-full transition-all ${channelComplete
                                        ? 'bg-green-500'
                                        : isCurrent
                                            ? 'bg-blue-500'
                                            : 'bg-gray-200 dark:bg-gray-700'
                                        }`}
                                    title={`${channel.name}${channelComplete ? ' ✓' : isCurrent ? ' (current)' : ''}`}
                                />
                            );
                        })}
                    </div>
                    <div className="flex justify-between mt-2">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            {channels.filter((ch) => ch.channel_id && isChannelComplete(ch.channel_id)).length} completed
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            {overallProgress}% overall
                        </span>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                {!currentChannel ? (
                    <div className="text-center text-gray-600 dark:text-gray-400 py-12">
                        No channel to configure
                    </div>
                ) : (
                    <div>
                        {/* Source Selection Step */}
                        {currentStep === 'source_selection' && (
                            <SourceSelectionStep />
                        )}

                        {/* Query Generation/Testing Steps */}
                        {(currentStep === 'query_generation' ||
                            currentStep === 'query_testing' ||
                            currentStep === 'query_refinement') && (
                                <QueryConfigStep />
                            )}

                        {/* Semantic Filter Steps */}
                        {(currentStep === 'semantic_filter_config' ||
                            currentStep === 'semantic_filter_testing') && (
                            <SemanticFilterStep />
                        )}
                    </div>
                )}
            </div>
            </div>
        </div>
    );
}

export default function ImplementationConfigPage() {
    const { streamId } = useParams<{ streamId: string }>();

    return (
        <ImplementationConfigProvider streamId={parseInt(streamId || '0')}>
            <ImplementationConfigContent />
        </ImplementationConfigProvider>
    );
}
