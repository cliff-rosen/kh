import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CreateStreamPage from './CreateStreamPage';
import { ChatBubbleLeftRightIcon, DocumentTextIcon } from '@heroicons/react/24/outline';

export default function NewStreamPage() {
    const navigate = useNavigate();
    const [showMethodChoice, setShowMethodChoice] = useState(true);

    return (
        <div className="max-w-4xl mx-auto p-6">
            {showMethodChoice ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
                        Create New Research Stream
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mb-8">
                        Choose how you'd like to create your research stream
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* AI-Guided Interview */}
                        <button
                            onClick={() => navigate('/new-stream/chat')}
                            className="p-6 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-600 dark:hover:border-blue-500 hover:shadow-lg transition-all text-left group"
                        >
                            <ChatBubbleLeftRightIcon className="h-12 w-12 text-blue-600 dark:text-blue-400 mb-4" />
                            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                                AI-Guided Interview
                            </h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                                Have a conversation with our AI assistant to build your research stream.
                                The AI will ask questions and suggest relevant options based on your answers.
                            </p>
                            <span className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                                Recommended for first-time users →
                            </span>
                        </button>

                        {/* Manual Form */}
                        <button
                            onClick={() => setShowMethodChoice(false)}
                            className="p-6 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-600 dark:hover:border-blue-500 hover:shadow-lg transition-all text-left group"
                        >
                            <DocumentTextIcon className="h-12 w-12 text-gray-600 dark:text-gray-400 mb-4" />
                            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                                Manual Form
                            </h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                                Fill out a traditional form if you already know exactly what you want to create.
                                Faster if you have all the details ready.
                            </p>
                            <span className="text-sm text-gray-600 dark:text-gray-400 font-medium group-hover:text-blue-600 dark:group-hover:text-blue-400">
                                For experienced users →
                            </span>
                        </button>
                    </div>
                </div>
            ) : (
                <div>
                    <button
                        onClick={() => setShowMethodChoice(true)}
                        className="mb-4 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                        ← Back to options
                    </button>
                    <CreateStreamPage />
                </div>
            )}
        </div>
    );
}
