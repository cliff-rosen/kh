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
        streamConfig,
        currentStep,
        error,
        responseMode,
        targetField,
        updateField,
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
        <div className="fixed inset-0 top-16 flex flex-col">
            {/* Back button - Fixed at top */}
            <div className="px-6 pt-6 pb-4 flex-shrink-0">
                <button
                    onClick={() => navigate('/new-stream')}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                    ← Back to manual form
                </button>
            </div>

            {/* Main content - Two columns */}
            <div className="flex-1 px-6 pb-6 min-h-0">
                <div className="h-full grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Chat Interface - Left - Scrolls internally */}
                    <div className="lg:col-span-2 min-h-0">
                        <StreamChatInterface />
                    </div>

                    {/* Config Preview - Right - Fixed, no scroll */}
                    <div className="lg:col-span-1 min-h-0">
                        <StreamConfigPreview
                            config={streamConfig}
                            highlightedField={responseMode === 'SUGGESTION' ? targetField : null}
                            onUpdateField={updateField}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
