import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { researchStreamApi } from '../lib/api/researchStreamApi';
import { Channel, InformationSource, ResearchStream } from '../types/research-stream';
import { CanonicalResearchArticle } from '../types/canonical_types';
import { SourceQueryConfig, ChannelConfigState } from '../types/implementation-config';

// ============================================================================
// Context Type
// ============================================================================

interface ImplementationConfigContextType {
    // Core state
    stream: ResearchStream | null;
    availableSources: InformationSource[];
    isLoading: boolean;

    // Current workflow position
    currentChannelIndex: number;
    currentChannelConfig: ChannelConfigState | null;

    // Computed values
    currentChannel: Channel | null;
    isComplete: boolean;
    overallProgress: number;

    // Helpers
    isChannelComplete: (channelName: string) => boolean;

    // Actions - simplified, most don't need channel/source params
    selectSources: (sourceIds: string[]) => void;
    generateQuery: () => Promise<void>;
    updateQuery: (query: string) => void;
    testQuery: (request: any) => Promise<void>;
    confirmQuery: () => void;
    nextSource: () => void;
    generateFilter: () => Promise<void>;
    updateFilterCriteria: (criteria: string) => void;
    updateFilterThreshold: (threshold: number) => void;
    testFilter: (articles: CanonicalResearchArticle[], criteria: string, threshold: number) => Promise<void>;
    updateStream: (updates: { stream_name?: string; purpose?: string }) => Promise<void>;
    updateChannel: (updates: Partial<Channel>) => Promise<void>;
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
    // Core state - just stream and sources
    const [stream, setStream] = useState<ResearchStream | null>(null);
    const [availableSources, setAvailableSources] = useState<InformationSource[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Workflow state - track configs per channel
    const [channelConfigs, setChannelConfigs] = useState<Map<string, ChannelConfigState>>(new Map());
    const [currentChannelIndex, setCurrentChannelIndex] = useState(0);

    // Computed values
    const currentChannel = stream && currentChannelIndex < stream.channels.length
        ? stream.channels[currentChannelIndex]
        : null;

    const currentChannelConfig = currentChannel
        ? channelConfigs.get(currentChannel.name) || null
        : null;

    const isComplete = stream ? currentChannelIndex >= stream.channels.length : false;

    const overallProgress = stream && stream.channels.length > 0
        ? Math.round((stream.channels.filter(ch => channelConfigs.get(ch.name)?.is_complete).length / stream.channels.length) * 100)
        : 0;

    // Helper to get current source info
    const getCurrentSourceInfo = () => {
        if (!currentChannelConfig) return null;
        const sourceId = currentChannelConfig.selected_sources[currentChannelConfig.current_source_index];
        const source = availableSources.find(s => s.source_id === sourceId);
        return { sourceId, source };
    };

    // Load stream data
    const loadStream = useCallback(async () => {
        setIsLoading(true);
        try {
            const [streamData, sources] = await Promise.all([
                researchStreamApi.getResearchStream(streamId),
                researchStreamApi.getInformationSources()
            ]);

            setStream(streamData);
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

    // Source selection - simplified, uses current channel
    const selectSources = useCallback((sourceIds: string[]) => {
        if (!currentChannel) return;

        setChannelConfigs(prev => {
            const config = prev.get(currentChannel.name);
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
            newConfigs.set(currentChannel.name, {
                ...config,
                selected_sources: sourceIds,
                source_configs,
                current_step: 'query_generation'
            });
            return newConfigs;
        });
    }, [currentChannel, availableSources]);

    // Query operations - simplified, no need to pass channel/source
    const generateQuery = useCallback(async () => {
        if (!currentChannel) return;
        const sourceInfo = getCurrentSourceInfo();
        if (!sourceInfo?.sourceId) return;

        try {
            const result = await researchStreamApi.generateChannelQuery(streamId, currentChannel.name, { source_id: sourceInfo.sourceId });

            setChannelConfigs(prev => {
                const config = prev.get(currentChannel.name);
                if (!config) return prev;

                const sourceConfig = config.source_configs.get(sourceInfo.sourceId);
                if (!sourceConfig) return prev;

                const newSourceConfigs = new Map(config.source_configs);
                newSourceConfigs.set(sourceInfo.sourceId, {
                    ...sourceConfig,
                    query_expression: result.query_expression,
                    query_reasoning: result.reasoning
                });

                const newConfigs = new Map(prev);
                newConfigs.set(currentChannel.name, {
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
    }, [currentChannel, streamId, getCurrentSourceInfo]);

    const updateQuery = useCallback((query: string) => {
        if (!currentChannel) return;
        const sourceInfo = getCurrentSourceInfo();
        if (!sourceInfo?.sourceId) return;

        setChannelConfigs(prev => {
            const config = prev.get(currentChannel.name);
            if (!config) return prev;

            const sourceConfig = config.source_configs.get(sourceInfo.sourceId);
            if (!sourceConfig) return prev;

            const newSourceConfigs = new Map(config.source_configs);
            newSourceConfigs.set(sourceInfo.sourceId, {
                ...sourceConfig,
                query_expression: query,
                is_tested: false,
                test_result: undefined
            });

            const newConfigs = new Map(prev);
            newConfigs.set(currentChannel.name, {
                ...config,
                source_configs: newSourceConfigs
            });
            return newConfigs;
        });
    }, [currentChannel, getCurrentSourceInfo]);

    const testQuery = useCallback(async (request: any) => {
        if (!currentChannel) return;
        const sourceInfo = getCurrentSourceInfo();
        if (!sourceInfo?.sourceId) return;

        try {
            const result = await researchStreamApi.testChannelQuery(streamId, currentChannel.name, request);

            setChannelConfigs(prev => {
                const config = prev.get(currentChannel.name);
                if (!config) return prev;

                const sourceConfig = config.source_configs.get(sourceInfo.sourceId);
                if (!sourceConfig) return prev;

                const newSourceConfigs = new Map(config.source_configs);
                newSourceConfigs.set(sourceInfo.sourceId, {
                    ...sourceConfig,
                    is_tested: true,
                    test_result: result
                });

                const newConfigs = new Map(prev);
                newConfigs.set(currentChannel.name, {
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
    }, [currentChannel, streamId, getCurrentSourceInfo]);

    const confirmQuery = useCallback(() => {
        if (!currentChannel) return;
        const sourceInfo = getCurrentSourceInfo();
        if (!sourceInfo?.sourceId) return;

        setChannelConfigs(prev => {
            const config = prev.get(currentChannel.name);
            if (!config) return prev;

            const sourceConfig = config.source_configs.get(sourceInfo.sourceId);
            if (!sourceConfig) return prev;

            const newSourceConfigs = new Map(config.source_configs);
            newSourceConfigs.set(sourceInfo.sourceId, {
                ...sourceConfig,
                is_confirmed: true
            });

            const newConfigs = new Map(prev);
            newConfigs.set(currentChannel.name, {
                ...config,
                source_configs: newSourceConfigs
            });
            return newConfigs;
        });
    }, [currentChannel, getCurrentSourceInfo]);

    const nextSource = useCallback(() => {
        if (!currentChannel) return;

        setChannelConfigs(prev => {
            const config = prev.get(currentChannel.name);
            if (!config) return prev;

            const nextIndex = config.current_source_index + 1;

            const newConfigs = new Map(prev);
            if (nextIndex >= config.selected_sources.length) {
                // Move to semantic filter step
                newConfigs.set(currentChannel.name, {
                    ...config,
                    current_step: 'semantic_filter_config'
                });
            } else {
                // Move to next source
                newConfigs.set(currentChannel.name, {
                    ...config,
                    current_source_index: nextIndex,
                    current_step: 'query_generation'
                });
            }
            return newConfigs;
        });
    }, [currentChannel]);

    // Filter operations - simplified
    const generateFilter = useCallback(async () => {
        if (!currentChannel) return;

        try {
            const result = await researchStreamApi.generateChannelFilter(streamId, currentChannel.name);

            setChannelConfigs(prev => {
                const config = prev.get(currentChannel.name);
                if (!config) return prev;

                const newConfigs = new Map(prev);
                newConfigs.set(currentChannel.name, {
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
    }, [currentChannel, streamId]);

    const updateFilterCriteria = useCallback((criteria: string) => {
        if (!currentChannel) return;

        setChannelConfigs(prev => {
            const config = prev.get(currentChannel.name);
            if (!config || !config.semantic_filter) return prev;

            const newConfigs = new Map(prev);
            newConfigs.set(currentChannel.name, {
                ...config,
                semantic_filter: {
                    ...config.semantic_filter,
                    criteria,
                    is_tested: false
                }
            });
            return newConfigs;
        });
    }, [currentChannel]);

    const updateFilterThreshold = useCallback((threshold: number) => {
        if (!currentChannel) return;

        setChannelConfigs(prev => {
            const config = prev.get(currentChannel.name);
            if (!config || !config.semantic_filter) return prev;

            const newConfigs = new Map(prev);
            newConfigs.set(currentChannel.name, {
                ...config,
                semantic_filter: {
                    ...config.semantic_filter,
                    threshold
                }
            });
            return newConfigs;
        });
    }, [currentChannel]);

    const testFilter = useCallback(async (articles: CanonicalResearchArticle[], criteria: string, threshold: number) => {
        if (!currentChannel) return;

        try {
            const result = await researchStreamApi.testChannelFilter(streamId, currentChannel.name, {
                articles,
                filter_criteria: criteria,
                threshold
            });

            setChannelConfigs(prev => {
                const config = prev.get(currentChannel.name);
                if (!config || !config.semantic_filter) return prev;

                const newConfigs = new Map(prev);
                newConfigs.set(currentChannel.name, {
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
    }, [currentChannel, streamId]);

    // Stream/Channel updates
    const updateStream = useCallback(async (updates: { stream_name?: string; purpose?: string }) => {
        try {
            await researchStreamApi.updateResearchStream(streamId, updates);
            const updatedStream = await researchStreamApi.getResearchStream(streamId);
            setStream(updatedStream);
        } catch (error) {
            console.error('Failed to update stream:', error);
            throw error;
        }
    }, [streamId]);

    const updateChannel = useCallback(async (updates: Partial<Channel>) => {
        if (!currentChannel || !stream) return;

        try {
            const updatedChannels = stream.channels.map(ch =>
                ch.name === currentChannel.name ? { ...ch, ...updates } : ch
            );
            await researchStreamApi.updateResearchStream(streamId, { channels: updatedChannels });
            const updatedStream = await researchStreamApi.getResearchStream(streamId);
            setStream(updatedStream);
        } catch (error) {
            console.error('Failed to update channel:', error);
            throw error;
        }
    }, [streamId, currentChannel, stream]);

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
        setCurrentChannelIndex(prev => prev + 1);
    }, [currentChannel]);

    // Helper to check if a channel is complete
    const isChannelComplete = useCallback((channelName: string) => {
        return channelConfigs.get(channelName)?.is_complete || false;
    }, [channelConfigs]);

    const value: ImplementationConfigContextType = {
        // Core state
        stream,
        availableSources,
        isLoading,

        // Current position
        currentChannelIndex,
        currentChannelConfig,

        // Computed
        currentChannel,
        isComplete,
        overallProgress,

        // Helpers
        isChannelComplete,

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
