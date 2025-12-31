import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { generalChatApi, ToolProgressEvent } from '../lib/api/generalChatApi';
import { conversationApi } from '../lib/api/conversationApi';
import {
    GeneralChatMessage,
    InteractionType,
    ActionMetadata
} from '../types/chat';

export interface ActiveToolProgress {
    toolName: string;
    updates: ToolProgressEvent[];
}

interface GeneralChatContextType {
    // Chat state
    messages: GeneralChatMessage[];
    context: Record<string, any>;
    isLoading: boolean;
    error: string | null;
    streamingText: string;
    statusText: string | null;
    activeToolProgress: ActiveToolProgress | null;
    conversationId: number | null;
    // Chat actions
    sendMessage: (content: string, interactionType?: InteractionType, actionMetadata?: ActionMetadata) => Promise<void>;
    cancelRequest: () => void;
    updateContext: (updates: Record<string, any>) => void;
    reset: () => void;
    loadConversation: (id: number) => Promise<boolean>;
    loadMostRecent: () => Promise<boolean>;
}

const GeneralChatContext = createContext<GeneralChatContextType | null>(null);

export function GeneralChatProvider({ children }: { children: React.ReactNode }) {
    const [messages, setMessages] = useState<GeneralChatMessage[]>([]);
    const [context, setContext] = useState<Record<string, any>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [streamingText, setStreamingText] = useState('');
    const [statusText, setStatusText] = useState<string | null>(null);
    const [conversationId, setConversationId] = useState<number | null>(null);
    const [activeToolProgress, setActiveToolProgress] = useState<ActiveToolProgress | null>(null);

    const abortControllerRef = useRef<AbortController | null>(null);

    const sendMessage = useCallback(async (
        content: string,
        interactionType: InteractionType = InteractionType.TEXT_INPUT,
        actionMetadata?: ActionMetadata
    ) => {
        const userMessage: GeneralChatMessage = {
            role: 'user',
            content,
            timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, userMessage]);

        setIsLoading(true);
        setError(null);
        setStreamingText('');
        setStatusText(null);
        setActiveToolProgress(null);

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        let collectedText = '';

        try {
            for await (const event of generalChatApi.streamMessage({
                message: content,
                context,
                interaction_type: interactionType,
                action_metadata: actionMetadata,
                conversation_history: messages.map(msg => ({
                    role: msg.role,
                    content: msg.content,
                    timestamp: msg.timestamp
                })),
                conversation_id: conversationId
            }, abortController.signal)) {
                switch (event.type) {
                    case 'text_delta':
                        setStatusText(null);
                        collectedText += event.text;
                        setStreamingText(collectedText);
                        break;

                    case 'status':
                        setStatusText(event.message);
                        break;

                    case 'tool_start':
                        setStatusText(`Running ${event.tool.replace(/_/g, ' ')}...`);
                        setActiveToolProgress({ toolName: event.tool, updates: [] });
                        break;

                    case 'tool_progress':
                        setActiveToolProgress(prev => {
                            if (prev && prev.toolName === event.tool) {
                                return { ...prev, updates: [...prev.updates, event] };
                            }
                            return { toolName: event.tool, updates: [event] };
                        });
                        break;

                    case 'tool_complete':
                        setActiveToolProgress(null);
                        setStatusText(null);
                        break;

                    case 'complete': {
                        const responsePayload = event.payload;

                        const assistantMessage: GeneralChatMessage = {
                            role: 'assistant',
                            content: responsePayload.message,
                            timestamp: new Date().toISOString(),
                            suggested_values: responsePayload.suggested_values,
                            suggested_actions: responsePayload.suggested_actions,
                            custom_payload: responsePayload.custom_payload,
                            tool_history: responsePayload.tool_history
                        };
                        setMessages(prev => [...prev, assistantMessage]);
                        setStreamingText('');
                        setStatusText(null);

                        if (responsePayload.conversation_id) {
                            setConversationId(responsePayload.conversation_id);
                        }
                        break;
                    }

                    case 'error':
                        setError(event.message);
                        const errorMessage: GeneralChatMessage = {
                            role: 'assistant',
                            content: `**Error:** ${event.message}\n\nPlease try again or check your API configuration.`,
                            timestamp: new Date().toISOString()
                        };
                        setMessages(prev => [...prev, errorMessage]);
                        setStreamingText('');
                        setStatusText(null);
                        setActiveToolProgress(null);
                        break;

                    case 'cancelled':
                        setStatusText('Cancelled');
                        break;
                }
            }

        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                if (collectedText) {
                    const cancelledMessage: GeneralChatMessage = {
                        role: 'assistant',
                        content: collectedText + '\n\n*[Response cancelled]*',
                        timestamp: new Date().toISOString()
                    };
                    setMessages(prev => [...prev, cancelledMessage]);
                }
                setStreamingText('');
                setStatusText(null);
                setActiveToolProgress(null);
                return;
            }

            const errorMessage = err instanceof Error ? err.message : 'An error occurred';
            setError(errorMessage);

            const errorMsg: GeneralChatMessage = {
                role: 'assistant',
                content: 'Sorry, something went wrong. Please try again.',
                timestamp: new Date().toISOString()
            };
            setMessages(prev => [...prev, errorMsg]);
            setStreamingText('');
        } finally {
            setIsLoading(false);
            abortControllerRef.current = null;
        }
    }, [context, messages, conversationId]);

    const cancelRequest = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
    }, []);

    const updateContext = useCallback((updates: Record<string, any>) => {
        setContext(prev => ({ ...prev, ...updates }));
    }, []);

    const reset = useCallback(() => {
        setMessages([]);
        setError(null);
        setConversationId(null);
    }, []);

    const loadConversation = useCallback(async (id: number) => {
        try {
            const conversation = await conversationApi.getConversation(id);
            const loadedMessages: GeneralChatMessage[] = conversation.messages
                .filter(msg => msg.role === 'user' || msg.role === 'assistant')
                .map(msg => ({
                    role: msg.role as 'user' | 'assistant',
                    content: msg.content,
                    timestamp: msg.created_at
                }));
            setMessages(loadedMessages);
            setConversationId(id);
            setError(null);
            return true;
        } catch (err) {
            console.error('Failed to load conversation:', err);
            return false;
        }
    }, []);

    const loadMostRecent = useCallback(async () => {
        try {
            const { conversations } = await conversationApi.listConversations(1, 0);
            if (conversations.length > 0) {
                return await loadConversation(conversations[0].id);
            }
            return false;
        } catch (err) {
            console.error('Failed to load most recent conversation:', err);
            return false;
        }
    }, [loadConversation]);

    return (
        <GeneralChatContext.Provider value={{
            messages,
            context,
            isLoading,
            error,
            streamingText,
            statusText,
            activeToolProgress,
            conversationId,
            sendMessage,
            cancelRequest,
            updateContext,
            reset,
            loadConversation,
            loadMostRecent
        }}>
            {children}
        </GeneralChatContext.Provider>
    );
}

export function useGeneralChatContext() {
    const context = useContext(GeneralChatContext);
    if (!context) {
        throw new Error('useGeneralChatContext must be used within a GeneralChatProvider');
    }
    return context;
}
