import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { researchStreamApi } from '../lib/api/researchStreamApi';
import { Channel, InformationSource, ResearchStream } from '../types/research-stream';
import { CanonicalResearchArticle } from '../types/canonical_types';
import { SourceQueryConfig, SemanticFilterConfig, ChannelConfigState } from '../types/implementation-config';

// ============================================================================
// Context Type
// ============================================================================

interface ImplementationConfigContextType {
    // State - individual properties
    streamId: number;
    streamName: string;
    channels: Channel[];
    availableSources: InformationSource[];
    channelConfigs: Map<string, ChannelConfigState>;
    currentChannelIndex: number;
    isComplete: boolean;

    // Computed values
    stream: ResearchStream | null;
    isLoading: boolean;
    currentChannel: Channel | null;
    currentChannelConfig: ChannelConfigState | null;
    overallProgress: number;

    // Actions
    loadStream: () => Promise<void>;
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
// Provider
// ============================================================================

interface ImplementationConfigProviderProps {
    streamId: number;
    children: ReactNode;
}

export function ImplementationConfigProvider({ streamId, children }: ImplementationConfigProviderProps) {
    // State using individual useState hooks
    const [streamName, setStreamName] = useState('');
    const [channels, setChannels] = useState<Channel[]>([]);
    const [availableSources, setAvailableSources] = useState<InformationSource[]>([]);
    const [channelConfigs, setChannelConfigs] = useState<Map<string, ChannelConfigState>>(new Map());
    const [currentChannelIndex, setCurrentChannelIndex] = useState(0);
    const [isComplete, setIsComplete] = useState(false);
    const [stream, setStream] = useState<ResearchStream | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Computed values
    const currentChannel = currentChannelIndex < channels.length ? channels[currentChannelIndex] : null;
    const currentChannelConfig = currentChannel ? channelConfigs.get(currentChannel.name) || null : null;

    const overallProgress = channels.length === 0 ? 0 : Math.round(
        (channels.filter(ch => channelConfigs.get(ch.name)?.is_complete).length / channels.length) * 100
    );

    // Load stream data
    const loadStream = useCallback(async () => {
        setIsLoading(true);
        try {
            const [streamData, sources] = await Promise.all([
                researchStreamApi.getResearchStream(streamId),
                researchStreamApi.getInformationSources()
            ]);

            setStream(streamData);
            setStreamName(streamData.stream_name);
            setChannels(streamData.channels);
            setAvailableSources(sources);

            // Initialize channel configs
            const configs = new Map<string, ChannelConfigState>();
            streamData.channels.forEach(channel => {
                configs.set(channel.name, {
                    channel,
                    selected_sources: [],
                    source_configs: new Map(),
                    current_source_index: 0,
                    current_step: 'source_selection',
                    is_complete: false
                });
            });
            setChannelConfigs(configs);
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
        setChannelConfigs(prev => {
            const config = prev.get(channelName);
            if (!config) return prev;

            const source_configs = new Map<string, SourceQueryConfig>();
            sourceIds.forEach(source_id => {
                const source = availableSources.find(s => s.source_id === source_id);
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

            const newConfigs = new Map(prev);
            newConfigs.set(channelName, {
                ...config,
                selected_sources: sourceIds,
                source_configs,
                current_step: 'query_generation'
            });
            return newConfigs;
        });
    }, [availableSources]);

    // Query operations
    const generateQuery = useCallback(async (channelName: string, sourceId: string) => {
        try {
            const result = await researchStreamApi.generateChannelQuery(streamId, channelName, { source_id: sourceId });

            setChannelConfigs(prev => {
                const config = prev.get(channelName);
                if (!config) return prev;

                const sourceConfig = config.source_configs.get(sourceId);
                if (!sourceConfig) return prev;

                const newSourceConfigs = new Map(config.source_configs);
                newSourceConfigs.set(sourceId, {
                    ...sourceConfig,
                    query_expression: result.query_expression,
                    query_reasoning: result.reasoning
                });

                const newConfigs = new Map(prev);
                newConfigs.set(channelName, {
                    ...config,
                    source_configs: newSourceConfigs,
                    current_step: 'query_testing'
                });
                return newConfigs;
            });
        } catch (error) {
            console.error('Query generation failed:', error);
            throw error;
        }
    }, [streamId]);

    const updateQuery = useCallback((channelName: string, sourceId: string, query: string) => {
        setChannelConfigs(prev => {
            const config = prev.get(channelName);
            if (!config) return prev;

            const sourceConfig = config.source_configs.get(sourceId);
            if (!sourceConfig) return prev;

            const newSourceConfigs = new Map(config.source_configs);
            newSourceConfigs.set(sourceId, {
                ...sourceConfig,
                query_expression: query,
                is_tested: false,
                test_result: undefined
            });

            const newConfigs = new Map(prev);
            newConfigs.set(channelName, {
                ...config,
                source_configs: newSourceConfigs
            });
            return newConfigs;
        });
    }, []);

    const testQuery = useCallback(async (channelName: string, sourceId: string, request: any) => {
        try {
            const result = await researchStreamApi.testChannelQuery(streamId, channelName, request);

            setChannelConfigs(prev => {
                const config = prev.get(channelName);
                if (!config) return prev;

                const sourceConfig = config.source_configs.get(sourceId);
                if (!sourceConfig) return prev;

                const newSourceConfigs = new Map(config.source_configs);
                newSourceConfigs.set(sourceId, {
                    ...sourceConfig,
                    is_tested: true,
                    test_result: result
                });

                const newConfigs = new Map(prev);
                newConfigs.set(channelName, {
                    ...config,
                    source_configs: newSourceConfigs,
                    current_step: 'query_refinement'
                });
                return newConfigs;
            });
        } catch (error) {
            console.error('Query test failed:', error);
            throw error;
        }
    }, [streamId]);

    const confirmQuery = useCallback((channelName: string, sourceId: string) => {
        setChannelConfigs(prev => {
            const config = prev.get(channelName);
            if (!config) return prev;

            const sourceConfig = config.source_configs.get(sourceId);
            if (!sourceConfig) return prev;

            const newSourceConfigs = new Map(config.source_configs);
            newSourceConfigs.set(sourceId, {
                ...sourceConfig,
                is_confirmed: true
            });

            const newConfigs = new Map(prev);
            newConfigs.set(channelName, {
                ...config,
                source_configs: newSourceConfigs
            });
            return newConfigs;
        });
    }, []);

    const nextSource = useCallback((channelName: string) => {
        setChannelConfigs(prev => {
            const config = prev.get(channelName);
            if (!config) return prev;

            const nextIndex = config.current_source_index + 1;

            const newConfigs = new Map(prev);
            if (nextIndex >= config.selected_sources.length) {
                // Move to semantic filter step
                newConfigs.set(channelName, {
                    ...config,
                    current_step: 'semantic_filter_config'
                });
            } else {
                // Move to next source
                newConfigs.set(channelName, {
                    ...config,
                    current_source_index: nextIndex,
                    current_step: 'query_generation'
                });
            }
            return newConfigs;
        });
    }, []);

    // Filter operations
    const generateFilter = useCallback(async (channelName: string) => {
        try {
            const result = await researchStreamApi.generateChannelFilter(streamId, channelName);

            setChannelConfigs(prev => {
                const config = prev.get(channelName);
                if (!config) return prev;

                const newConfigs = new Map(prev);
                newConfigs.set(channelName, {
                    ...config,
                    semantic_filter: {
                        enabled: true,
                        criteria: result.filter_criteria,
                        reasoning: result.reasoning,
                        threshold: 0.7,
                        is_tested: false
                    }
                });
                return newConfigs;
            });
        } catch (error) {
            console.error('Filter generation failed:', error);
            throw error;
        }
    }, [streamId]);

    const updateFilterCriteria = useCallback((channelName: string, criteria: string) => {
        setChannelConfigs(prev => {
            const config = prev.get(channelName);
            if (!config || !config.semantic_filter) return prev;

            const newConfigs = new Map(prev);
            newConfigs.set(channelName, {
                ...config,
                semantic_filter: {
                    ...config.semantic_filter,
                    criteria,
                    is_tested: false
                }
            });
            return newConfigs;
        });
    }, []);

    const updateFilterThreshold = useCallback((channelName: string, threshold: number) => {
        setChannelConfigs(prev => {
            const config = prev.get(channelName);
            if (!config || !config.semantic_filter) return prev;

            const newConfigs = new Map(prev);
            newConfigs.set(channelName, {
                ...config,
                semantic_filter: {
                    ...config.semantic_filter,
                    threshold
                }
            });
            return newConfigs;
        });
    }, []);

    const testFilter = useCallback(async (channelName: string, articles: CanonicalResearchArticle[], criteria: string, threshold: number) => {
        try {
            const result = await researchStreamApi.testChannelFilter(streamId, channelName, {
                articles,
                filter_criteria: criteria,
                threshold
            });

            setChannelConfigs(prev => {
                const config = prev.get(channelName);
                if (!config || !config.semantic_filter) return prev;

                const newConfigs = new Map(prev);
                newConfigs.set(channelName, {
                    ...config,
                    semantic_filter: {
                        ...config.semantic_filter,
                        is_tested: true,
                        test_result: result
                    }
                });
                return newConfigs;
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
            setStreamName(updatedStream.stream_name);
            setChannels(updatedStream.channels);
        } catch (error) {
            console.error('Failed to update stream:', error);
            throw error;
        }
    }, [streamId]);

    const updateChannel = useCallback(async (channelName: string, updates: Partial<Channel>) => {
        try {
            const updatedChannels = channels.map(ch =>
                ch.name === channelName ? { ...ch, ...updates } : ch
            );
            await researchStreamApi.updateResearchStream(streamId, { channels: updatedChannels });
            const updatedStream = await researchStreamApi.getResearchStream(streamId);
            setStream(updatedStream);
            setChannels(updatedStream.channels);
        } catch (error) {
            console.error('Failed to update channel:', error);
            throw error;
        }
    }, [streamId, channels]);

    // Channel completion
    const completeChannel = useCallback(() => {
        if (!currentChannel) return;

        setChannelConfigs(prev => {
            const config = prev.get(currentChannel.name);
            if (!config) return prev;

            const newConfigs = new Map(prev);
            newConfigs.set(currentChannel.name, {
                ...config,
                is_complete: true,
                current_step: 'channel_complete'
            });
            return newConfigs;
        });

        // Move to next channel
        const nextIndex = currentChannelIndex + 1;
        if (nextIndex >= channels.length) {
            setIsComplete(true);
        } else {
            setCurrentChannelIndex(nextIndex);
        }
    }, [currentChannel, currentChannelIndex, channels.length]);

    const value: ImplementationConfigContextType = {
        // State - individual properties
        streamId,
        streamName,
        channels,
        availableSources,
        channelConfigs,
        currentChannelIndex,
        isComplete,

        // Computed values
        stream,
        isLoading,
        currentChannel,
        currentChannelConfig,
        overallProgress,

        // Actions
        loadStream,
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
