import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
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

                // Suggestions are already in {label, value} format from backend
                // Update the existing message with final content and add suggestions/options
                setMessages(prev => {
                    const updated = [...prev];
                    updated[updated.length - 1] = {
                        ...updated[updated.length - 1],
                        content: finalPayload.message,
                        suggestions: finalPayload.suggestions,
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
        // For channels, don't update config directly - let LLM extract the channels
        // For other fields, update preview area immediately (before backend call)
        if (targetField && targetField !== 'channels') {
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

        // For channel-related fields, backend will handle the update
        // We just toggle the UI state here
    }, [targetField]);

    const selectAllOptions = useCallback(() => {
        if (!targetField) return;

        // Update all options to checked in the last message
        setMessages(prev => {
            const updated = [...prev];
            const lastMessageIndex = updated.length - 1;
            const lastMessage = updated[lastMessageIndex];

            if (lastMessage.options) {
                updated[lastMessageIndex] = {
                    ...lastMessage,
                    options: lastMessage.options.map(opt => ({ ...opt, checked: true }))
                };
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
            // Validate and convert ChannelInProgress to Channel
            if (!config.channels || config.channels.length === 0) {
                throw new Error('At least one channel is required');
            }

            // Ensure all channels are complete before creating
            const completeChannels = config.channels.map(ch => {
                if (!ch.name || !ch.focus || !ch.type || !ch.keywords || ch.keywords.length === 0) {
                    throw new Error('All channel fields are required');
                }
                return {
                    name: ch.name,
                    focus: ch.focus,
                    type: ch.type as any,
                    keywords: ch.keywords
                };
            });

            const newStream = await researchStreamApi.createResearchStream({
                stream_name: config.stream_name!,
                purpose: config.purpose!,
                channels: completeChannels,
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

    const acceptReview = useCallback(async () => {
        // User clicked "Accept & Create Stream" in REVIEW mode
        setIsLoading(true);
        setError(null);

        try {
            // Create the stream on backend
            const createdStream = await createStream(streamConfig);

            if (createdStream) {
                // Add success message to chat
                const successMessage: ChatMessage = {
                    role: 'assistant',
                    content: `✅ Stream created successfully!\n\nYour research stream "${createdStream.stream_name}" is now active and ready to monitor.\n\n[Click here to view your streams →](/streams)`,
                    timestamp: new Date().toISOString()
                };
                setMessages(prev => [...prev, successMessage]);

                // Update to complete step
                setCurrentStep('complete');
            }
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsLoading(false);
        }
    }, [streamConfig, createStream]);

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
