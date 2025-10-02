import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StreamChatInterface from '../components/StreamChatInterface';
import StreamConfigPreview from '../components/StreamConfigPreview';
import {
    StreamChatMessage,
    PartialStreamConfig,
    StreamCreationStep,
    StreamChatRequest,
    StreamChatResponse
} from '../types/stream-chat';
import { api } from '../lib/api';
import { useToast } from '../hooks/use-toast';

export default function NewStreamChatPage() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const [messages, setMessages] = useState<StreamChatMessage[]>([
        {
            role: 'assistant',
            content: "Hi! I'm here to help you create a research stream. Let's start with the basics.\n\nWhat area of business or research are you focused on? For example, you might say 'cardiovascular therapeutics' or 'oncology drug development'.",
            timestamp: new Date().toISOString()
        }
    ]);
    const [currentStep, setCurrentStep] = useState<StreamCreationStep>('intro');
    const [streamConfig, setStreamConfig] = useState<PartialStreamConfig>({});
    const [isLoading, setIsLoading] = useState(false);

    const sendMessage = async (content: string) => {
        // Add user message
        const userMessage: StreamChatMessage = {
            role: 'user',
            content,
            timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, userMessage]);
        setIsLoading(true);

        try {
            // Call backend API
            const request: StreamChatRequest = {
                message: content,
                current_config: streamConfig,
                current_step: currentStep
            };

            const response = await api.post<StreamChatResponse>('/api/research-streams/chat', request);
            const data = response.data;

            // Add assistant response
            const assistantMessage: StreamChatMessage = {
                role: 'assistant',
                content: data.message,
                timestamp: new Date().toISOString(),
                suggestions: data.suggestions?.therapeutic_areas?.map(area => ({
                    label: area,
                    value: area
                })) || data.suggestions?.companies?.map(company => ({
                    label: company,
                    value: company
                })),
                options: data.options
            };

            setMessages(prev => [...prev, assistantMessage]);
            setCurrentStep(data.next_step);
            setStreamConfig(data.updated_config);

            // If complete, create the stream
            if (data.next_step === 'complete') {
                await createStream(data.updated_config);
            }
        } catch (error) {
            console.error('Error sending message:', error);
            toast({
                title: 'Error',
                description: 'Failed to process your message. Please try again.',
                variant: 'destructive'
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelectSuggestion = (value: string) => {
        sendMessage(value);
    };

    const handleToggleOption = (value: string) => {
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
    };

    const createStream = async (config: PartialStreamConfig) => {
        try {
            const response = await api.post('/api/research-streams', {
                stream_name: config.stream_name,
                description: config.description,
                stream_type: config.stream_type,
                focus_areas: config.focus_areas || [],
                competitors: config.competitors || [],
                report_frequency: config.report_frequency
            });

            toast({
                title: 'Success!',
                description: 'Your research stream has been created.'
            });

            // Navigate to streams page
            navigate('/streams');
        } catch (error) {
            console.error('Error creating stream:', error);
            toast({
                title: 'Error',
                description: 'Failed to create research stream. Please try again.',
                variant: 'destructive'
            });
        }
    };

    return (
        <div className="w-full h-[calc(100vh-4rem)] p-6">
            <div className="mb-4">
                <button
                    onClick={() => navigate('/new-stream')}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                    ← Back to manual form
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100%-3rem)]">
                {/* Chat Interface - Left */}
                <div className="lg:col-span-2">
                    <StreamChatInterface
                        messages={messages}
                        onSendMessage={sendMessage}
                        onSelectSuggestion={handleSelectSuggestion}
                        onToggleOption={handleToggleOption}
                        isLoading={isLoading}
                    />
                </div>

                {/* Config Preview - Right */}
                <div className="lg:col-span-1">
                    <StreamConfigPreview config={streamConfig} />
                </div>
            </div>
        </div>
    );
}
