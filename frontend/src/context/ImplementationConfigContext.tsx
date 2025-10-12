import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { researchStreamApi } from '../lib/api/researchStreamApi';
import { Channel, InformationSource, ResearchStream, ChannelWorkflowConfig, SourceQuery } from '../types/research-stream';
import { CanonicalResearchArticle } from '../types/canonical_types';
import { ConfigStep, QueryTestResult, FilterTestResult, QueryDefinitionSubState, FilterDefinitionSubState } from '../types/implementation-config';

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

    // Sub-states for steps (explicit state machine)
    querySubState: QueryDefinitionSubState;
    filterSubState: FilterDefinitionSubState;

    // Computed values
    isComplete: boolean;
    overallProgress: number;
    selectedSources: string[];  // Derived from workflow_config
    currentSourceId: string | null;
    currentSourceQuery: SourceQuery | null;
    sampleArticles: CanonicalResearchArticle[];  // Sample articles from query tests

    // Helpers
    isChannelComplete: (channelId: string) => boolean;

    // Actions - workflow transitions
    selectSources: (sourceIds: string[]) => Promise<void>;
    generateQuery: () => Promise<{ query_expression: string; reasoning: string }>;
    updateQuery: (query: string) => Promise<void>;
    testQuery: (request: any) => Promise<QueryTestResult>;
    confirmQuery: () => void;
    generateFilter: () => Promise<{ filter_criteria: string; reasoning: string }>;
    updateFilterCriteria: (criteria: string) => Promise<void>;
    updateFilterThreshold: (threshold: number) => Promise<void>;
    completeFilterDefinition: () => void;
    testFilter: (articles: CanonicalResearchArticle[], criteria: string, threshold: number) => Promise<FilterTestResult>;
    updateStream: (updates: { stream_name?: string; purpose?: string }) => Promise<void>;
    updateChannel: (updates: Partial<Channel>) => Promise<void>;
    completeChannel: () => void;
    navigateToChannel: (channelIndex: number) => void;
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

    // Sub-states for explicit state machine
    const [querySubState, setQuerySubState] = useState<QueryDefinitionSubState>('awaiting_generation');
    const [filterSubState, setFilterSubState] = useState<FilterDefinitionSubState>('awaiting_generation');

    // Sample articles collected from query tests (for filter testing)
    const [sampleArticles, setSampleArticles] = useState<CanonicalResearchArticle[]>([]);

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

    // Helper function to initialize workflow state for a channel based on its configuration
    const initializeChannelState = useCallback((channelConfig: ChannelWorkflowConfig | null | undefined) => {
        if (!channelConfig || Object.keys(channelConfig.source_queries).length === 0) {
            // No config - start at source selection
            setCurrentStep('source_selection');
            setCurrentSourceIndex(0);
            setQuerySubState('awaiting_generation');
            setFilterSubState('awaiting_generation');
            return;
        }

        // Has config - check what's configured
        const sourceQueries = Object.values(channelConfig.source_queries);
        const hasAllQueries = sourceQueries.every(sq => sq !== null);
        const hasFilter = channelConfig.semantic_filter?.criteria && channelConfig.semantic_filter.criteria.length > 0;

        if (!hasAllQueries) {
            // Some queries missing - go to query definition
            setCurrentStep('query_definition');
            const firstNullIndex = sourceQueries.findIndex(sq => sq === null);
            setCurrentSourceIndex(firstNullIndex >= 0 ? firstNullIndex : 0);

            // Check if current source has a query
            const sourceIds = Object.keys(channelConfig.source_queries);
            const currentSourceId = sourceIds[firstNullIndex >= 0 ? firstNullIndex : 0];
            const currentQuery = channelConfig.source_queries[currentSourceId];
            setQuerySubState(currentQuery?.query_expression ? 'query_generated' : 'awaiting_generation');
        } else if (!hasFilter) {
            // All queries done, filter missing - go to filter definition
            setCurrentStep('semantic_filter_definition');
            setCurrentSourceIndex(0);
            setFilterSubState(channelConfig.semantic_filter?.criteria ? 'filter_generated' : 'awaiting_generation');
        } else {
            // Everything configured - go to channel testing
            setCurrentStep('channel_testing');
            setCurrentSourceIndex(0);
        }
    }, []);

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

            // Initialize current step and sub-states based on existing configuration
            const firstChannel = streamData.channels[0];
            const channelConfig = firstChannel && streamData.workflow_config?.channel_configs?.[firstChannel.channel_id];

            // Use the helper to initialize state
            initializeChannelState(channelConfig);
        } catch (error) {
            console.error('Failed to load stream:', error);
        } finally {
            setIsLoading(false);
        }
    }, [streamId, initializeChannelState]);

    useEffect(() => {
        loadStream();
    }, [loadStream]);

    // Reinitialize sub-states when channel or source changes (e.g., user navigates back)
    useEffect(() => {
        if (!currentChannel || !currentChannelWorkflowConfig) return;

        // Reinitialize query sub-state based on current source query
        if (currentStep === 'query_definition') {
            if (currentSourceQuery?.query_expression) {
                setQuerySubState('query_generated');
            } else {
                setQuerySubState('awaiting_generation');
            }
        }

        // Reinitialize filter sub-state based on existing filter
        if (currentStep === 'semantic_filter_definition') {
            if (currentChannelWorkflowConfig.semantic_filter?.criteria) {
                setFilterSubState('filter_generated');
            } else {
                setFilterSubState('awaiting_generation');
            }
        }
    }, [currentChannelIndex, currentSourceIndex, currentStep, currentChannel, currentChannelWorkflowConfig, currentSourceQuery]);

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

        // Save to database and reload stream
        await researchStreamApi.updateResearchStream(streamId, { workflow_config });
        await reloadStream();

        // IMPORTANT: Move to query definition step AFTER reload completes
        // so that selectedSources is properly derived from updated workflow_config
        setCurrentSourceIndex(0);
        setCurrentStep('query_definition');
        setQuerySubState('awaiting_generation');
    }, [currentChannel, stream, streamId, reloadStream]);

    // Generate query - generates but doesn't save
    const generateQuery = useCallback(async (): Promise<{ query_expression: string; reasoning: string }> => {
        if (!currentChannel || !currentSourceId) throw new Error('No current channel or source');

        // 1. Call API to generate
        const result = await researchStreamApi.generateChannelQuery(streamId, currentChannel.name, { source_id: currentSourceId });

        // 2. No save - user will review first
        // 3. No reload - nothing changed in DB
        // 4. Update sub-state to indicate query is generated
        setQuerySubState('query_generated');
        // 5. No step change - stay on query_definition
        // 6. Return result for UI
        return result;
    }, [currentChannel, currentSourceId, streamId]);

    // Update query - saves to database, no step change (user might edit again)
    const updateQuery = useCallback(async (query: string) => {
        if (!currentChannel || !currentSourceId) return;

        // 1. Validate - already done with guards

        // 2. Call API to save
        await researchStreamApi.updateChannelSourceQuery(
            streamId,
            currentChannel.channel_id,
            currentSourceId,
            { query_expression: query, enabled: true }
        );

        // 3. Reload to get updated data
        await reloadStream();

        // 4. No step change - user might want to edit more
        // 5. No return value needed
    }, [currentChannel, currentSourceId, streamId, reloadStream]);

    // Test query - tests query to get count (no step change)
    const testQuery = useCallback(async (request: any): Promise<QueryTestResult> => {
        if (!currentChannel) throw new Error('No current channel');

        // 1. Validate - already done

        // 2. Call API to test
        const result = await researchStreamApi.testChannelQuery(streamId, currentChannel.name, request);

        // 3. Collect sample articles (first 5) for later channel testing
        if (result.success && result.sample_articles && result.sample_articles.length > 0) {
            setSampleArticles(prev => {
                // Add new articles, limit to first 5 per source (total max ~25 for 5 sources)
                const newArticles = result.sample_articles.slice(0, 5);
                // Keep unique articles by title
                const combined = [...prev, ...newArticles];
                const unique = combined.filter((article, index, self) =>
                    index === self.findIndex(a => a.title === article.title)
                );
                return unique;
            });
        }

        // 4. Update sub-state to indicate query has been tested
        setQuerySubState('query_tested');
        // 5. No save - just testing
        // 6. No reload - nothing changed
        // 7. No step change - stay on query_definition
        // 8. Return result for UI
        return result;
    }, [currentChannel, streamId]);

    // Confirm query and advance to next source or semantic filter
    const confirmQuery = useCallback(() => {
        // Query should already be saved via updateQuery
        // Just advance workflow

        const nextIndex = currentSourceIndex + 1;

        if (nextIndex >= selectedSources.length) {
            // All sources configured, move to semantic filter definition
            setCurrentStep('semantic_filter_definition');

            // Initialize filter sub-state based on existing filter
            if (currentChannelWorkflowConfig?.semantic_filter?.criteria) {
                setFilterSubState('filter_generated');
            } else {
                setFilterSubState('awaiting_generation');
            }
        } else {
            // Move to next source
            setCurrentSourceIndex(nextIndex);
            setCurrentStep('query_definition');

            // Initialize query sub-state based on existing query for next source
            const nextSourceId = selectedSources[nextIndex];
            const nextSourceQuery = currentChannelWorkflowConfig?.source_queries[nextSourceId];
            if (nextSourceQuery?.query_expression) {
                setQuerySubState('query_generated');
            } else {
                setQuerySubState('awaiting_generation');
            }
        }
    }, [currentSourceIndex, selectedSources, currentChannelWorkflowConfig]);

    // Generate filter - generates and saves (no testing here)
    const generateFilter = useCallback(async (): Promise<{ filter_criteria: string; reasoning: string }> => {
        if (!currentChannel) throw new Error('No current channel');

        // 1. Call API to generate
        const result = await researchStreamApi.generateChannelFilter(streamId, currentChannel.name);

        // 2. Call API to save immediately
        await researchStreamApi.updateChannelSemanticFilter(
            streamId,
            currentChannel.channel_id,
            {
                enabled: true,
                criteria: result.filter_criteria,
                threshold: 0.7
            }
        );

        // 3. Reload to get updated data
        await reloadStream();

        // 4. Update sub-state to indicate filter is generated
        setFilterSubState('filter_generated');
        // 5. No step change - stay on semantic_filter_definition
        // 6. Return result for UI
        return result;
    }, [currentChannel, streamId, reloadStream]);

    // Update filter criteria - saves to database, no step change (user might edit again)
    const updateFilterCriteria = useCallback(async (criteria: string) => {
        if (!currentChannel || !currentChannelWorkflowConfig) return;

        // 1. Validate - already done with guards

        // 2. Call API to save
        await researchStreamApi.updateChannelSemanticFilter(
            streamId,
            currentChannel.channel_id,
            {
                enabled: currentChannelWorkflowConfig.semantic_filter.enabled,
                criteria,
                threshold: currentChannelWorkflowConfig.semantic_filter.threshold
            }
        );

        // 3. Reload to get updated data
        await reloadStream();

        // 4. No step change - user might want to edit more
        // 5. No return value needed
    }, [currentChannel, currentChannelWorkflowConfig, streamId, reloadStream]);

    // Update filter threshold - saves to database, no step change
    const updateFilterThreshold = useCallback(async (threshold: number) => {
        if (!currentChannel || !currentChannelWorkflowConfig) return;

        // 1. Validate - already done with guards

        // 2. Call API to save
        await researchStreamApi.updateChannelSemanticFilter(
            streamId,
            currentChannel.channel_id,
            {
                enabled: currentChannelWorkflowConfig.semantic_filter.enabled,
                criteria: currentChannelWorkflowConfig.semantic_filter.criteria,
                threshold
            }
        );

        // 3. Reload to get updated data
        await reloadStream();

        // 4. No step change - just updating threshold
        // 5. No return value needed
    }, [currentChannel, currentChannelWorkflowConfig, streamId, reloadStream]);

    // Complete filter definition and move to channel testing
    const completeFilterDefinition = useCallback(() => {
        // Filter should already be saved
        // Move to channel testing step
        setCurrentStep('channel_testing');
    }, []);

    // Test filter - tests filter, no save or step change (used in channel_testing step)
    const testFilter = useCallback(async (
        articles: CanonicalResearchArticle[],
        criteria: string,
        threshold: number
    ): Promise<FilterTestResult> => {
        if (!currentChannel) throw new Error('No current channel');

        // 1. Validate - already done

        // 2. Call API to test
        const result = await researchStreamApi.testChannelFilter(streamId, currentChannel.name, {
            articles,
            filter_criteria: criteria,
            threshold
        });

        // 3. No save - just testing
        // 4. No reload - nothing changed
        // 5. No step change - user reviews results

        // 6. Return result for UI
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

    // Complete channel and advance to next channel or finish workflow
    const completeChannel = useCallback(() => {
        // Filter should already be saved via updateFilterCriteria/updateFilterThreshold
        // Just advance workflow

        const nextChannelIndex = currentChannelIndex + 1;

        // Advance to next channel first
        setCurrentChannelIndex(nextChannelIndex);
        setSampleArticles([]); // Clear for next channel

        // Then check if there's a next channel and initialize its state
        if (stream && nextChannelIndex < stream.channels.length) {
            const nextChannel = stream.channels[nextChannelIndex];
            const nextChannelConfig = stream.workflow_config?.channel_configs?.[nextChannel.channel_id];
            initializeChannelState(nextChannelConfig);
        }
    }, [currentChannelIndex, stream, initializeChannelState]);

    // Navigate to any channel by index
    const navigateToChannel = useCallback((channelIndex: number) => {
        if (!stream || channelIndex < 0 || channelIndex >= stream.channels.length) {
            console.warn('Invalid channel index:', channelIndex);
            return;
        }

        const targetChannel = stream.channels[channelIndex];
        const targetChannelConfig = stream.workflow_config?.channel_configs?.[targetChannel.channel_id];

        // Set the channel index
        setCurrentChannelIndex(channelIndex);

        // Initialize state for this channel
        initializeChannelState(targetChannelConfig);

        // Clear sample articles when switching channels
        setSampleArticles([]);
    }, [stream, initializeChannelState]);

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

        // Sub-states for steps (explicit state machine)
        querySubState,
        filterSubState,

        // Computed values
        isComplete,
        overallProgress,
        selectedSources,
        currentSourceId,
        currentSourceQuery,
        sampleArticles,

        // Helpers
        isChannelComplete,

        // Actions
        selectSources,
        generateQuery,
        updateQuery,
        testQuery,
        confirmQuery,
        generateFilter,
        updateFilterCriteria,
        updateFilterThreshold,
        completeFilterDefinition,
        testFilter,
        updateStream,
        updateChannel,
        completeChannel,
        navigateToChannel
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
