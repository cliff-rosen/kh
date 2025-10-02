import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { researchStreamApi, handleApiError, StreamChatRequest } from '../lib/api';
import {
    StreamChatMessage,
    PartialStreamConfig,
    StreamCreationStep
} from '../types/stream-chat';
import { ResearchStream } from '../types';

interface StreamChatContextType {
    // State
    messages: StreamChatMessage[];
    streamConfig: PartialStreamConfig;
    currentStep: StreamCreationStep;
    isLoading: boolean;
    error: string | null;
    statusMessage: string | null;
    responseMode: 'QUESTION' | 'SUGGESTION' | null;
    targetField: string | null;

    // Actions
    streamChatMessage: (content: string) => Promise<void>;
    handleSelectSuggestion: (value: string) => void;
    handleToggleOption: (value: string) => void;
    handleSelectAllOptions: () => void;
    handleDeselectAllOptions: () => void;
    handleUpdateField: (fieldName: string, value: any) => void;
    createStream: (config: PartialStreamConfig) => Promise<ResearchStream | null>;
    resetChat: () => void;
    clearError: () => void;
}

const StreamChatContext = createContext<StreamChatContextType | undefined>(undefined);

interface StreamChatProviderProps {
    children: ReactNode;
}

export function StreamChatProvider({ children }: StreamChatProviderProps) {
    const [messages, setMessages] = useState<StreamChatMessage[]>([
        {
            role: 'assistant',
            content: "Hi! I'm here to help you create a research stream. Let's start with the basics.\n\nWhat area of business or research are you focused on? For example, you might say 'cardiovascular therapeutics' or 'oncology drug development'.",
            timestamp: new Date().toISOString()
        }
    ]);
    const [streamConfig, setStreamConfig] = useState<PartialStreamConfig>({});
    const [currentStep, setCurrentStep] = useState<StreamCreationStep>('intro');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [responseMode, setResponseMode] = useState<'QUESTION' | 'SUGGESTION' | null>(null);
    const [targetField, setTargetField] = useState<string | null>(null);

    const clearError = useCallback(() => {
        setError(null);
    }, []);

    const resetChat = useCallback(() => {
        setMessages([
            {
                role: 'assistant',
                content: "Hi! I'm here to help you create a research stream. Let's start with the basics.\n\nWhat area of business or research are you focused on? For example, you might say 'cardiovascular therapeutics' or 'oncology drug development'.",
                timestamp: new Date().toISOString()
            }
        ]);
        setStreamConfig({});
        setCurrentStep('intro');
        setError(null);
        setStatusMessage(null);
    }, []);

    const streamChatMessage = useCallback(async (content: string) => {
        // Add user message
        const userMessage: StreamChatMessage = {
            role: 'user',
            content,
            timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, userMessage]);
        setIsLoading(true);
        setError(null);
        setStatusMessage(null);

        try {
            // Build conversation history (exclude the message we just added)
            const history = messages.map(msg => ({
                role: msg.role,
                content: msg.content
            }));

            // Call backend API with streaming
            const request: StreamChatRequest = {
                message: content,
                current_config: streamConfig,
                current_step: currentStep,
                conversation_history: history
            };

            let finalPayload: any = null;
            let accumulatedText = '';
            let messageStarted = false;

            // Add placeholder message
            const placeholderMessage: StreamChatMessage = {
                role: 'assistant',
                content: '',
                timestamp: new Date().toISOString()
            };
            setMessages(prev => [...prev, placeholderMessage]);

            // Helper to extract just the MESSAGE content from accumulated text
            const extractMessage = (text: string): string => {
                const messageMatch = text.match(/MESSAGE:\s*([\s\S]*?)(?=\n(?:MODE|TARGET_FIELD|EXTRACTED_DATA|SUGGESTIONS|OPTIONS):|$)/);
                if (messageMatch) {
                    return messageMatch[1].trim();
                }
                return '';
            };

            // Stream the response
            for await (const chunk of researchStreamApi.streamChatMessage(request)) {
                console.log('Received chunk:', chunk);

                // Check for complete status first (most important)
                if (chunk.status === 'complete' && chunk.payload) {
                    // Final payload with structured data
                    console.log('Got final payload:', chunk.payload);
                    finalPayload = chunk.payload;
                    setStatusMessage(null);
                } else if (chunk.status && !('token' in chunk)) {
                    // Status response (thinking, etc.) - update status message for UI display
                    setStatusMessage(chunk.status);
                } else if ('token' in chunk && chunk.token) {
                    // Accumulate tokens
                    accumulatedText += chunk.token;

                    // Extract and display just the MESSAGE portion as it arrives
                    const messageContent = extractMessage(accumulatedText);

                    if (messageContent) {
                        if (!messageStarted) {
                            messageStarted = true;
                            setStatusMessage(null);
                        }

                        // Update the placeholder message with extracted content
                        setMessages(prev => {
                            const updated = [...prev];
                            updated[updated.length - 1] = {
                                ...updated[updated.length - 1],
                                content: messageContent
                            };
                            return updated;
                        });
                    }
                }
            }

            console.log('Stream complete. Final payload:', finalPayload);

            // Update with final structured data from payload
            if (finalPayload) {
                console.log('Processing final payload...');

                // Convert suggestions array to labeled format if present
                const suggestions = finalPayload.suggestions?.map((item: string) => ({
                    label: item,
                    value: item
                }));

                // Update the existing message with final content and add suggestions/options
                setMessages(prev => {
                    const updated = [...prev];
                    updated[updated.length - 1] = {
                        ...updated[updated.length - 1],
                        content: finalPayload.message,
                        suggestions,
                        options: finalPayload.options,
                        proposedMessage: finalPayload.proposed_message
                    };
                    return updated;
                });

                // Update mode and target field for UI highlighting
                setResponseMode(finalPayload.mode || null);
                setTargetField(finalPayload.target_field || null);

                setCurrentStep(finalPayload.next_step);
                setStreamConfig(finalPayload.updated_config);
            }
        } catch (err) {
            setError(handleApiError(err));
            setStatusMessage(null);
        } finally {
            setIsLoading(false);
        }
    }, [streamConfig, currentStep]);

    const handleSelectSuggestion = useCallback((value: string) => {
        streamChatMessage(value);
    }, [streamChatMessage]);

    const handleToggleOption = useCallback((value: string) => {
        // Update options in the last message (create new objects for React to detect change)
        setMessages(prev => {
            const updated = [...prev];
            const lastMessageIndex = updated.length - 1;
            const lastMessage = updated[lastMessageIndex];

            if (lastMessage.options) {
                // Create a new message object with updated options
                updated[lastMessageIndex] = {
                    ...lastMessage,
                    options: lastMessage.options.map(opt =>
                        opt.value === value ? { ...opt, checked: !opt.checked } : opt
                    )
                };
            }
            return updated;
        });

        // Update config based on target field (from responseMode/targetField)
        if (!targetField) return;

        // Handle array fields (focus_areas, competitors)
        if (targetField === 'focus_areas' || targetField === 'competitors') {
            setStreamConfig(prev => {
                const currentArray = (prev[targetField as keyof PartialStreamConfig] as string[]) || [];
                const hasValue = currentArray.includes(value);
                return {
                    ...prev,
                    [targetField]: hasValue
                        ? currentArray.filter(v => v !== value)
                        : [...currentArray, value]
                };
            });
        }
    }, [targetField]);

    const handleSelectAllOptions = useCallback(() => {
        if (!targetField) return;

        // Update all options to checked in the last message
        setMessages(prev => {
            const updated = [...prev];
            const lastMessageIndex = updated.length - 1;
            const lastMessage = updated[lastMessageIndex];

            if (lastMessage.options) {
                const allValues = lastMessage.options.map(opt => opt.value);

                updated[lastMessageIndex] = {
                    ...lastMessage,
                    options: lastMessage.options.map(opt => ({ ...opt, checked: true }))
                };

                // Update config with all values
                if (targetField === 'focus_areas' || targetField === 'competitors') {
                    setStreamConfig(prev => ({
                        ...prev,
                        [targetField]: allValues
                    }));
                }
            }
            return updated;
        });
    }, [targetField]);

    const handleDeselectAllOptions = useCallback(() => {
        if (!targetField) return;

        // Update all options to unchecked in the last message
        setMessages(prev => {
            const updated = [...prev];
            const lastMessageIndex = updated.length - 1;
            const lastMessage = updated[lastMessageIndex];

            if (lastMessage.options) {
                updated[lastMessageIndex] = {
                    ...lastMessage,
                    options: lastMessage.options.map(opt => ({ ...opt, checked: false }))
                };

                // Clear config field
                if (targetField === 'focus_areas' || targetField === 'competitors') {
                    setStreamConfig(prev => ({
                        ...prev,
                        [targetField]: []
                    }));
                }
            }
            return updated;
        });
    }, [targetField]);

    const handleUpdateField = useCallback((fieldName: string, value: any) => {
        setStreamConfig(prev => ({
            ...prev,
            [fieldName]: value
        }));
    }, []);

    const createStream = useCallback(async (config: PartialStreamConfig): Promise<ResearchStream | null> => {
        setIsLoading(true);
        setError(null);
        try {
            const newStream = await researchStreamApi.createResearchStream({
                stream_name: config.stream_name!,
                description: config.description,
                stream_type: config.stream_type as any,
                focus_areas: config.focus_areas || [],
                competitors: config.competitors || [],
                report_frequency: config.report_frequency as any
            });
            return newStream;
        } catch (err) {
            setError(handleApiError(err));
            return null;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const value: StreamChatContextType = {
        // State
        messages,
        streamConfig,
        currentStep,
        isLoading,
        error,
        statusMessage,
        responseMode,
        targetField,

        // Actions
        streamChatMessage,
        handleSelectSuggestion,
        handleToggleOption,
        handleSelectAllOptions,
        handleDeselectAllOptions,
        handleUpdateField,
        createStream,
        resetChat,
        clearError,
    };

    return (
        <StreamChatContext.Provider value={value}>
            {children}
        </StreamChatContext.Provider>
    );
}

export function useStreamChat(): StreamChatContextType {
    const context = useContext(StreamChatContext);
    if (context === undefined) {
        throw new Error('useStreamChat must be used within a StreamChatProvider');
    }
    return context;
}
