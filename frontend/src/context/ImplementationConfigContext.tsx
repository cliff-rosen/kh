import React, { createContext, useContext, useReducer, useCallback, useState, useEffect, ReactNode } from 'react';
import { researchStreamApi } from '../lib/api/researchStreamApi';
import {
    ConfigAction,
    ConfigStep,
    getCurrentChannel,
    getCurrentChannelConfig,
    getOverallProgress
} from '../types/implementation-config';
import { Channel, InformationSource, ResearchStream } from '../types/research-stream';
import { CanonicalResearchArticle } from '../types/canonical_types';

// ============================================================================
// Context Type
// ============================================================================

interface ImplementationConfigContextType {
    // State - individual properties instead of nested "state" object
    streamId: number;
    streamName: string;
    channels: Channel[];
    availableSources: InformationSource[];
    channelConfigs: Map<string, any>;
    currentChannelIndex: number;
    isSaving: boolean;
    isComplete: boolean;
    error?: string;

    // Computed values
    stream: ResearchStream | null;
    isLoading: boolean;
    currentChannel: Channel | null;
    currentChannelConfig: any | null;
    overallProgress: number;

    // Actions
    selectSources: (channelName: string, sourceIds: string[]) => void;
    generateQuery: (channelName: string, sourceId: string) => Promise<void>;
    updateQuery: (channelName: string, sourceId: string, query: string) => void;
    testQuery: (channelName: string, sourceId: string, request: any) => Promise<void>;
    confirmQuery: (channelName: string, sourceId: string) => void;
    nextSource: (channelName: string) => void;
    generateFilter: (channelName: string) => Promise<void>;
    updateFilterCriteria: (channelName: string, criteria: string) => void;
    updateFilterThreshold: (channelName: string, threshold: number) => void;
    testFilter: (channelName: string, articles: CanonicalResearchArticle[], criteria: string, threshold: number) => Promise<void>;
    updateStream: (updates: { stream_name?: string; purpose?: string }) => Promise<void>;
    updateChannel: (channelName: string, updates: Partial<Channel>) => Promise<void>;
    completeChannel: () => void;
}

const ImplementationConfigContext = createContext<ImplementationConfigContextType | undefined>(undefined);

// ============================================================================
// Reducer
// ============================================================================

interface ImplementationConfigState {
    stream_id: number;
    stream_name: string;
    channels: Channel[];
    available_sources: InformationSource[];
    channel_configs: Map<string, any>;
    current_channel_index: number;
    is_saving: boolean;
    is_complete: boolean;
    error?: string;
}

function configReducer(state: ImplementationConfigState, action: ConfigAction): ImplementationConfigState {
    switch (action.type) {
        case 'LOAD_STREAM': {
            const { stream_name, channels, sources } = action.payload;

            const channel_configs = new Map();
            channels.forEach(channel => {
                channel_configs.set(channel.name, {
                    channel,
                    selected_sources: [],
                    source_configs: new Map(),
                    current_source_index: 0,
                    completed_steps: [],
                    current_step: 'source_selection' as ConfigStep,
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

            const source_configs = new Map();
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
                is_tested: false,
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

            if (nextIndex >= channelConfig.selected_sources.length) {
                const updatedChannel = {
                    ...channelConfig,
                    current_step: 'semantic_filter_config' as ConfigStep
                };

                const newConfigs = new Map(state.channel_configs);
                newConfigs.set(channel_name, updatedChannel);

                return { ...state, channel_configs: newConfigs };
            }

            const updatedChannel = {
                ...channelConfig,
                current_source_index: nextIndex,
                current_step: 'query_generation' as ConfigStep
            };

            const newConfigs = new Map(state.channel_configs);
            newConfigs.set(channel_name, updatedChannel);

            return { ...state, channel_configs: newConfigs };
        }

        case 'GENERATE_FILTER_SUCCESS': {
            const { channel_name, criteria, reasoning } = action.payload;
            const channelConfig = state.channel_configs.get(channel_name);
            if (!channelConfig) return state;

            const updatedChannel = {
                ...channelConfig,
                semantic_filter: {
                    enabled: true,
                    criteria,
                    reasoning,
                    threshold: 0.7,
                    is_tested: false
                }
            };

            const newConfigs = new Map(state.channel_configs);
            newConfigs.set(channel_name, updatedChannel);

            return { ...state, channel_configs: newConfigs };
        }

        case 'UPDATE_SEMANTIC_FILTER': {
            const { channel_name, filter } = action.payload;
            const channelConfig = state.channel_configs.get(channel_name);
            if (!channelConfig) return state;

            const updatedChannel = {
                ...channelConfig,
                semantic_filter: {
                    ...channelConfig.semantic_filter!,
                    ...filter
                }
            };

            const newConfigs = new Map(state.channel_configs);
            newConfigs.set(channel_name, updatedChannel);

            return { ...state, channel_configs: newConfigs };
        }

        case 'TEST_SEMANTIC_FILTER_SUCCESS': {
            const { channel_name, result } = action.payload;
            const channelConfig = state.channel_configs.get(channel_name);
            if (!channelConfig || !channelConfig.semantic_filter) return state;

            const updatedChannel = {
                ...channelConfig,
                semantic_filter: {
                    ...channelConfig.semantic_filter,
                    is_tested: true,
                    test_result: result
                }
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

        default:
            return state;
    }
}

// ============================================================================
// Provider
// ============================================================================

interface ImplementationConfigProviderProps {
    streamId: number;
    children: ReactNode;
}

export function ImplementationConfigProvider({ streamId, children }: ImplementationConfigProviderProps) {
    const [state, dispatch] = useReducer(configReducer, {
        stream_id: streamId,
        stream_name: '',
        channels: [],
        available_sources: [],
        channel_configs: new Map(),
        current_channel_index: 0,
        is_saving: false,
        is_complete: false
    });

    const [isLoading, setIsLoading] = useState(true);
    const [stream, setStream] = useState<ResearchStream | null>(null);

    // Load stream data
    const loadStream = useCallback(async () => {
        try {
            const [streamData, sources] = await Promise.all([
                researchStreamApi.getResearchStream(streamId),
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
    }, [streamId]);

    useEffect(() => {
        loadStream();
    }, [loadStream]);

    // Source selection
    const selectSources = useCallback((channelName: string, sourceIds: string[]) => {
        dispatch({
            type: 'SELECT_SOURCES',
            payload: { channel_name: channelName, source_ids: sourceIds }
        });
    }, []);

    // Query operations
    const generateQuery = useCallback(async (channelName: string, sourceId: string) => {
        try {
            const result = await researchStreamApi.generateChannelQuery(streamId, channelName, { source_id: sourceId });
            dispatch({
                type: 'GENERATE_QUERY_SUCCESS',
                payload: {
                    channel_name: channelName,
                    source_id: sourceId,
                    query_expression: result.query_expression,
                    reasoning: result.reasoning
                }
            });
        } catch (error) {
            console.error('Query generation failed:', error);
            throw error;
        }
    }, [streamId]);

    const updateQuery = useCallback((channelName: string, sourceId: string, query: string) => {
        dispatch({
            type: 'UPDATE_QUERY',
            payload: { channel_name: channelName, source_id: sourceId, query_expression: query }
        });
    }, []);

    const testQuery = useCallback(async (channelName: string, sourceId: string, request: any) => {
        try {
            const result = await researchStreamApi.testChannelQuery(streamId, channelName, request);
            dispatch({
                type: 'TEST_QUERY_SUCCESS',
                payload: { channel_name: channelName, source_id: sourceId, result }
            });
        } catch (error) {
            console.error('Query test failed:', error);
            throw error;
        }
    }, [streamId]);

    const confirmQuery = useCallback((channelName: string, sourceId: string) => {
        dispatch({
            type: 'CONFIRM_QUERY',
            payload: { channel_name: channelName, source_id: sourceId }
        });
    }, []);

    const nextSource = useCallback((channelName: string) => {
        dispatch({
            type: 'NEXT_SOURCE',
            payload: { channel_name: channelName }
        });
    }, []);

    // Filter operations
    const generateFilter = useCallback(async (channelName: string) => {
        try {
            const result = await researchStreamApi.generateChannelFilter(streamId, channelName);
            dispatch({
                type: 'GENERATE_FILTER_SUCCESS',
                payload: {
                    channel_name: channelName,
                    criteria: result.filter_criteria,
                    reasoning: result.reasoning
                }
            });
        } catch (error) {
            console.error('Filter generation failed:', error);
            throw error;
        }
    }, [streamId]);

    const updateFilterCriteria = useCallback((channelName: string, criteria: string) => {
        dispatch({
            type: 'UPDATE_SEMANTIC_FILTER',
            payload: { channel_name: channelName, filter: { criteria } }
        });
    }, []);

    const updateFilterThreshold = useCallback((channelName: string, threshold: number) => {
        dispatch({
            type: 'UPDATE_SEMANTIC_FILTER',
            payload: { channel_name: channelName, filter: { threshold } }
        });
    }, []);

    const testFilter = useCallback(async (channelName: string, articles: CanonicalResearchArticle[], criteria: string, threshold: number) => {
        try {
            const result = await researchStreamApi.testChannelFilter(streamId, channelName, {
                articles,
                filter_criteria: criteria,
                threshold
            });
            dispatch({
                type: 'TEST_SEMANTIC_FILTER_SUCCESS',
                payload: { channel_name: channelName, result }
            });
        } catch (error) {
            console.error('Filter test failed:', error);
            throw error;
        }
    }, [streamId]);

    // Channel/Stream updates
    const updateStream = useCallback(async (updates: { stream_name?: string; purpose?: string }) => {
        try {
            await researchStreamApi.updateResearchStream(streamId, updates);
            const updatedStream = await researchStreamApi.getResearchStream(streamId);
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
            throw error;
        }
    }, [streamId, state.available_sources]);

    const updateChannel = useCallback(async (channelName: string, updates: Partial<Channel>) => {
        try {
            const updatedChannels = state.channels.map(ch =>
                ch.name === channelName ? { ...ch, ...updates } : ch
            );
            await researchStreamApi.updateResearchStream(streamId, { channels: updatedChannels });
            const updatedStream = await researchStreamApi.getResearchStream(streamId);
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
            throw error;
        }
    }, [streamId, state.channels, state.available_sources]);

    // Channel completion
    const completeChannel = useCallback(() => {
        const currentChannel = getCurrentChannel(state);
        if (!currentChannel) return;

        dispatch({
            type: 'COMPLETE_CHANNEL',
            payload: { channel_name: currentChannel.name }
        });
        dispatch({ type: 'NEXT_CHANNEL' });
    }, [state]);

    // Helper methods
    const currentChannel = getCurrentChannel(state);
    const currentChannelConfig = getCurrentChannelConfig(state);
    const overallProgress = getOverallProgress(state);

    const value: ImplementationConfigContextType = {
        // State - individual properties
        streamId: state.stream_id,
        streamName: state.stream_name,
        channels: state.channels,
        availableSources: state.available_sources,
        channelConfigs: state.channel_configs,
        currentChannelIndex: state.current_channel_index,
        isSaving: state.is_saving,
        isComplete: state.is_complete,
        error: state.error,

        // Computed values
        stream,
        isLoading,
        currentChannel,
        currentChannelConfig,
        overallProgress,

        // Actions
        selectSources,
        generateQuery,
        updateQuery,
        testQuery,
        confirmQuery,
        nextSource,
        generateFilter,
        updateFilterCriteria,
        updateFilterThreshold,
        testFilter,
        updateStream,
        updateChannel,
        completeChannel
    };

    return (
        <ImplementationConfigContext.Provider value={value}>
            {children}
        </ImplementationConfigContext.Provider>
    );
}

export function useImplementationConfig(): ImplementationConfigContextType {
    const context = useContext(ImplementationConfigContext);
    if (context === undefined) {
        throw new Error('useImplementationConfig must be used within an ImplementationConfigProvider');
    }
    return context;
}
