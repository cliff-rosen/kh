import { useState, useCallback } from 'react';
import { generalChatApi } from '../lib/api/generalChatApi';
import {
    GeneralChatMessage,
    InteractionType,
    ActionMetadata
} from '../types/chat';

export function useGeneralChat(initialContext?: Record<string, any>) {
    const [messages, setMessages] = useState<GeneralChatMessage[]>([]);
    const [context, setContext] = useState(initialContext || {});
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [streamingText, setStreamingText] = useState('');

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

        try {
            // Stream the response
            let collectedText = '';

            for await (const chunk of generalChatApi.streamMessage({
                message: content,
                context,
                interaction_type: interactionType,
                action_metadata: actionMetadata,
                conversation_history: messages.map(msg => ({
                    role: msg.role,
                    content: msg.content,
                    timestamp: msg.timestamp
                }))
            })) {
                if (chunk.error) {
                    setError(chunk.error);
                    break;
                }

                // Handle token streaming
                if (chunk.token) {
                    collectedText += chunk.token;
                    setStreamingText(collectedText);
                }

                // Handle final payload
                if (chunk.payload && chunk.status === 'complete') {
                    const assistantMessage: GeneralChatMessage = {
                        role: 'assistant',
                        content: chunk.payload.message,
                        timestamp: new Date().toISOString(),
                        suggested_values: chunk.payload.suggested_values,
                        suggested_actions: chunk.payload.suggested_actions,
                        payload: chunk.payload.payload
                    };
                    setMessages(prev => [...prev, assistantMessage]);
                    setStreamingText('');
                }
            }

        } catch (err) {
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
        }
    }, [context, messages]);

    const updateContext = useCallback((updates: Record<string, any>) => {
        setContext(prev => ({ ...prev, ...updates }));
    }, []);

    const reset = useCallback(() => {
        setMessages([]);
        setContext(initialContext || {});
        setError(null);
    }, [initialContext]);

    return {
        messages,
        context,
        isLoading,
        error,
        streamingText,
        sendMessage,
        updateContext,
        reset
    };
}
