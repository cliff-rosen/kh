import { useState, useRef, useEffect } from 'react';
import { PaperAirplaneIcon } from '@heroicons/react/24/solid';
import { useGeneralChat } from '../hooks/useGeneralChat';
import { InteractionType } from '../types/chat';

interface GeneralChatInterfaceProps {
    initialContext?: Record<string, any>;
    className?: string;
}

export default function GeneralChatInterface({
    initialContext,
    className = ''
}: GeneralChatInterfaceProps) {
    const { messages, sendMessage, isLoading } = useGeneralChat(initialContext);
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (input.trim() && !isLoading) {
            sendMessage(input.trim(), InteractionType.TEXT_INPUT);
            setInput('');
        }
    };

    const handleValueSelect = (value: string) => {
        sendMessage(value, InteractionType.VALUE_SELECTED);
    };

    const handleActionClick = async (action: any) => {
        if (action.handler === 'client') {
            // For now, just log client actions
            console.log('Client action:', action);
        } else {
            // Send server action
            await sendMessage(
                action.label,
                InteractionType.ACTION_EXECUTED,
                {
                    action_identifier: action.action,
                    action_data: action.data
                }
            );
        }
    };

    return (
        <div className={`flex flex-col h-full bg-white dark:bg-gray-800 rounded-lg shadow ${className}`}>
            {/* Chat Header */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Chat Assistant
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Ask me anything about the application
                </p>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((message, idx) => (
                    <div key={idx}>
                        <div
                            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'
                                }`}
                        >
                            <div
                                className={`max-w-[80%] rounded-lg px-4 py-2 ${message.role === 'user'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
                                    }`}
                            >
                                <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                                <p className="text-xs opacity-70 mt-1">
                                    {new Date(message.timestamp).toLocaleTimeString()}
                                </p>
                            </div>
                        </div>

                        {/* Suggested Values */}
                        {message.suggested_values && message.suggested_values.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3 ml-2">
                                {message.suggested_values.map((suggestion, sIdx) => (
                                    <button
                                        key={sIdx}
                                        onClick={() => handleValueSelect(suggestion.value)}
                                        disabled={isLoading}
                                        className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full text-sm hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {suggestion.label}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Suggested Actions */}
                        {message.suggested_actions && message.suggested_actions.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3 ml-2">
                                {message.suggested_actions.map((action, aIdx) => (
                                    <button
                                        key={aIdx}
                                        onClick={() => handleActionClick(action)}
                                        disabled={isLoading}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${action.style === 'primary'
                                            ? 'bg-green-600 hover:bg-green-700 text-white'
                                            : action.style === 'warning'
                                                ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                                                : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-900 dark:text-white'
                                            }`}
                                    >
                                        {action.label}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Custom Payload Display (basic for now) */}
                        {message.custom_payload && (
                            <div className="mt-3 ml-2 p-3 bg-gray-50 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600">
                                <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                                    Payload: {message.custom_payload.type}
                                </div>
                                <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto">
                                    {JSON.stringify(message.custom_payload.data, null, 2)}
                                </pre>
                            </div>
                        )}
                    </div>
                ))}

                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-gray-100 dark:bg-gray-700 rounded-lg px-4 py-2">
                            <div className="flex items-center gap-2">
                                <div className="animate-pulse flex gap-1">
                                    <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                                    <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                                    <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                                </div>
                                <span className="text-sm text-gray-600 dark:text-gray-400">
                                    Thinking...
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                <form onSubmit={handleSubmit} className="flex gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Type your message..."
                        disabled={isLoading}
                        className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || isLoading}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <PaperAirplaneIcon className="h-5 w-5" />
                    </button>
                </form>
            </div>
        </div>
    );
}
