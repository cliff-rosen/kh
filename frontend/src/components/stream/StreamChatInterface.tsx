import { useState, useRef, useEffect } from 'react';
import { PaperAirplaneIcon } from '@heroicons/react/24/solid';
import { useStreamChat } from '../../context/StreamChatContext';
import { Link } from 'react-router-dom';

export default function StreamChatInterface() {
    const {
        messages,
        streamChatMessage,
        selectSuggestion,
        toggleOption,
        selectAllOptions,
        deselectAllOptions,
        continueWithOptions,
        acceptReview,
        isLoading,
        statusMessage,
        responseMode,
        currentStep
    } = useStreamChat();
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Parse channels from markdown text
    const parseChannels = (content: string) => {
        const channels: Array<{
            name: string;
            focus: string;
            type: string;
            keywords: string;
        }> = [];

        const lines = content.split('\n');
        let currentChannel: any = null;

        for (const line of lines) {
            // Check for channel header: **Channel N: Name**
            const headerMatch = line.match(/^\*\*Channel\s+\d+:\s*(.+?)\*\*$/);
            if (headerMatch) {
                if (currentChannel) {
                    channels.push(currentChannel);
                }
                currentChannel = { name: headerMatch[1], focus: '', type: '', keywords: '' };
                continue;
            }

            // Parse channel details
            if (currentChannel) {
                const focusMatch = line.match(/^\s*-\s*Focus:\s*(.+)$/);
                const typeMatch = line.match(/^\s*-\s*Type:\s*(.+)$/);
                const keywordsMatch = line.match(/^\s*-\s*Keywords:\s*(.+)$/);

                if (focusMatch) currentChannel.focus = focusMatch[1];
                if (typeMatch) currentChannel.type = typeMatch[1];
                if (keywordsMatch) currentChannel.keywords = keywordsMatch[1];
            }
        }

        if (currentChannel) {
            channels.push(currentChannel);
        }

        return channels.length > 0 ? channels : null;
    };

    // Helper to render message content with markdown formatting
    const renderMessageContent = (content: string) => {
        // Check if this is a channel proposal
        const channels = parseChannels(content);
        if (channels) {
            return (
                <div className="space-y-3">
                    <div className="text-gray-900 dark:text-white mb-3">
                        Here are the proposed channels for your research stream:
                    </div>
                    {channels.map((channel, idx) => (
                        <div
                            key={idx}
                            className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-700/50"
                        >
                            <div className="flex items-start justify-between mb-2">
                                <h3 className="font-bold text-gray-900 dark:text-white">
                                    {channel.name}
                                </h3>
                                <span className="px-2 py-1 text-xs font-medium rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                                    {channel.type}
                                </span>
                            </div>
                            <div className="mt-2 space-y-2">
                                <div className="text-sm text-gray-700 dark:text-gray-300">
                                    {channel.focus}
                                </div>
                                <div className="text-xs text-gray-600 dark:text-gray-400">
                                    <span className="font-semibold">Keywords:</span> {channel.keywords}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            );
        }

        // Otherwise, render as regular markdown
        const lines = content.split('\n');
        const elements: JSX.Element[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Skip empty lines
            if (line.trim() === '') {
                elements.push(<br key={`br-${i}`} />);
                continue;
            }

            // Check for bold text with ** prefix
            if (line.match(/^\*\*(.+?)\*\*/)) {
                const boldMatch = line.match(/^\*\*(.+?)\*\*/);
                if (boldMatch) {
                    elements.push(
                        <div key={`bold-${i}`} className="font-bold text-base mt-3 mb-1">
                            {boldMatch[1]}
                        </div>
                    );
                    continue;
                }
            }

            // Check for list items with - prefix
            if (line.match(/^\s*-\s+(.+)/)) {
                const listMatch = line.match(/^\s*-\s+(.+)/);
                if (listMatch) {
                    const itemText = listMatch[1];
                    // Parse key: value format
                    const keyValueMatch = itemText.match(/^([^:]+):\s*(.+)$/);
                    if (keyValueMatch) {
                        elements.push(
                            <div key={`list-${i}`} className="ml-4 my-1">
                                <span className="font-semibold">{keyValueMatch[1]}:</span>{' '}
                                <span className="text-gray-700 dark:text-gray-300">{keyValueMatch[2]}</span>
                            </div>
                        );
                    } else {
                        elements.push(
                            <div key={`list-${i}`} className="ml-4 my-1">
                                {itemText}
                            </div>
                        );
                    }
                    continue;
                }
            }

            // Regular text with inline formatting
            const formattedLine = formatInlineMarkdown(line);
            elements.push(
                <div key={`line-${i}`} className="my-1">
                    {formattedLine}
                </div>
            );
        }

        return <div className="space-y-1">{elements}</div>;
    };

    // Helper to format inline markdown (bold, links)
    const formatInlineMarkdown = (text: string) => {
        const parts: (string | JSX.Element)[] = [];
        let remaining = text;
        let key = 0;

        while (remaining.length > 0) {
            // Check for bold **text**
            const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
            if (boldMatch && boldMatch.index !== undefined) {
                // Add text before bold
                if (boldMatch.index > 0) {
                    parts.push(remaining.substring(0, boldMatch.index));
                }
                // Add bold text
                parts.push(
                    <strong key={`bold-${key++}`} className="font-semibold">
                        {boldMatch[1]}
                    </strong>
                );
                remaining = remaining.substring(boldMatch.index + boldMatch[0].length);
                continue;
            }

            // Check for links [text](url)
            const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);
            if (linkMatch && linkMatch.index !== undefined) {
                // Add text before link
                if (linkMatch.index > 0) {
                    parts.push(remaining.substring(0, linkMatch.index));
                }
                // Add link
                parts.push(
                    <Link
                        key={`link-${key++}`}
                        to={linkMatch[2]}
                        className="text-blue-600 dark:text-blue-400 underline hover:text-blue-700 dark:hover:text-blue-300"
                    >
                        {linkMatch[1]}
                    </Link>
                );
                remaining = remaining.substring(linkMatch.index + linkMatch[0].length);
                continue;
            }

            // No more special formatting, add remaining text
            parts.push(remaining);
            break;
        }

        return <>{parts}</>;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (input.trim() && !isLoading) {
            streamChatMessage(input.trim());
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
                                <div className="text-sm">{renderMessageContent(message.content)}</div>
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
                                        onClick={() => selectSuggestion(suggestion.value)}
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
                                        onClick={selectAllOptions}
                                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                    >
                                        Select All
                                    </button>
                                    <span className="text-xs text-gray-400">|</span>
                                    <button
                                        onClick={deselectAllOptions}
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
                                                onChange={() => toggleOption(option.value)}
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
                                        onClick={continueWithOptions}
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

                {/* Accept & Create Stream button (REVIEW mode only, before completion) */}
                {responseMode === 'REVIEW' && currentStep !== 'complete' && !isLoading && (
                    <div className="flex justify-center mt-6">
                        <button
                            onClick={acceptReview}
                            className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg shadow-lg transition-colors flex items-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                            Accept & Create Stream
                        </button>
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
