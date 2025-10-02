import { useState, useRef, useEffect } from 'react';
import { StreamChatMessage } from '../types/stream-chat';
import { PaperAirplaneIcon } from '@heroicons/react/24/solid';

interface StreamChatInterfaceProps {
    messages: StreamChatMessage[];
    onSendMessage: (message: string) => void;
    onSelectSuggestion: (suggestion: string) => void;
    onToggleOption: (value: string) => void;
    onSelectAllOptions?: () => void;
    onDeselectAllOptions?: () => void;
    isLoading?: boolean;
    statusMessage?: string | null;
}

export default function StreamChatInterface({
    messages,
    onSendMessage,
    onSelectSuggestion,
    onToggleOption,
    onSelectAllOptions,
    onDeselectAllOptions,
    isLoading = false,
    statusMessage = null
}: StreamChatInterfaceProps) {
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
            onSendMessage(input.trim());
            setInput('');
        }
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-gray-800 rounded-lg shadow">
            {/* Chat Header */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    AI Research Stream Assistant
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    I'll help you create a research stream through a few questions
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
                                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                                <p className="text-xs opacity-70 mt-1">
                                    {new Date(message.timestamp).toLocaleTimeString()}
                                </p>
                            </div>
                        </div>

                        {/* Suggestion Chips */}
                        {message.suggestions && message.suggestions.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3 ml-2">
                                {message.suggestions.map((suggestion, sIdx) => (
                                    <button
                                        key={sIdx}
                                        onClick={() => onSelectSuggestion(suggestion.value)}
                                        className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full text-sm hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
                                    >
                                        {suggestion.label}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Checkbox Options */}
                        {message.options && message.options.length > 0 && (
                            <div className="mt-3 ml-2">
                                {/* Select All / Deselect All */}
                                <div className="flex gap-2 mb-2">
                                    <button
                                        onClick={onSelectAllOptions}
                                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                    >
                                        Select All
                                    </button>
                                    <span className="text-xs text-gray-400">|</span>
                                    <button
                                        onClick={onDeselectAllOptions}
                                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                    >
                                        Deselect All
                                    </button>
                                </div>

                                {/* Options List */}
                                <div className="space-y-2">
                                    {message.options.map((option, oIdx) => (
                                        <label
                                            key={oIdx}
                                            className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={option.checked}
                                                onChange={() => onToggleOption(option.value)}
                                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            />
                                            <span className="text-sm text-gray-900 dark:text-white">
                                                {option.label}
                                            </span>
                                        </label>
                                    ))}
                                </div>

                                {/* Proposed Message Button */}
                                {message.proposedMessage && (
                                    <button
                                        onClick={() => onSendMessage(message.proposedMessage!)}
                                        className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                                    >
                                        {message.proposedMessage}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                ))}

                {isLoading && statusMessage && (
                    <div className="flex justify-start">
                        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg px-4 py-2 border border-blue-200 dark:border-blue-800">
                            <div className="flex items-center gap-2">
                                <div className="animate-pulse flex gap-1">
                                    <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                                    <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                                    <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                                </div>
                                <span className="text-sm text-blue-700 dark:text-blue-300">
                                    {statusMessage}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {isLoading && !statusMessage && (
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
