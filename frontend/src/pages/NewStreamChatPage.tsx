import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import StreamChatInterface from '../components/StreamChatInterface';
import StreamConfigPreview from '../components/StreamConfigPreview';
import { useStreamChat } from '../context/StreamChatContext';
import { useToast } from '../components/ui/use-toast';

export default function NewStreamChatPage() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const {
        messages,
        streamConfig,
        currentStep,
        isLoading,
        error,
        statusMessage,
        responseMode,
        targetField,
        streamChatMessage,
        handleSelectSuggestion,
        handleToggleOption,
        handleSelectAllOptions,
        handleDeselectAllOptions,
        handleUpdateField,
        createStream,
        clearError
    } = useStreamChat();

    // Handle completion and navigation
    useEffect(() => {
        const handleCompletion = async () => {
            if (currentStep === 'complete' && streamConfig.stream_name) {
                const newStream = await createStream(streamConfig);
                if (newStream) {
                    toast({
                        title: 'Success!',
                        description: 'Your research stream has been created.'
                    });
                    navigate('/streams');
                }
            }
        };

        handleCompletion();
    }, [currentStep, streamConfig, createStream, toast, navigate]);

    // Show errors from context
    useEffect(() => {
        if (error) {
            toast({
                title: 'Error',
                description: error,
                variant: 'destructive'
            });
            clearError();
        }
    }, [error, toast, clearError]);

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
                        onSendMessage={streamChatMessage}
                        onSelectSuggestion={handleSelectSuggestion}
                        onToggleOption={handleToggleOption}
                        onSelectAllOptions={handleSelectAllOptions}
                        onDeselectAllOptions={handleDeselectAllOptions}
                        isLoading={isLoading}
                        statusMessage={statusMessage}
                    />
                </div>

                {/* Config Preview - Right */}
                <div className="lg:col-span-1">
                    <StreamConfigPreview
                        config={streamConfig}
                        highlightedField={responseMode === 'SUGGESTION' ? targetField : null}
                        onUpdateField={handleUpdateField}
                    />
                </div>
            </div>
        </div>
    );
}
