import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { researchStreamApi, handleApiError, StreamBuildChatRequest } from '../lib/api';
import { ChatMessage } from '../types/stream-builder-chat';
import {
    StreamInProgress,
    StreamBuildStep,
    UserAction
} from '../types/stream-building';
import { ResearchStream } from '../types';

interface StreamChatContextType {
    // State
    messages: ChatMessage[];
    streamConfig: StreamInProgress;
    currentStep: StreamBuildStep;
    isLoading: boolean;
    error: string | null;
    statusMessage: string | null;
    responseMode: 'QUESTION' | 'SUGGESTION' | 'REVIEW' | null;
    targetField: string | null;

    // Actions
    streamChatMessage: (content: string, userAction?: UserAction) => Promise<void>;
    selectSuggestion: (value: string) => void;
    toggleOption: (value: string) => void;
    selectAllOptions: () => void;
    deselectAllOptions: () => void;
    continueWithOptions: () => void;
    acceptReview: () => Promise<void>;  // NEW - Accept and create stream
    updateField: (fieldName: string, value: any) => void;
    createStream: (config: StreamInProgress) => Promise<ResearchStream | null>;
    resetChat: () => void;
    clearError: () => void;
}

const StreamChatContext = createContext<StreamChatContextType | undefined>(undefined);

interface StreamChatProviderProps {
    children: ReactNode;
}

export function StreamChatProvider({ children }: StreamChatProviderProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            role: 'assistant',
            content: "Hi! I'm here to help you create a research stream. Let's start with the basics.\n\nWhat area of business or research are you focused on? For example, you might say 'cardiovascular therapeutics' or 'oncology drug development'.",
            timestamp: new Date().toISOString()
        }
    ]);
    const [streamConfig, setStreamConfig] = useState<StreamInProgress>({});
    const [currentStep, setCurrentStep] = useState<StreamBuildStep>('exploration');
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
        setCurrentStep('exploration');
        setError(null);
        setStatusMessage(null);
    }, []);

    const streamChatMessage = useCallback(async (content: string, userAction?: UserAction) => {
        // Add user message
        const userMessage: ChatMessage = {
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
            const request: StreamBuildChatRequest = {
                message: content,
                current_stream: streamConfig,
                current_step: currentStep,
                conversation_history: history,
                user_action: userAction || { type: 'text_input' }  // Default to text_input
            };

            let finalPayload: any = null;
            let accumulatedText = '';
            let messageStarted = false;

            // Add placeholder message
            const placeholderMessage: ChatMessage = {
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

                // Check for errors first
                if (chunk.error) {
                    console.error('Stream error:', chunk.error);
                    setError(chunk.error);
                    setStatusMessage(null);
                    setIsLoading(false);
                    return;
                }

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
                setStreamConfig(finalPayload.updated_stream);
            }
        } catch (err) {
            setError(handleApiError(err));
            setStatusMessage(null);
        } finally {
            setIsLoading(false);
        }
    }, [streamConfig, currentStep]);

    const selectSuggestion = useCallback((value: string) => {
        // Update preview area immediately (before backend call)
        if (targetField) {
            setStreamConfig(prev => ({
                ...prev,
                [targetField]: value
            }));
        }

        // Send with option_selected user action
        const userAction: UserAction = {
            type: 'option_selected',
            target_field: targetField || undefined,
            selected_value: value
        };
        streamChatMessage(value, userAction);
    }, [streamChatMessage, targetField]);

    const toggleOption = useCallback((value: string) => {
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

        // Handle array fields (business_goals, focus_areas, keywords, competitors)
        const arrayFields = ['business_goals', 'focus_areas', 'keywords', 'competitors'];
        if (arrayFields.includes(targetField)) {
            setStreamConfig(prev => {
                const currentArray = (prev[targetField as keyof StreamInProgress] as string[]) || [];
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

    const selectAllOptions = useCallback(() => {
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
                const arrayFields = ['business_goals', 'focus_areas', 'keywords', 'competitors'];
                if (arrayFields.includes(targetField)) {
                    setStreamConfig(prev => ({
                        ...prev,
                        [targetField]: allValues
                    }));
                }
            }
            return updated;
        });
    }, [targetField]);

    const deselectAllOptions = useCallback(() => {
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
                const arrayFields = ['business_goals', 'focus_areas', 'keywords', 'competitors'];
                if (arrayFields.includes(targetField)) {
                    setStreamConfig(prev => ({
                        ...prev,
                        [targetField]: []
                    }));
                }
            }
            return updated;
        });
    }, [targetField]);

    const continueWithOptions = useCallback(() => {
        if (!targetField) return;

        // Get selected values from last message
        const lastMessage = messages[messages.length - 1];
        const selectedValues = lastMessage.options
            ?.filter(opt => opt.checked)
            .map(opt => opt.value) || [];

        // Send with options_selected user action
        const userAction: UserAction = {
            type: 'options_selected',
            target_field: targetField,
            selected_values: selectedValues
        };

        // Use the proposed message or a default
        const message = lastMessage.proposedMessage || 'Continue with these selections';
        streamChatMessage(message, userAction);
    }, [messages, targetField, streamChatMessage]);

    const updateField = useCallback((fieldName: string, value: any) => {
        setStreamConfig(prev => ({
            ...prev,
            [fieldName]: value
        }));
    }, []);

    const createStream = useCallback(async (config: StreamInProgress): Promise<ResearchStream | null> => {
        setIsLoading(true);
        setError(null);
        try {
            const newStream = await researchStreamApi.createResearchStream({
                stream_name: config.stream_name!,
                description: config.description,
                stream_type: config.stream_type as any,
                focus_areas: config.focus_areas || [],
                competitors: config.competitors || [],
                report_frequency: config.report_frequency as any,
                // Phase 1 required fields
                purpose: config.purpose!,
                business_goals: config.business_goals || [],
                expected_outcomes: config.expected_outcomes!,
                keywords: config.keywords || []
            });
            return newStream;
        } catch (err) {
            setError(handleApiError(err));
            return null;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const acceptReview = useCallback(async () => {
        // User clicked "Accept & Create Stream" in REVIEW mode
        // Send accept_review action to backend, which will advance to COMPLETE
        // Then create the stream
        const userAction: UserAction = {
            type: 'accept_review'
        };

        // First, send the accept action to backend (advances to COMPLETE step)
        await streamChatMessage('Accept', userAction);

        // Now create the stream
        const createdStream = await createStream(streamConfig);

        if (createdStream) {
            // Successfully created!
            // TODO: Navigate to Phase 2 implementation workflow
            console.log('Stream created successfully:', createdStream);
        }
    }, [streamConfig, streamChatMessage, createStream]);

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
        selectSuggestion,
        toggleOption,
        selectAllOptions,
        deselectAllOptions,
        continueWithOptions,
        acceptReview,
        updateField,
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
