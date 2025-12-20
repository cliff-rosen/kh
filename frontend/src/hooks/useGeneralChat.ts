import { useState, useCallback, useRef } from 'react';
import { generalChatApi, ToolProgressEvent } from '../lib/api/generalChatApi';
import {
    GeneralChatMessage,
    InteractionType,
    ActionMetadata
} from '../types/chat';

export interface ActiveToolProgress {
    toolName: string;
    updates: ToolProgressEvent[];
}

interface UseGeneralChatOptions {
    initialContext?: Record<string, any>;
}

export function useGeneralChat(options: UseGeneralChatOptions = {}) {
    const { initialContext } = options;
    const [messages, setMessages] = useState<GeneralChatMessage[]>([]);
    const [context, setContext] = useState(initialContext || {});
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [streamingText, setStreamingText] = useState('');
    const [statusText, setStatusText] = useState<string | null>(null);

    // Tool progress tracking
    const [activeToolProgress, setActiveToolProgress] = useState<ActiveToolProgress | null>(null);

    // Cancellation support
    const abortControllerRef = useRef<AbortController | null>(null);

    const sendMessage = useCallback(async (
        content: string,
        interactionType: InteractionType = InteractionType.TEXT_INPUT,
        actionMetadata?: ActionMetadata
    ) => {
        // Add user message
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

        // Create new AbortController for this request
        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        // Track collected text outside try block so it's accessible in catch for cancellation
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
                }))
            }, abortController.signal)) {
                switch (event.type) {
                    case 'text_delta':
                        // Clear status when streaming text (tool status will override if needed)
                        // Don't clear activeToolProgress here - it's cleared by tool_complete
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
                        break;
                    }

                    case 'error':
                        setError(event.message);
                        // Add error as a visible message so the user knows what happened
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
            // Don't show error for intentional cancellation
            if (err instanceof Error && err.name === 'AbortError') {
                // Request was cancelled - add a note if there was streaming text
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

            // Add error message
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
    }, [context, messages]);

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
        setContext(initialContext || {});
        setError(null);
    }, [initialContext]);

    return {
        // Chat state
        messages,
        context,
        isLoading,
        error,
        streamingText,
        statusText,
        activeToolProgress,
        // Chat actions
        sendMessage,
        cancelRequest,
        updateContext,
        reset
    };
}
