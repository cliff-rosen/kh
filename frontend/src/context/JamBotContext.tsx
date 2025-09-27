import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react';

import { chatApi } from '@/lib/api/chatApi';
import { toolsApi, assetApi, missionApi, sessionApi, stateTransitionApi, hopApi } from '@/lib/api';
import { useAuth } from './AuthContext';

import { ChatMessage, AgentResponse, ChatRequest, MessageRole, StreamResponse } from '@/types/chat';
import { Mission, MissionStatus, Hop, HopStatus, ToolStep, ToolExecutionStatus } from '@/types/workflow';
import { Asset } from '@/types/asset';
import { AssetStatus } from '@/types/asset';
import { AssetRole } from '@/types/asset';

interface JamBotState {
    currentMessages: ChatMessage[];
    currentStreamingMessage: string;
    mission: Mission | null;
    error?: string;
    isCreatingSession: boolean;
    isProcessing: boolean;
}

type JamBotAction =
    | { type: 'ADD_MESSAGE'; payload: ChatMessage }
    | { type: 'SET_MESSAGES'; payload: ChatMessage[] }
    | { type: 'UPDATE_STREAMING_MESSAGE'; payload: string }
    | { type: 'SEND_MESSAGE'; payload: ChatMessage }
    | { type: 'SET_MISSION'; payload: Mission }
    | { type: 'UPDATE_MISSION'; payload: Partial<Mission> }
    | { type: 'SET_PROCESSING'; payload: boolean }
    | { type: 'ACCEPT_MISSION_PROPOSAL'; payload?: Mission }
    | { type: 'ACCEPT_HOP_PROPOSAL'; payload: { hop: Hop; proposedAssets: any[] } }
    | { type: 'ACCEPT_HOP_IMPLEMENTATION_PROPOSAL'; payload: Hop }
    | { type: 'ACCEPT_HOP_IMPLEMENTATION_AS_COMPLETE'; payload: Hop }
    | { type: 'START_HOP_EXECUTION'; payload: string }
    | { type: 'FAIL_HOP_EXECUTION'; payload: { hopId: string; error: string } }
    | { type: 'RETRY_HOP_EXECUTION'; payload: string }
    | { type: 'UPDATE_HOP_STATE'; payload: { hop: Hop; updatedMissionOutputs: Map<string, Asset> } }
    | { type: 'SET_STATE'; payload: JamBotState }
    | { type: 'EXECUTE_TOOL_STEP'; payload: { step: ToolStep; hop: Hop } }
    | { type: 'SET_ERROR'; payload: string }
    | { type: 'CLEAR_ERROR' }
    | { type: 'SET_CREATING_SESSION'; payload: boolean };

const initialState: JamBotState = {
    currentMessages: [],
    currentStreamingMessage: '',
    mission: null,
    isCreatingSession: false,
    isProcessing: false
};

// Helper function to sanitize asset values
const sanitizeAsset = (asset: Asset): Asset => {
    return {
        ...asset,
        value_representation: typeof asset.value_representation === 'string'
            ? asset.value_representation.substring(0, 100)
            : JSON.stringify(asset.value_representation).substring(0, 100)
    };
};

// Helper function to sanitize asset arrays
const sanitizeAssetArray = (assets: Asset[]): Asset[] => {
    return assets.map(asset => sanitizeAsset(asset));
};

// Helper function to create asset on backend
const createAssetOnBackend = async (asset: Asset): Promise<void> => {
    try {
        await assetApi.createAsset({
            name: asset.name,
            description: asset.description,
            type: asset.schema_definition.type,
            subtype: asset.subtype,
            role: asset.role,
            content: asset.value_representation,
            asset_metadata: asset.asset_metadata
        });
        console.log('Successfully created asset on backend:', asset.name);
    } catch (error) {
        console.error('Failed to create asset on backend:', asset.name, error);
    }
};

const jamBotReducer = (state: JamBotState, action: JamBotAction): JamBotState => {
    switch (action.type) {
        case 'SET_STATE':
            return action.payload;
        case 'ADD_MESSAGE':
            return {
                ...state,
                currentMessages: [...state.currentMessages, action.payload],
            };
        case 'SET_MESSAGES':
            return {
                ...state,
                currentMessages: action.payload
            };
        case 'UPDATE_STREAMING_MESSAGE':
            return {
                ...state,
                currentStreamingMessage: action.payload,
            };
        case 'SET_MISSION':
            return {
                ...state,
                mission: action.payload
            };
        case 'UPDATE_MISSION':
            if (!state.mission) return state;
            return {
                ...state,
                mission: {
                    ...state.mission,
                    ...action.payload
                }
            };

        case 'ACCEPT_MISSION_PROPOSAL':
            const proposedMission = action.payload;
            console.log('Reducer ACCEPT_MISSION_PROPOSAL:', proposedMission);

            if (!proposedMission) {
                console.log('No proposed mission payload, returning state');
                return state;
            }

            const newState = {
                ...state,
                mission: {
                    ...proposedMission,
                    status: MissionStatus.IN_PROGRESS
                }
            };

            console.log('New state after accepting mission:', newState);
            return newState;
        case 'ACCEPT_HOP_PROPOSAL':
            if (!state.mission) return state;
            const { hop: acceptedHop, proposedAssets } = action.payload;

            // Add proposed assets to mission state and convert from PROPOSED to PENDING
            const updatedMissionState = { ...state.mission.assets };
            if (proposedAssets && Array.isArray(proposedAssets)) {
                proposedAssets.forEach((assetData: any) => {
                    if (assetData && assetData.id) {
                        // Convert PROPOSED assets to PENDING when accepted
                        const acceptedAsset = {
                            ...assetData,
                            status: assetData.status === AssetStatus.PROPOSED ? AssetStatus.PENDING : assetData.status
                        };
                        updatedMissionState[assetData.id] = acceptedAsset;

                        // Create asset on backend if it was proposed
                        if (assetData.status === AssetStatus.PROPOSED) {
                            // Create asset on backend asynchronously
                            createAssetOnBackend(acceptedAsset).catch(console.error);
                        }
                    }
                });
            }

            return {
                ...state,
                mission: {
                    ...state.mission,
                    assets: updatedMissionState,
                    current_hop: {
                        ...acceptedHop,
                        status: HopStatus.HOP_PLAN_READY
                    }
                }
            };
        case 'ACCEPT_HOP_IMPLEMENTATION_PROPOSAL':
            console.log('ACCEPT_HOP_IMPLEMENTATION_PROPOSAL', action.payload);
            if (!state.mission) return state;
            const implementationHop = action.payload;
            return {
                ...state,
                mission: {
                    ...state.mission,
                    current_hop: {
                        ...implementationHop,
                        status: HopStatus.HOP_IMPL_READY
                    }
                }
            };
        case 'ACCEPT_HOP_IMPLEMENTATION_AS_COMPLETE':
            if (!state.mission) return state;
            const completedHop = action.payload;
            const isFinalHop = completedHop.is_final;

            return {
                ...state,
                mission: {
                    ...state.mission,
                    current_hop: undefined,
                    hops: [
                        ...(state.mission.hops || []),
                        {
                            ...completedHop,
                            status: HopStatus.COMPLETED
                        }
                    ],
                    status: isFinalHop ? MissionStatus.COMPLETED : state.mission.status
                }
            };
        case 'START_HOP_EXECUTION':
            if (!state.mission || !state.mission.current_hop) return state;
            const hopIdToStart = action.payload;
            if (state.mission.current_hop.id !== hopIdToStart) return state;

            return {
                ...state,
                mission: {
                    ...state.mission,
                    current_hop: {
                        ...state.mission.current_hop,
                        status: HopStatus.EXECUTING,
                        tool_steps: state.mission.current_hop.tool_steps?.map((step, index) => {
                            if (index === 0) {
                                return { ...step, status: ToolExecutionStatus.EXECUTING };
                            }
                            return step;
                        }) || []
                    }
                }
            };
        case 'FAIL_HOP_EXECUTION':
            if (!state.mission || !state.mission.current_hop) return state;
            const { hopId: failedHopId, error } = action.payload;
            if (state.mission.current_hop.id !== failedHopId) return state;

            const failedHop = {
                ...state.mission.current_hop,
                status: HopStatus.HOP_IMPL_READY,
                error,
                tool_steps: state.mission.current_hop.tool_steps?.map(step => ({
                    ...step,
                    status: ToolExecutionStatus.FAILED
                })) || []
            };

            return {
                ...state,
                mission: {
                    ...state.mission,
                    current_hop: failedHop
                }
            };
        case 'RETRY_HOP_EXECUTION':
            if (!state.mission || !state.mission.current_hop) return state;
            const retryHopId = action.payload;
            if (state.mission.current_hop.id !== retryHopId) return state;

            const retriedHop = {
                ...state.mission.current_hop,
                status: HopStatus.HOP_IMPL_READY,
                error: undefined,
                tool_steps: state.mission.current_hop.tool_steps?.map(step => ({
                    ...step,
                    status: ToolExecutionStatus.PROPOSED
                })) || []
            };

            return {
                ...state,
                mission: {
                    ...state.mission,
                    current_hop: retriedHop
                }
            };
        case 'UPDATE_HOP_STATE':
            if (!state.mission) return state;
            const { hop, updatedMissionOutputs: _updatedMissionOutputs } = action.payload;

            // Note: Could check if all hop outputs are ready for completion logic

            // Create updated mission
            const updatedMission = {
                ...state.mission,
                current_hop: hop
            };

            // Check if all hop outputs are ready
            const allOutputsReady = Object.values(hop.assets).every(asset => {
                // Only check assets with output role
                if (asset.role === AssetRole.OUTPUT) {
                    return asset.status === AssetStatus.READY;
                }
                return true; // Non-output assets don't need to be ready for hop completion
            });

            // If hop is complete, add it to history and clear current hop
            if (allOutputsReady) {
                // Sanitize the hop state before adding to history
                const sanitizedHop = {
                    ...hop,
                    assets: sanitizeAssetArray(hop.assets),
                    status: HopStatus.COMPLETED,
                    is_resolved: true
                };

                updatedMission.hops = [
                    ...(state.mission.hops || []),
                    sanitizedHop
                ];
                // Use type assertion to handle current_hop
                (updatedMission as any).current_hop = undefined;

                // Check if all mission outputs are ready
                const allMissionOutputsReady = Object.values(updatedMission.assets).every(asset => {
                    if (asset.role === AssetRole.OUTPUT) {
                        return asset.status === AssetStatus.READY;
                    }
                    return true; // Non-output assets don't need to be ready for mission completion
                });

                // Update mission status
                if (allMissionOutputsReady) {
                    updatedMission.status = MissionStatus.COMPLETED;
                }
            }

            // No need to update mission outputs since they're managed within assets
            // The assets contains hop-scoped assets, assets contains mission-scoped assets

            return {
                ...state,
                mission: updatedMission
            };
        case 'EXECUTE_TOOL_STEP': {
            const { step, hop } = action.payload;
            if (!state.mission) return state;

            // Execute the tool step
            return {
                ...state,
                mission: {
                    ...state.mission,
                    current_hop: {
                        ...hop,
                        tool_steps: hop.tool_steps.map(s =>
                            s.id === step.id
                                ? { ...s, status: ToolExecutionStatus.EXECUTING }
                                : s
                        )
                    }
                }
            };
        }
        case 'SET_ERROR':
            return {
                ...state,
                error: action.payload
            };
        case 'CLEAR_ERROR':
            return {
                ...state,
                error: undefined
            };
        case 'SET_CREATING_SESSION':
            return {
                ...state,
                isCreatingSession: action.payload
            };
        case 'SET_PROCESSING':
            return {
                ...state,
                isProcessing: action.payload
            };
        default:
            return state;
    }
};

interface JamBotContextType {
    state: JamBotState;
    addMessage: (message: ChatMessage) => void;
    updateStreamingMessage: (message: string) => void;
    sendMessage: (message: ChatMessage) => void;
    createMessage: (content: string, role: MessageRole) => ChatMessage;
    acceptMissionProposal: () => void;
    acceptHopProposal: (hop: Hop, proposedAssets?: any[]) => void;
    acceptHopImplementationProposal: (hop: Hop) => void;
    acceptHopImplementationAsComplete: (hop: Hop) => void;
    startHopExecution: (hopId: string) => void;
    failHopExecution: (hopId: string, error: string) => void;
    retryHopExecution: (hopId: string) => void;
    updateHopState: (hop: Hop, updatedMissionOutputs: Map<string, Asset>) => void;
    setState: (newState: JamBotState) => void;
    executeToolStep: (step: ToolStep, hop: Hop) => Promise<void>;
    setError: (error: string) => void;
    clearError: () => void;
    createNewSession: () => Promise<void>;
}

const JamBotContext = createContext<JamBotContextType | null>(null);

export const useJamBot = () => {
    const context = useContext(JamBotContext);
    if (!context) {
        throw new Error('useJamBot must be used within a JamBotProvider');
    }
    return context;
};

export const JamBotProvider = ({ children }: { children: React.ReactNode }) => {
    const [state, dispatch] = useReducer(jamBotReducer, initialState);
    const { user, sessionId: _sessionId, chatId, missionId, sessionMetadata, updateSessionMission: _updateSessionMission, updateSessionMetadata, switchToNewSession, fetchActiveSession } = useAuth();
    const isInitializing = useRef(false);

    // Load data when session changes
    useEffect(() => {
        if (chatId) {
            loadChatMessages(chatId);
        }
    }, [chatId]);

    useEffect(() => {
        if (missionId) {
            loadMission(missionId);
        }
    }, [missionId]);

    useEffect(() => {
        if (sessionMetadata) {
            isInitializing.current = true;
            loadSessionState(sessionMetadata);
            // Allow auto-save after a brief delay to ensure state is loaded
            setTimeout(() => {
                isInitializing.current = false;
            }, 100);
        }
    }, [sessionMetadata]);

    // Auto-save session metadata when state changes (but not during initial load)
    useEffect(() => {
        if (isInitializing.current) return;

        if (state.mission) {
            const metadata = {
                mission: state.mission
            };
            updateSessionMetadata(metadata);
        }
    }, [state.mission, updateSessionMetadata]);

    // Data loading functions
    const loadChatMessages = async (chatId: string) => {
        try {
            console.log('Loading chat messages for chatId:', chatId);
            const response = await chatApi.getMessages(chatId);
            console.log('Loaded messages:', response.messages?.length || 0);

            dispatch({
                type: 'SET_MESSAGES',
                payload: response.messages || []
            });
        } catch (error) {
            console.error('Error loading chat messages:', error);
            // Don't clear messages if loading fails - just log the error
        }
    };

    const loadMission = async (missionId: string) => {
        try {
            const mission = await missionApi.getMission(missionId);
            dispatch({ type: 'SET_MISSION', payload: mission });
        } catch (error) {
            console.error('Error loading mission:', error);
        }
    };

    const loadSessionState = (metadata: Record<string, any>) => {
        dispatch({
            type: 'SET_STATE', payload: {
                ...state,
                mission: metadata.mission || null
            }
        });
    };

    const setState = useCallback((newState: JamBotState) => {
        dispatch({ type: 'SET_STATE', payload: newState });
    }, []);

    const addMessage = useCallback((message: ChatMessage) => {
        dispatch({ type: 'ADD_MESSAGE', payload: message });
    }, []);

    const updateStreamingMessage = useCallback((message: string) => {
        dispatch({ type: 'UPDATE_STREAMING_MESSAGE', payload: message });
    }, []);

    const acceptMissionProposal = useCallback(async () => {
        // Accept the current mission using StateTransitionService
        if (state.mission && state.mission.status === MissionStatus.AWAITING_APPROVAL) {
            try {
                // Use StateTransitionService to accept mission (step 1.2)
                const result = await stateTransitionApi.acceptMission(state.mission.id);
                console.log(`Mission accepted via StateTransitionService:`, result);

                if (result.success) {
                    // Update local state with accepted mission
                    const updatedMission = {
                        ...state.mission,
                        status: MissionStatus.IN_PROGRESS
                    };

                    dispatch({ type: 'ACCEPT_MISSION_PROPOSAL', payload: updatedMission });

                    // Session linking is handled automatically by StateTransitionService
                    console.log(`Mission ${state.mission.id} approved: ${result.message}`);
                } else {
                    console.error('StateTransitionService rejected mission acceptance:', result.message);
                    throw new Error(result.message);
                }
            } catch (error) {
                console.error('Error accepting mission proposal:', error);
                // Fall back to local state update if API call fails
                dispatch({
                    type: 'ACCEPT_MISSION_PROPOSAL', payload: {
                        ...state.mission,
                        status: MissionStatus.IN_PROGRESS
                    }
                });
            }
        } else {
            console.log('No mission awaiting approval found');
        }
    }, [state.mission]);

    const acceptHopProposal = useCallback(async (hop: Hop, proposedAssets?: any[]) => {
        // Accept the current hop using StateTransitionService (step 2.3, 3.3)
        if (hop && hop.status === HopStatus.HOP_PLAN_PROPOSED) {
            try {
                // Use StateTransitionService to accept hop plan
                const result = await stateTransitionApi.acceptHopPlan(hop.id);
                console.log(`Hop plan accepted via StateTransitionService:`, result);

                if (result.success) {
                    // Update local state with accepted hop
                    const updatedHop = {
                        ...hop,
                        status: HopStatus.HOP_PLAN_READY
                    };
                    dispatch({ type: 'ACCEPT_HOP_PROPOSAL', payload: { hop: updatedHop, proposedAssets: proposedAssets || [] } });

                    // Force mission reload to pick up state changes
                    if (state.mission?.id) {
                        await loadMission(state.mission.id);
                    }
                } else {
                    console.error('Failed to accept hop plan:', result.message);
                }
            } catch (error) {
                console.error('Error accepting hop plan via StateTransitionService:', error);
                // Still update frontend state if backend fails
                dispatch({ type: 'ACCEPT_HOP_PROPOSAL', payload: { hop, proposedAssets: proposedAssets || [] } });
            }
        } else {
            console.warn('Hop is not in HOP_PLAN_PROPOSED status, cannot accept');
        }
    }, [state.mission?.id, loadMission]);

    const acceptHopImplementationProposal = useCallback(async (hop: Hop) => {
        // Accept the current hop implementation using StateTransitionService (step 2.6, 3.6)
        if (hop && hop.status === HopStatus.HOP_IMPL_PROPOSED) {
            try {
                // Use StateTransitionService to accept hop implementation
                const result = await stateTransitionApi.acceptHopImplementation(hop.id);
                console.log(`Hop implementation accepted via StateTransitionService:`, result);

                if (result.success) {
                    // Update local state with accepted hop
                    const updatedHop = {
                        ...hop,
                        status: HopStatus.HOP_IMPL_READY
                    };
                    dispatch({ type: 'ACCEPT_HOP_IMPLEMENTATION_PROPOSAL', payload: updatedHop });

                    // Force mission reload to pick up state changes
                    if (state.mission?.id) {
                        await loadMission(state.mission.id);
                    }
                } else {
                    console.error('Failed to accept hop implementation:', result.message);
                }
            } catch (error) {
                console.error('Error accepting hop implementation via StateTransitionService:', error);
                // Still update frontend state if backend fails
                dispatch({ type: 'ACCEPT_HOP_IMPLEMENTATION_PROPOSAL', payload: hop });
            }
        } else {
            console.warn('Hop is not in HOP_IMPL_PROPOSED status, cannot accept');
        }
    }, [state.mission?.id, loadMission]);

    const acceptHopImplementationAsComplete = useCallback((hop: Hop) => {
        dispatch({ type: 'ACCEPT_HOP_IMPLEMENTATION_AS_COMPLETE', payload: hop });
    }, []);

    const failHopExecution = useCallback((hopId: string, error: string) => {
        if (hopId) {
            dispatch({ type: 'FAIL_HOP_EXECUTION', payload: { hopId, error } });
        }
    }, []);

    const startHopExecution = useCallback(async (hopId: string) => {
        if (!hopId) return;

        try {
            // Update UI to show execution starting
            dispatch({ type: 'START_HOP_EXECUTION', payload: hopId });

            // Actually execute the hop via API
            const result = await hopApi.executeHop(hopId);
            console.log(`Hop execution result:`, result);

            if (result.success) {
                // Add success message to chat
                const successMessage: ChatMessage = {
                    id: `hop_exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    chat_id: "temp",
                    role: MessageRole.SYSTEM,
                    content: `Hop executed successfully: ${result.message}. Executed ${result.executed_steps}/${result.total_steps} tool steps.`,
                    message_metadata: {},
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                addMessage(successMessage);

                // Force mission reload to get updated state
                if (state.mission?.id) {
                    await loadMission(state.mission.id);
                }
            } else {
                // Execution failed
                const errorMsg = result.errors.join(', ') || 'Unknown execution error';
                failHopExecution(hopId, errorMsg);

                // Add error message to chat
                const errorMessage: ChatMessage = {
                    id: `hop_error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    chat_id: "temp",
                    role: MessageRole.SYSTEM,
                    content: `Hop execution failed: ${errorMsg}`,
                    message_metadata: {},
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                addMessage(errorMessage);
            }
        } catch (error) {
            console.error('Error executing hop:', error);
            failHopExecution(hopId, `Execution error: ${error}`);

            // Add error message to chat
            const errorMessage: ChatMessage = {
                id: `hop_error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                chat_id: "temp",
                role: MessageRole.SYSTEM,
                content: `Hop execution failed: ${error}`,
                message_metadata: {},
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            addMessage(errorMessage);
        }
    }, [state.mission?.id, loadMission, addMessage, failHopExecution]);

    const retryHopExecution = useCallback((hopId: string) => {
        if (hopId) {
            dispatch({ type: 'RETRY_HOP_EXECUTION', payload: hopId });
        }
    }, []);

    const updateHopState = useCallback((hop: Hop, _updatedMissionOutputs: Map<string, Asset>) => {
        dispatch({ type: 'UPDATE_HOP_STATE', payload: { hop, updatedMissionOutputs: _updatedMissionOutputs } });
    }, []);

    const setError = useCallback((error: string) => {
        dispatch({ type: 'SET_ERROR', payload: error });
    }, []);

    const clearError = useCallback(() => {
        dispatch({ type: 'CLEAR_ERROR' });
    }, []);

    const executeToolStep = async (step: ToolStep, hop: Hop) => {
        try {
            // Update step status to executing in UI for immediate feedback
            dispatch({ type: 'EXECUTE_TOOL_STEP', payload: { step, hop } });

            // Execute the tool - backend handles all state management
            const result = await toolsApi.executeTool(step.id);

            if (result.success) {
                // Add success message to chat
                const successMessage: ChatMessage = {
                    id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    chat_id: "temp",
                    role: MessageRole.TOOL,
                    content: `Tool '${step.tool_id}' executed successfully`,
                    message_metadata: {},
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                addMessage(successMessage);
            } else {
                // Add error message to chat
                const errorMessage: ChatMessage = {
                    id: `tool_error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    chat_id: "temp",
                    role: MessageRole.TOOL,
                    content: `Tool '${step.tool_id}' failed: ${result.errors.join(', ')}`,
                    message_metadata: {},
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                addMessage(errorMessage);
            }

            // Reload mission state from backend to get all updates
            // Backend StateTransitionService handles asset updates, hop completion, etc.
            if (state.mission?.id) {
                await loadMission(state.mission.id);
            }

        } catch (error) {
            console.error('Error executing tool step:', error);

            // Add error message to chat
            const errorMessage: ChatMessage = {
                id: `tool_error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                chat_id: "temp",
                role: MessageRole.TOOL,
                content: `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                message_metadata: {},
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            addMessage(errorMessage);

            // Reload mission state to get current state from backend
            if (state.mission?.id) {
                await loadMission(state.mission.id);
            }
        }
    };

    const createMessage = useCallback((content: string, role: MessageRole): ChatMessage => {
        return {
            id: `${role}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            chat_id: chatId || "temp", // Use actual chatId from auth context
            role,
            content,
            message_metadata: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
    }, [chatId]);

    const processBotMessage = useCallback((data: StreamResponse) => {
        console.log("processBotMessage data", data);

        let token: string = "";

        // Check if this is an AgentResponse (has token or response_text)
        const isAgentResponse = 'token' in data || 'response_text' in data;

        if (isAgentResponse) {
            const agentData = data as AgentResponse;

            if (agentData.token) {
                console.log("agentData.token", agentData.token);
                token = agentData.token;
            }

            if (agentData.response_text) {
                console.log("agentData.response_text", agentData.response_text);
                const chatMessage = createMessage(agentData.response_text, MessageRole.ASSISTANT);
                addMessage(chatMessage);
            }
        }

        // Both AgentResponse and StatusResponse have status
        if (data.status) {
            console.log("data.status", data.status);
            const statusMessage = createMessage(data.status, MessageRole.STATUS);
            addMessage(statusMessage);
        }

        // In the new architecture, we don't process payload for collab area
        // The mission/hop state is managed directly in the backend
        return token || "";
    }, [addMessage, createMessage]);

    const sendMessage = useCallback(async (message: ChatMessage) => {

        addMessage(message);
        dispatch({ type: 'SET_PROCESSING', payload: true });
        let finalContent = '';
        let streamingContent = '';

        try {
            const filteredMessages = state.currentMessages.filter(msg =>
                msg.role !== MessageRole.STATUS && msg.role !== MessageRole.TOOL
            );

            const chatRequest: ChatRequest = {
                messages: [...filteredMessages, message],
                payload: {
                }
            };

            for await (const response of chatApi.streamMessage(chatRequest)) {
                const token = processBotMessage(response);
                if (token) {
                    streamingContent += token;
                    updateStreamingMessage(streamingContent);
                    finalContent += token;
                }
            }

            if (finalContent.length === 0) {
                finalContent = "No direct response from the bot. Check item view for more information.";
            }

        } catch (error) {
            console.error('Error streaming message:', error);
        } finally {
            updateStreamingMessage('');
            dispatch({ type: 'SET_PROCESSING', payload: false });

            // Always refresh session after agent processing to pick up new missions
            try {
                console.log('Refreshing session after agent processing...');
                await fetchActiveSession();

                // Also force mission reload if we have a current mission to pick up state changes
                if (state.mission?.id) {
                    console.log('Force reloading mission after agent processing...');
                    await loadMission(state.mission.id);
                }
            } catch (refreshError) {
                console.error('Error refreshing session:', refreshError);
            }
        }
    }, [state, addMessage, processBotMessage, updateStreamingMessage, fetchActiveSession, loadMission]);

    const createNewSession = useCallback(async () => {
        try {
            dispatch({ type: 'SET_CREATING_SESSION', payload: true });

            // Create new session (name will be auto-generated as "Session N")
            const newSessionResponse = await sessionApi.initializeSession({
                session_metadata: {
                    source: 'web_app',
                    initialized_at: new Date().toISOString()
                }
            });

            // Clear current state
            dispatch({
                type: 'SET_STATE',
                payload: {
                    currentMessages: [],
                    currentStreamingMessage: '',
                    mission: null,
                    isCreatingSession: false,
                    isProcessing: false
                }
            });

            // Switch to the new session
            switchToNewSession({
                session_id: newSessionResponse.user_session.id,
                session_name: newSessionResponse.user_session.name || "New Session",
                chat_id: newSessionResponse.chat.id,
                mission_id: newSessionResponse.user_session.mission?.id || undefined,
                session_metadata: newSessionResponse.user_session.session_metadata
            });

        } catch (error) {
            console.error('Error creating new session:', error);
            dispatch({ type: 'SET_ERROR', payload: 'Failed to create new session' });
        } finally {
            dispatch({ type: 'SET_CREATING_SESSION', payload: false });
        }
    }, [user, switchToNewSession]);

    return (
        <JamBotContext.Provider value={{
            state,
            addMessage,
            updateStreamingMessage,
            sendMessage,
            createMessage,
            acceptMissionProposal,
            acceptHopProposal,
            acceptHopImplementationProposal,
            acceptHopImplementationAsComplete,
            startHopExecution,
            failHopExecution,
            retryHopExecution,
            updateHopState,
            setState,
            executeToolStep,
            setError,
            clearError,
            createNewSession
        }}>
            {children}
        </JamBotContext.Provider>
    );
};