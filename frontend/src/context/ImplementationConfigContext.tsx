import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { researchStreamApi } from '../lib/api/researchStreamApi';
import { Channel, InformationSource, ResearchStream, ChannelWorkflowConfig, SourceQuery } from '../types/research-stream';
import { CanonicalResearchArticle } from '../types/canonical_types';
import { ConfigStep, ChannelConfigUIState, QueryTestResult, FilterTestResult } from '../types/implementation-config';

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
    currentChannel: Channel | null;
    currentChannelWorkflowConfig: ChannelWorkflowConfig | null; // From workflow_config.channel_configs

    // UI state for current channel
    uiState: ChannelConfigUIState | null;

    // Computed values
    isComplete: boolean;
    overallProgress: number;

    // Helpers
    isChannelComplete: (channelName: string) => boolean;
    getCurrentSourceQuery: () => SourceQuery | null;

    // Actions - these all save directly to workflow_config
    selectSources: (sourceIds: string[]) => void;
    generateQuery: () => Promise<{ query_expression: string; reasoning: string }>;
    updateQuery: (query: string) => Promise<void>;
    testQuery: (request: any) => Promise<QueryTestResult>;
    confirmQuery: () => Promise<void>;
    nextSource: () => void;
    generateFilter: () => Promise<{ filter_criteria: string; reasoning: string }>;
    updateFilterCriteria: (criteria: string) => Promise<void>;
    updateFilterThreshold: (threshold: number) => Promise<void>;
    testFilter: (articles: CanonicalResearchArticle[], criteria: string, threshold: number) => Promise<FilterTestResult>;
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
    // Core state
    const [stream, setStream] = useState<ResearchStream | null>(null);
    const [availableSources, setAvailableSources] = useState<InformationSource[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Workflow position
    const [currentChannelIndex, setCurrentChannelIndex] = useState(0);

    // UI state per channel (not persisted)
    const [channelUIStates, setChannelUIStates] = useState<Map<string, ChannelConfigUIState>>(new Map());

    // Computed values
    const currentChannel = stream && currentChannelIndex < stream.channels.length
        ? stream.channels[currentChannelIndex]
        : null;

    const currentChannelWorkflowConfig = currentChannel && stream?.workflow_config?.channel_configs
        ? stream.workflow_config.channel_configs[currentChannel.channel_id] || null
        : null;

    const uiState = currentChannel
        ? channelUIStates.get(currentChannel.channel_id) || null
        : null;

    const isComplete = stream ? currentChannelIndex >= stream.channels.length : false;

    const overallProgress = stream && stream.channels.length > 0
        ? Math.round((Object.values(stream.workflow_config?.channel_configs || {}).filter(cc =>
            Object.keys(cc.source_queries).length > 0
        ).length || 0) / stream.channels.length * 100)
        : 0;

    // Helper to check if a channel is complete
    const isChannelComplete = useCallback((channelId: string) => {
        if (!stream?.workflow_config?.channel_configs) return false;
        const config = stream.workflow_config.channel_configs[channelId];
        return config ? Object.keys(config.source_queries).length > 0 : false;
    }, [stream]);

    // Helper to get current source query
    const getCurrentSourceQuery = useCallback((): SourceQuery | null => {
        if (!currentChannelWorkflowConfig || !uiState) return null;
        const sourceId = uiState.selected_sources[uiState.current_source_index];
        return currentChannelWorkflowConfig.source_queries[sourceId] || null;
    }, [currentChannelWorkflowConfig, uiState]);

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

            // Initialize UI states for channels that don't have workflow config yet
            const uiStates = new Map<string, ChannelConfigUIState>();
            streamData.channels.forEach(channel => {
                const hasConfig = streamData.workflow_config?.channel_configs?.[channel.channel_id];
                uiStates.set(channel.channel_id, {
                    selected_sources: [],
                    current_source_index: 0,
                    current_step: hasConfig ? 'query_generation' : 'source_selection'
                });
            });
            setChannelUIStates(uiStates);
        } catch (error) {
            console.error('Failed to load stream:', error);
        } finally {
            setIsLoading(false);
        }
    }, [streamId]);

    useEffect(() => {
        loadStream();
    }, [loadStream]);

    // Reload stream after any mutation
    const reloadStream = useCallback(async () => {
        const updatedStream = await researchStreamApi.getResearchStream(streamId);
        setStream(updatedStream);
    }, [streamId]);

    // Source selection - updates UI state only
    const selectSources = useCallback((sourceIds: string[]) => {
        if (!currentChannel) return;

        setChannelUIStates(prev => {
            const newStates = new Map(prev);
            newStates.set(currentChannel.channel_id, {
                selected_sources: sourceIds,
                current_source_index: 0,
                current_step: 'query_generation'
            });
            return newStates;
        });
    }, [currentChannel]);

    // Generate query - returns result but doesn't save yet
    const generateQuery = useCallback(async (): Promise<{ query_expression: string; reasoning: string }> => {
        if (!currentChannel || !uiState) throw new Error('No current channel');
        const sourceId = uiState.selected_sources[uiState.current_source_index];
        if (!sourceId) throw new Error('No current source');

        const result = await researchStreamApi.generateChannelQuery(streamId, currentChannel.name, { source_id: sourceId });

        // Update UI state to move to testing
        setChannelUIStates(prev => {
            const newStates = new Map(prev);
            newStates.set(currentChannel.channel_id, {
                ...uiState,
                current_step: 'query_testing'
            });
            return newStates;
        });

        return result;
    }, [currentChannel, uiState, streamId]);

    // Update query - saves immediately to workflow_config
    const updateQuery = useCallback(async (query: string) => {
        if (!currentChannel || !uiState) return;
        const sourceId = uiState.selected_sources[uiState.current_source_index];
        if (!sourceId) return;

        await researchStreamApi.updateChannelSourceQuery(
            streamId,
            currentChannel.channel_id,
            sourceId,
            { query_expression: query, enabled: true }
        );

        await reloadStream();
    }, [currentChannel, uiState, streamId, reloadStream]);

    // Test query - returns test results (not saved)
    const testQuery = useCallback(async (request: any): Promise<QueryTestResult> => {
        if (!currentChannel) throw new Error('No current channel');

        const result = await researchStreamApi.testChannelQuery(streamId, currentChannel.name, request);

        // Update UI state to move to refinement
        if (uiState) {
            setChannelUIStates(prev => {
                const newStates = new Map(prev);
                newStates.set(currentChannel.channel_id, {
                    ...uiState,
                    current_step: 'query_refinement'
                });
                return newStates;
            });
        }

        return result;
    }, [currentChannel, uiState, streamId]);

    // Confirm query - saves query to workflow_config
    const confirmQuery = useCallback(async () => {
        if (!currentChannel || !uiState) return;
        const sourceId = uiState.selected_sources[uiState.current_source_index];
        const currentQuery = getCurrentSourceQuery();
        if (!sourceId || !currentQuery) return;

        // Query should already be saved, just mark as confirmed in UI
        // (In future we could add a "confirmed" flag to SourceQuery if needed)

    }, [currentChannel, uiState, getCurrentSourceQuery]);

    // Move to next source or semantic filter step
    const nextSource = useCallback(() => {
        if (!currentChannel || !uiState) return;

        const nextIndex = uiState.current_source_index + 1;

        setChannelUIStates(prev => {
            const newStates = new Map(prev);
            if (nextIndex >= uiState.selected_sources.length) {
                // Move to semantic filter step
                newStates.set(currentChannel.channel_id, {
                    ...uiState,
                    current_step: 'semantic_filter_config'
                });
            } else {
                // Move to next source
                newStates.set(currentChannel.channel_id, {
                    ...uiState,
                    current_source_index: nextIndex,
                    current_step: 'query_generation'
                });
            }
            return newStates;
        });
    }, [currentChannel, uiState]);

    // Generate filter - returns result but doesn't save yet
    const generateFilter = useCallback(async (): Promise<{ filter_criteria: string; reasoning: string }> => {
        if (!currentChannel) throw new Error('No current channel');

        const result = await researchStreamApi.generateChannelFilter(streamId, currentChannel.name);

        // Save filter immediately
        await researchStreamApi.updateChannelSemanticFilter(
            streamId,
            currentChannel.channel_id,
            {
                enabled: true,
                criteria: result.filter_criteria,
                threshold: 0.7
            }
        );

        await reloadStream();

        return result;
    }, [currentChannel, streamId, reloadStream]);

    // Update filter criteria - saves immediately
    const updateFilterCriteria = useCallback(async (criteria: string) => {
        if (!currentChannel || !currentChannelWorkflowConfig) return;

        await researchStreamApi.updateChannelSemanticFilter(
            streamId,
            currentChannel.channel_id,
            {
                enabled: currentChannelWorkflowConfig.semantic_filter.enabled,
                criteria,
                threshold: currentChannelWorkflowConfig.semantic_filter.threshold
            }
        );

        await reloadStream();
    }, [currentChannel, currentChannelWorkflowConfig, streamId, reloadStream]);

    // Update filter threshold - saves immediately
    const updateFilterThreshold = useCallback(async (threshold: number) => {
        if (!currentChannel || !currentChannelWorkflowConfig) return;

        await researchStreamApi.updateChannelSemanticFilter(
            streamId,
            currentChannel.channel_id,
            {
                enabled: currentChannelWorkflowConfig.semantic_filter.enabled,
                criteria: currentChannelWorkflowConfig.semantic_filter.criteria,
                threshold
            }
        );

        await reloadStream();
    }, [currentChannel, currentChannelWorkflowConfig, streamId, reloadStream]);

    // Test filter - returns test results (not saved)
    const testFilter = useCallback(async (
        articles: CanonicalResearchArticle[],
        criteria: string,
        threshold: number
    ): Promise<FilterTestResult> => {
        if (!currentChannel) throw new Error('No current channel');

        const result = await researchStreamApi.testChannelFilter(streamId, currentChannel.name, {
            articles,
            filter_criteria: criteria,
            threshold
        });

        return result;
    }, [currentChannel, streamId]);

    // Stream/Channel updates
    const updateStream = useCallback(async (updates: { stream_name?: string; purpose?: string }) => {
        await researchStreamApi.updateResearchStream(streamId, updates);
        await reloadStream();
    }, [streamId, reloadStream]);

    const updateChannel = useCallback(async (updates: Partial<Channel>) => {
        if (!currentChannel || !stream) return;

        const updatedChannels = stream.channels.map(ch =>
            ch.channel_id === currentChannel.channel_id ? { ...ch, ...updates } : ch
        );
        await researchStreamApi.updateResearchStream(streamId, { channels: updatedChannels });
        await reloadStream();
    }, [streamId, currentChannel, stream, reloadStream]);

    // Channel completion
    const completeChannel = useCallback(() => {
        if (!currentChannel) return;

        // Just move to next channel - configuration is already saved
        setCurrentChannelIndex(prev => prev + 1);
    }, [currentChannel]);

    const value: ImplementationConfigContextType = {
        // Core state
        stream,
        availableSources,
        isLoading,

        // Current position
        currentChannelIndex,
        currentChannel,
        currentChannelWorkflowConfig,
        uiState,

        // Computed
        isComplete,
        overallProgress,

        // Helpers
        isChannelComplete,
        getCurrentSourceQuery,

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
