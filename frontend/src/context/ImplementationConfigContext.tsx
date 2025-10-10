import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { researchStreamApi } from '../lib/api/researchStreamApi';
import { Channel, InformationSource, ResearchStream, ChannelWorkflowConfig, SourceQuery } from '../types/research-stream';
import { CanonicalResearchArticle } from '../types/canonical_types';
import { ConfigStep, QueryTestResult, FilterTestResult } from '../types/implementation-config';

// ============================================================================
// Context Type
// ============================================================================

interface ImplementationConfigContextType {
    // Core state
    stream: ResearchStream | null;
    availableSources: InformationSource[];
    isLoading: boolean;

    // Current workflow position (simple!)
    currentChannelIndex: number;
    currentChannel: Channel | null;
    currentChannelWorkflowConfig: ChannelWorkflowConfig | null;
    currentStep: ConfigStep;
    currentSourceIndex: number;

    // Computed values
    isComplete: boolean;
    overallProgress: number;
    selectedSources: string[];  // Derived from workflow_config
    currentSourceId: string | null;
    currentSourceQuery: SourceQuery | null;

    // Helpers
    isChannelComplete: (channelId: string) => boolean;

    // Actions - these all save directly to workflow_config
    selectSources: (sourceIds: string[]) => Promise<void>;
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

    // Current workflow position (simple - no map!)
    const [currentChannelIndex, setCurrentChannelIndex] = useState(0);
    const [currentStep, setCurrentStep] = useState<ConfigStep>('source_selection');
    const [currentSourceIndex, setCurrentSourceIndex] = useState(0);

    // Computed values
    const currentChannel = stream && currentChannelIndex < stream.channels.length
        ? stream.channels[currentChannelIndex]
        : null;

    const currentChannelWorkflowConfig = currentChannel && stream?.workflow_config?.channel_configs
        ? stream.workflow_config.channel_configs[currentChannel.channel_id] || null
        : null;

    // Derive selected sources from workflow_config (keys in source_queries map)
    const selectedSources = currentChannelWorkflowConfig
        ? Object.keys(currentChannelWorkflowConfig.source_queries)
        : [];

    const currentSourceId = selectedSources[currentSourceIndex] || null;
    const currentSourceQuery = currentSourceId && currentChannelWorkflowConfig
        ? currentChannelWorkflowConfig.source_queries[currentSourceId]
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
        // Complete if it has at least one configured (non-null) source query
        return config ? Object.values(config.source_queries).some(sq => sq !== null) : false;
    }, [stream]);

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

            // Initialize current step based on whether first channel has config
            const firstChannel = streamData.channels[0];
            const hasConfig = firstChannel && streamData.workflow_config?.channel_configs?.[firstChannel.channel_id];
            setCurrentStep(hasConfig ? 'query_generation' : 'source_selection');
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

    // Source selection - creates null entries in workflow_config to store intent
    const selectSources = useCallback(async (sourceIds: string[]) => {
        if (!currentChannel) return;

        // Create null entries for each selected source
        const sourceQueriesMap: Record<string, null> = {};
        sourceIds.forEach(sourceId => {
            sourceQueriesMap[sourceId] = null;
        });

        // Get or create workflow_config
        const workflow_config = stream?.workflow_config || { channel_configs: {} };
        if (!workflow_config.channel_configs) {
            workflow_config.channel_configs = {};
        }

        // Create channel config with null entries for selected sources
        workflow_config.channel_configs[currentChannel.channel_id] = {
            source_queries: sourceQueriesMap,
            semantic_filter: {
                enabled: false,
                criteria: '',
                threshold: 0.7
            }
        };

        // Save to database
        await researchStreamApi.updateResearchStream(streamId, { workflow_config });
        await reloadStream();

        // Move to query generation step
        setCurrentSourceIndex(0);
        setCurrentStep('query_generation');
    }, [currentChannel, stream, streamId]);

    // Generate query - returns result but doesn't save yet
    const generateQuery = useCallback(async (): Promise<{ query_expression: string; reasoning: string }> => {
        if (!currentChannel || !currentSourceId) throw new Error('No current channel or source');

        const result = await researchStreamApi.generateChannelQuery(streamId, currentChannel.name, { source_id: currentSourceId });

        // Move to testing step
        setCurrentStep('query_testing');

        return result;
    }, [currentChannel, currentSourceId, streamId]);

    // Update query - saves immediately to workflow_config
    const updateQuery = useCallback(async (query: string) => {
        if (!currentChannel || !currentSourceId) return;

        await researchStreamApi.updateChannelSourceQuery(
            streamId,
            currentChannel.channel_id,
            currentSourceId,
            { query_expression: query, enabled: true }
        );

        await reloadStream();
    }, [currentChannel, currentSourceId, streamId, reloadStream]);

    // Test query - returns test results (not saved)
    const testQuery = useCallback(async (request: any): Promise<QueryTestResult> => {
        if (!currentChannel) throw new Error('No current channel');

        const result = await researchStreamApi.testChannelQuery(streamId, currentChannel.name, request);

        // Move to refinement step
        setCurrentStep('query_refinement');

        return result;
    }, [currentChannel, streamId]);

    // Confirm query - query should already be saved
    const confirmQuery = useCallback(async () => {
        // Query is already saved via updateQuery
        // This just confirms the user is happy with it
    }, []);

    // Move to next source or semantic filter step
    const nextSource = useCallback(() => {
        const nextIndex = currentSourceIndex + 1;

        if (nextIndex >= selectedSources.length) {
            // All sources configured, move to semantic filter
            setCurrentStep('semantic_filter_config');
        } else {
            // Move to next source
            setCurrentSourceIndex(nextIndex);
            setCurrentStep('query_generation');
        }
    }, [currentSourceIndex, selectedSources]);

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
        // Move to next channel and reset state
        setCurrentChannelIndex(prev => prev + 1);
        setCurrentSourceIndex(0);
        setCurrentStep('source_selection');
    }, []);

    const value: ImplementationConfigContextType = {
        // Core state
        stream,
        availableSources,
        isLoading,

        // Current workflow position
        currentChannelIndex,
        currentChannel,
        currentChannelWorkflowConfig,
        currentStep,
        currentSourceIndex,

        // Computed values
        isComplete,
        overallProgress,
        selectedSources,
        currentSourceId,
        currentSourceQuery,

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
