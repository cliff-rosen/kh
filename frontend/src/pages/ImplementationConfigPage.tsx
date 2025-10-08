import { useEffect, useState, useReducer } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { researchStreamApi } from '../lib/api/researchStreamApi';
import {
    ImplementationConfigState,
    ChannelConfigState,
    ConfigAction,
    ConfigStep,
    SourceQueryConfig,
    getCurrentChannel,
    getCurrentChannelConfig,
    getOverallProgress
} from '../types/implementation-config';
import { Channel, InformationSource } from '../types/research-stream';
import SourceSelectionStep from '../components/ImplementationConfigSteps/SourceSelectionStep';
import QueryConfigStep from '../components/ImplementationConfigSteps/QueryConfigStep';

// ============================================================================
// State Reducer
// ============================================================================

function configReducer(state: ImplementationConfigState, action: ConfigAction): ImplementationConfigState {
    switch (action.type) {
        case 'LOAD_STREAM': {
            const { stream_name, channels, sources } = action.payload;

            // Initialize channel configs
            const channel_configs = new Map<string, ChannelConfigState>();
            channels.forEach(channel => {
                channel_configs.set(channel.name, {
                    channel,
                    selected_sources: [],
                    source_configs: new Map(),
                    current_source_index: 0,
                    completed_steps: [],
                    current_step: 'source_selection',
                    is_complete: false
                });
            });

            return {
                ...state,
                stream_name,
                channels,
                available_sources: sources,
                channel_configs,
                current_channel_index: 0
            };
        }

        case 'SELECT_SOURCES': {
            const { channel_name, source_ids } = action.payload;
            const channelConfig = state.channel_configs.get(channel_name);
            if (!channelConfig) return state;

            // Initialize source configs for selected sources
            const source_configs = new Map<string, SourceQueryConfig>();
            source_ids.forEach(source_id => {
                const source = state.available_sources.find(s => s.source_id === source_id);
                if (source) {
                    source_configs.set(source_id, {
                        source_id,
                        source_name: source.name,
                        query_expression: '',
                        is_tested: false,
                        is_confirmed: false
                    });
                }
            });

            const updated = {
                ...channelConfig,
                selected_sources: source_ids,
                source_configs,
                current_step: 'query_generation' as ConfigStep,
                completed_steps: ['source_selection' as ConfigStep]
            };

            const newConfigs = new Map(state.channel_configs);
            newConfigs.set(channel_name, updated);

            return { ...state, channel_configs: newConfigs };
        }

        case 'GENERATE_QUERY_SUCCESS': {
            const { channel_name, source_id, query_expression, reasoning } = action.payload;
            const channelConfig = state.channel_configs.get(channel_name);
            if (!channelConfig) return state;

            const sourceConfig = channelConfig.source_configs.get(source_id);
            if (!sourceConfig) return state;

            const updatedSourceConfig = {
                ...sourceConfig,
                query_expression,
                query_reasoning: reasoning
            };

            const newSourceConfigs = new Map(channelConfig.source_configs);
            newSourceConfigs.set(source_id, updatedSourceConfig);

            const updatedChannel = {
                ...channelConfig,
                source_configs: newSourceConfigs,
                current_step: 'query_testing' as ConfigStep
            };

            const newConfigs = new Map(state.channel_configs);
            newConfigs.set(channel_name, updatedChannel);

            return { ...state, channel_configs: newConfigs };
        }

        case 'UPDATE_QUERY': {
            const { channel_name, source_id, query_expression } = action.payload;
            const channelConfig = state.channel_configs.get(channel_name);
            if (!channelConfig) return state;

            const sourceConfig = channelConfig.source_configs.get(source_id);
            if (!sourceConfig) return state;

            const updatedSourceConfig = {
                ...sourceConfig,
                query_expression,
                is_tested: false, // Reset test status when query changes
                test_result: undefined
            };

            const newSourceConfigs = new Map(channelConfig.source_configs);
            newSourceConfigs.set(source_id, updatedSourceConfig);

            const updatedChannel = {
                ...channelConfig,
                source_configs: newSourceConfigs
            };

            const newConfigs = new Map(state.channel_configs);
            newConfigs.set(channel_name, updatedChannel);

            return { ...state, channel_configs: newConfigs };
        }

        case 'TEST_QUERY_SUCCESS': {
            const { channel_name, source_id, result } = action.payload;
            const channelConfig = state.channel_configs.get(channel_name);
            if (!channelConfig) return state;

            const sourceConfig = channelConfig.source_configs.get(source_id);
            if (!sourceConfig) return state;

            const updatedSourceConfig = {
                ...sourceConfig,
                is_tested: true,
                test_result: result
            };

            const newSourceConfigs = new Map(channelConfig.source_configs);
            newSourceConfigs.set(source_id, updatedSourceConfig);

            const updatedChannel = {
                ...channelConfig,
                source_configs: newSourceConfigs,
                current_step: 'query_refinement' as ConfigStep
            };

            const newConfigs = new Map(state.channel_configs);
            newConfigs.set(channel_name, updatedChannel);

            return { ...state, channel_configs: newConfigs };
        }

        case 'CONFIRM_QUERY': {
            const { channel_name, source_id } = action.payload;
            const channelConfig = state.channel_configs.get(channel_name);
            if (!channelConfig) return state;

            const sourceConfig = channelConfig.source_configs.get(source_id);
            if (!sourceConfig) return state;

            const updatedSourceConfig = {
                ...sourceConfig,
                is_confirmed: true
            };

            const newSourceConfigs = new Map(channelConfig.source_configs);
            newSourceConfigs.set(source_id, updatedSourceConfig);

            const updatedChannel = {
                ...channelConfig,
                source_configs: newSourceConfigs
            };

            const newConfigs = new Map(state.channel_configs);
            newConfigs.set(channel_name, updatedChannel);

            return { ...state, channel_configs: newConfigs };
        }

        case 'NEXT_SOURCE': {
            const { channel_name } = action.payload;
            const channelConfig = state.channel_configs.get(channel_name);
            if (!channelConfig) return state;

            const nextIndex = channelConfig.current_source_index + 1;

            // If we've configured all sources, move to semantic filter
            if (nextIndex >= channelConfig.selected_sources.length) {
                const updatedChannel = {
                    ...channelConfig,
                    current_step: 'semantic_filter_config' as ConfigStep
                };

                const newConfigs = new Map(state.channel_configs);
                newConfigs.set(channel_name, updatedChannel);

                return { ...state, channel_configs: newConfigs };
            }

            // Otherwise, move to next source
            const updatedChannel = {
                ...channelConfig,
                current_source_index: nextIndex,
                current_step: 'query_generation' as ConfigStep
            };

            const newConfigs = new Map(state.channel_configs);
            newConfigs.set(channel_name, updatedChannel);

            return { ...state, channel_configs: newConfigs };
        }

        case 'COMPLETE_CHANNEL': {
            const { channel_name } = action.payload;
            const channelConfig = state.channel_configs.get(channel_name);
            if (!channelConfig) return state;

            const updatedChannel = {
                ...channelConfig,
                is_complete: true,
                current_step: 'channel_complete' as ConfigStep
            };

            const newConfigs = new Map(state.channel_configs);
            newConfigs.set(channel_name, updatedChannel);

            return { ...state, channel_configs: newConfigs };
        }

        case 'NEXT_CHANNEL': {
            const nextIndex = state.current_channel_index + 1;

            // Check if all channels are complete
            if (nextIndex >= state.channels.length) {
                return {
                    ...state,
                    is_complete: true
                };
            }

            return {
                ...state,
                current_channel_index: nextIndex
            };
        }

        case 'SAVE_PROGRESS_START': {
            return { ...state, is_saving: true, error: undefined };
        }

        case 'SAVE_PROGRESS_SUCCESS': {
            return { ...state, is_saving: false };
        }

        case 'SAVE_PROGRESS_ERROR': {
            return { ...state, is_saving: false, error: action.payload.error };
        }

        default:
            return state;
    }
}

// ============================================================================
// Main Component
// ============================================================================

export default function ImplementationConfigPage() {
    const { streamId } = useParams<{ streamId: string }>();
    const navigate = useNavigate();

    const [state, dispatch] = useReducer(configReducer, {
        stream_id: parseInt(streamId || '0'),
        stream_name: '',
        channels: [],
        available_sources: [],
        channel_configs: new Map(),
        current_channel_index: 0,
        is_saving: false,
        is_complete: false
    });

    const [isLoading, setIsLoading] = useState(true);
    const [stream, setStream] = useState<any>(null);

    // Load stream data on mount
    useEffect(() => {
        async function loadStream() {
            try {
                const [streamData, sources] = await Promise.all([
                    researchStreamApi.getResearchStream(parseInt(streamId || '0')),
                    researchStreamApi.getInformationSources()
                ]);

                setStream(streamData);
                dispatch({
                    type: 'LOAD_STREAM',
                    payload: {
                        stream_name: streamData.stream_name,
                        channels: streamData.channels,
                        sources
                    }
                });
            } catch (error) {
                console.error('Failed to load stream:', error);
            } finally {
                setIsLoading(false);
            }
        }

        loadStream();
    }, [streamId]);

    const currentChannel = getCurrentChannel(state);
    const currentChannelConfig = getCurrentChannelConfig(state);
    const overallProgress = getOverallProgress(state);

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

    if (state.is_complete) {
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
                        All channels have been configured for {state.stream_name}
                    </p>
                    <div className="flex gap-4 justify-center">
                        <button
                            onClick={() => navigate(`/research-streams/${streamId}`)}
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                            View Stream
                        </button>
                        <button
                            onClick={() => navigate('/research-streams')}
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
        <div className="max-w-6xl mx-auto p-6">
            {/* Header */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            Implementation Configuration
                        </h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {state.stream_name}
                        </p>
                    </div>
                    <button
                        onClick={() => navigate(`/research-streams/${streamId}`)}
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
                                        Configuring Channel {state.current_channel_index + 1} of {state.channels.length}
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
                                    {state.channels.length - state.current_channel_index}
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
                        {state.channels.map((channel, idx) => {
                            const channelConfig = state.channel_configs.get(channel.name);
                            const isComplete = channelConfig?.is_complete || false;
                            const isCurrent = idx === state.current_channel_index;

                            return (
                                <div
                                    key={channel.name}
                                    className={`flex-1 h-2 rounded-full transition-all ${
                                        isComplete
                                            ? 'bg-green-500'
                                            : isCurrent
                                            ? 'bg-blue-500'
                                            : 'bg-gray-200 dark:bg-gray-700'
                                    }`}
                                    title={`${channel.name}${isComplete ? ' ✓' : isCurrent ? ' (current)' : ''}`}
                                />
                            );
                        })}
                    </div>
                    <div className="flex justify-between mt-2">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            {state.channels.filter((ch) => state.channel_configs.get(ch.name)?.is_complete).length} completed
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            {overallProgress}% overall
                        </span>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                {!currentChannel || !currentChannelConfig ? (
                    <div className="text-center text-gray-600 dark:text-gray-400 py-12">
                        No channel to configure
                    </div>
                ) : (
                    <div>
                        {/* Source Selection Step */}
                        {currentChannelConfig.current_step === 'source_selection' && (
                            <SourceSelectionStep
                                availableSources={state.available_sources}
                                selectedSources={currentChannelConfig.selected_sources}
                                onSourcesSelected={(sourceIds) => {
                                    dispatch({
                                        type: 'SELECT_SOURCES',
                                        payload: {
                                            channel_name: currentChannel.name,
                                            source_ids: sourceIds
                                        }
                                    });
                                }}
                            />
                        )}

                        {/* Query Generation/Testing Steps */}
                        {(currentChannelConfig.current_step === 'query_generation' ||
                          currentChannelConfig.current_step === 'query_testing' ||
                          currentChannelConfig.current_step === 'query_refinement') && (
                            <>
                                {(() => {
                                    const currentSourceId = currentChannelConfig.selected_sources[currentChannelConfig.current_source_index];
                                    const currentSource = state.available_sources.find(s => s.source_id === currentSourceId);
                                    const sourceConfig = currentChannelConfig.source_configs.get(currentSourceId);

                                    if (!currentSource || !sourceConfig) {
                                        return <div className="text-center py-12 text-gray-500">Loading...</div>;
                                    }

                                    return (
                                        <QueryConfigStep
                                            streamId={state.stream_id}
                                            streamName={state.stream_name}
                                            streamPurpose={stream?.purpose || ''}
                                            channel={currentChannel}
                                            source={currentSource}
                                            sourceConfig={sourceConfig}
                                            onQueryGenerated={(query, reasoning) => {
                                                dispatch({
                                                    type: 'GENERATE_QUERY_SUCCESS',
                                                    payload: {
                                                        channel_name: currentChannel.name,
                                                        source_id: currentSourceId,
                                                        query_expression: query,
                                                        reasoning
                                                    }
                                                });
                                            }}
                                            onQueryUpdated={(query) => {
                                                dispatch({
                                                    type: 'UPDATE_QUERY',
                                                    payload: {
                                                        channel_name: currentChannel.name,
                                                        source_id: currentSourceId,
                                                        query_expression: query
                                                    }
                                                });
                                            }}
                                            onQueryTested={(result) => {
                                                dispatch({
                                                    type: 'TEST_QUERY_SUCCESS',
                                                    payload: {
                                                        channel_name: currentChannel.name,
                                                        source_id: currentSourceId,
                                                        result
                                                    }
                                                });
                                            }}
                                            onQueryConfirmed={() => {
                                                dispatch({
                                                    type: 'CONFIRM_QUERY',
                                                    payload: {
                                                        channel_name: currentChannel.name,
                                                        source_id: currentSourceId
                                                    }
                                                });
                                            }}
                                            onNextSource={() => {
                                                dispatch({
                                                    type: 'NEXT_SOURCE',
                                                    payload: { channel_name: currentChannel.name }
                                                });
                                            }}
                                            onStreamUpdated={async (updates) => {
                                                // Update stream via API
                                                try {
                                                    await researchStreamApi.updateResearchStream(state.stream_id, updates);
                                                    // Reload to get updated data
                                                    const updatedStream = await researchStreamApi.getResearchStream(state.stream_id);
                                                    setStream(updatedStream);
                                                    dispatch({
                                                        type: 'LOAD_STREAM',
                                                        payload: {
                                                            stream_name: updatedStream.stream_name,
                                                            channels: updatedStream.channels,
                                                            sources: state.available_sources
                                                        }
                                                    });
                                                } catch (error) {
                                                    console.error('Failed to update stream:', error);
                                                    alert('Failed to update stream. Please try again.');
                                                }
                                            }}
                                            onChannelUpdated={async (updates) => {
                                                // Update channel in stream via API
                                                try {
                                                    const updatedChannels = state.channels.map(ch =>
                                                        ch.name === currentChannel.name ? { ...ch, ...updates } : ch
                                                    );
                                                    await researchStreamApi.updateResearchStream(state.stream_id, {
                                                        channels: updatedChannels
                                                    });
                                                    // Reload to get updated data
                                                    const updatedStream = await researchStreamApi.getResearchStream(state.stream_id);
                                                    setStream(updatedStream);
                                                    dispatch({
                                                        type: 'LOAD_STREAM',
                                                        payload: {
                                                            stream_name: updatedStream.stream_name,
                                                            channels: updatedStream.channels,
                                                            sources: state.available_sources
                                                        }
                                                    });
                                                } catch (error) {
                                                    console.error('Failed to update channel:', error);
                                                    alert('Failed to update channel. Please try again.');
                                                }
                                            }}
                                            isLastSource={currentChannelConfig.current_source_index === currentChannelConfig.selected_sources.length - 1}
                                        />
                                    );
                                })()}
                            </>
                        )}

                        {/* Semantic Filter Step - Placeholder */}
                        {currentChannelConfig.current_step === 'semantic_filter_config' && (
                            <div className="text-center py-12">
                                <p className="text-gray-600 dark:text-gray-400 mb-4">
                                    Semantic Filter Configuration
                                </p>
                                <button
                                    onClick={() => {
                                        dispatch({
                                            type: 'COMPLETE_CHANNEL',
                                            payload: { channel_name: currentChannel.name }
                                        });
                                        dispatch({ type: 'NEXT_CHANNEL' });
                                    }}
                                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                                >
                                    Skip for now & Complete Channel
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
