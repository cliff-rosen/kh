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

    // Actions
    sendMessage: (content: string) => Promise<void>;
    handleSelectSuggestion: (value: string) => void;
    handleToggleOption: (value: string) => void;
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

    const sendMessage = useCallback(async (content: string) => {
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
            // Call backend API with streaming
            const request: StreamChatRequest = {
                message: content,
                current_config: streamConfig,
                current_step: currentStep
            };

            let assistantMessageContent = '';
            let finalPayload: any = null;

            // Add a placeholder assistant message for streaming
            const placeholderMessage: StreamChatMessage = {
                role: 'assistant',
                content: '',
                timestamp: new Date().toISOString()
            };
            setMessages(prev => [...prev, placeholderMessage]);

            // Stream the response
            for await (const chunk of researchStreamApi.streamChatMessage(request)) {
                if ('status' in chunk && chunk.status && !('token' in chunk)) {
                    // Status response - update status message for UI display
                    setStatusMessage(chunk.status);
                } else if ('token' in chunk && chunk.token) {
                    // Token response - accumulate message
                    assistantMessageContent += chunk.token;
                    // Clear status message when we start receiving content
                    setStatusMessage(null);
                    // Update the last message with accumulated content
                    setMessages(prev => {
                        const updated = [...prev];
                        updated[updated.length - 1] = {
                            ...updated[updated.length - 1],
                            content: assistantMessageContent
                        };
                        return updated;
                    });
                } else if ('payload' in chunk && chunk.payload && chunk.status === 'complete') {
                    // Final payload with structured data
                    finalPayload = chunk.payload;
                    setStatusMessage(null);
                }
            }

            // Update with final structured data from payload
            if (finalPayload) {
                const suggestions = finalPayload.suggestions?.therapeutic_areas?.map((area: string) => ({
                    label: area,
                    value: area
                })) || finalPayload.suggestions?.companies?.map((company: string) => ({
                    label: company,
                    value: company
                }));

                setMessages(prev => {
                    const updated = [...prev];
                    updated[updated.length - 1] = {
                        ...updated[updated.length - 1],
                        content: finalPayload.message,
                        suggestions,
                        options: finalPayload.options
                    };
                    return updated;
                });

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
        sendMessage(value);
    }, [sendMessage]);

    const handleToggleOption = useCallback((value: string) => {
        // Update options in the last message
        setMessages(prev => {
            const updated = [...prev];
            const lastMessage = updated[updated.length - 1];
            if (lastMessage.options) {
                lastMessage.options = lastMessage.options.map(opt =>
                    opt.value === value ? { ...opt, checked: !opt.checked } : opt
                );
            }
            return updated;
        });

        // Update config based on current step
        if (currentStep === 'focus') {
            setStreamConfig(prev => {
                const areas = prev.focus_areas || [];
                const hasArea = areas.includes(value);
                return {
                    ...prev,
                    focus_areas: hasArea
                        ? areas.filter(a => a !== value)
                        : [...areas, value]
                };
            });
        } else if (currentStep === 'competitors') {
            setStreamConfig(prev => {
                const companies = prev.competitors || [];
                const hasCompany = companies.includes(value);
                return {
                    ...prev,
                    competitors: hasCompany
                        ? companies.filter(c => c !== value)
                        : [...companies, value]
                };
            });
        }
    }, [currentStep]);

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

        // Actions
        sendMessage,
        handleSelectSuggestion,
        handleToggleOption,
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
