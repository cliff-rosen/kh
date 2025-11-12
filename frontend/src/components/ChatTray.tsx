import { useState, useRef, useEffect } from 'react';
import { XMarkIcon, ChatBubbleLeftRightIcon, PaperAirplaneIcon } from '@heroicons/react/24/solid';
import { useGeneralChat } from '../hooks/useGeneralChat';
import { InteractionType } from '../types/chat';

interface ChatTrayProps {
    initialContext?: Record<string, any>;
}

export default function ChatTray({ initialContext }: ChatTrayProps) {
    const [isOpen, setIsOpen] = useState(false);
    const { messages, sendMessage, isLoading, streamingText } = useGeneralChat(initialContext);
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, streamingText]);

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
            if (action.action === 'close') {
                setIsOpen(false);
            }
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
        <>
            {/* Toggle Button - Fixed position in bottom-left */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="fixed bottom-6 left-6 z-50 p-4 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-all hover:scale-110"
                    aria-label="Open chat"
                >
                    <ChatBubbleLeftRightIcon className="h-6 w-6" />
                </button>
            )}

            {/* Chat Tray - Slides in from left */}
            <div
                className={`fixed top-0 left-0 h-full w-96 bg-white dark:bg-gray-900 shadow-2xl transform transition-transform duration-300 ease-in-out z-50 ${isOpen ? 'translate-x-0' : '-translate-x-full'
                    }`}
            >
                <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                        <div className="flex items-center gap-2">
                            <ChatBubbleLeftRightIcon className="h-5 w-5 text-blue-600" />
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Chat Assistant
                            </h3>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                            aria-label="Close chat"
                        >
                            <XMarkIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-900">
                        {messages.length === 0 && (
                            <div className="text-center text-gray-500 dark:text-gray-400 mt-8">
                                <ChatBubbleLeftRightIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                                <p className="text-sm">Ask me anything about the application</p>
                            </div>
                        )}

                        {messages.map((message, idx) => (
                            <div key={idx}>
                                <div
                                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'
                                        }`}
                                >
                                    <div
                                        className={`max-w-[85%] rounded-lg px-4 py-2 ${message.role === 'user'
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow'
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
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {message.suggested_values.map((suggestion, sIdx) => (
                                            <button
                                                key={sIdx}
                                                onClick={() => handleValueSelect(suggestion.value)}
                                                disabled={isLoading}
                                                className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full text-xs hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {suggestion.label}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* Suggested Actions */}
                                {message.suggested_actions && message.suggested_actions.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {message.suggested_actions.map((action, aIdx) => (
                                            <button
                                                key={aIdx}
                                                onClick={() => handleActionClick(action)}
                                                disabled={isLoading}
                                                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${action.style === 'primary'
                                                    ? 'bg-green-600 hover:bg-green-700 text-white'
                                                    : action.style === 'warning'
                                                        ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                                                        : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white'
                                                    }`}
                                            >
                                                {action.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* Streaming message */}
                        {streamingText && (
                            <div className="flex justify-start">
                                <div className="max-w-[85%] rounded-lg px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow">
                                    <div className="text-sm whitespace-pre-wrap">{streamingText}</div>
                                    <div className="flex items-center gap-1 mt-1">
                                        <div className="animate-pulse flex gap-1">
                                            <div className="w-1 h-1 bg-blue-600 rounded-full"></div>
                                            <div className="w-1 h-1 bg-blue-600 rounded-full"></div>
                                            <div className="w-1 h-1 bg-blue-600 rounded-full"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {isLoading && !streamingText && (
                            <div className="flex justify-start">
                                <div className="bg-white dark:bg-gray-800 rounded-lg px-4 py-2 shadow">
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
                    <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                        <form onSubmit={handleSubmit} className="flex gap-2">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Type your message..."
                                disabled={isLoading}
                                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                            />
                            <button
                                type="submit"
                                disabled={!input.trim() || isLoading}
                                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <PaperAirplaneIcon className="h-4 w-4" />
                            </button>
                        </form>
                    </div>
                </div>
            </div>

            {/* Overlay when open */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-25 z-40"
                    onClick={() => setIsOpen(false)}
                />
            )}
        </>
    );
}
