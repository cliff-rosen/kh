import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { XMarkIcon, ChatBubbleLeftRightIcon, PaperAirplaneIcon, TrashIcon } from '@heroicons/react/24/solid';
import { useGeneralChat } from '../../hooks/useGeneralChat';
import { InteractionType, PayloadHandler, ToolHistoryEntry } from '../../types/chat';
import { MarkdownRenderer } from '../common/MarkdownRenderer';
import ToolResultCard, { ToolHistoryPanel } from './ToolResultCard';
import { getPayloadHandler } from '../../lib/chat'; // Import from index to trigger payload registration

const STORAGE_KEY = 'chatTrayWidth';

interface ChatTrayProps {
    initialContext?: Record<string, any>;
    payloadHandlers?: Record<string, PayloadHandler>;
    /** Hide the chat tray completely (used when modal takes over) */
    hidden?: boolean;
    /** Controlled open state - when provided, parent controls visibility */
    isOpen?: boolean;
    /** Callback when open state changes */
    onOpenChange?: (open: boolean) => void;
    /** Default width in pixels (default: 420) */
    defaultWidth?: number;
    /** Minimum width in pixels (default: 320) */
    minWidth?: number;
    /** Maximum width in pixels (default: 600) */
    maxWidth?: number;
    /** Whether to allow resizing (default: true) */
    resizable?: boolean;
}

function getDefaultHeaderTitle(payloadType: string): string {
    const titles: Record<string, string> = {
        'schema_proposal': 'Schema Proposal',
        'presentation_categories': 'Presentation Categories',
        'stream_suggestions': 'Stream Suggestions',
        'portfolio_insights': 'Portfolio Insights',
        'quick_setup': 'Quick Setup',
        'validation_results': 'Validation Results',
        'import_suggestions': 'Import Suggestions'
    };
    return titles[payloadType] || 'Details';
}

function getDefaultHeaderIcon(payloadType: string): string {
    const icons: Record<string, string> = {
        'schema_proposal': '📋',
        'presentation_categories': '📊',
        'stream_suggestions': '💡',
        'portfolio_insights': '📊',
        'quick_setup': '🚀',
        'validation_results': '✅',
        'import_suggestions': '📥'
    };
    return icons[payloadType] || '✨';
}

/**
 * Component that renders message content with tool markers replaced by ToolResultCard.
 * Handles mixed content: markdown text + inline tool cards.
 */
function MessageContent({
    content,
    toolHistory,
    compact = true,
    onToolClick
}: {
    content: string;
    toolHistory?: ToolHistoryEntry[];
    compact?: boolean;
    onToolClick?: (tool: ToolHistoryEntry) => void;
}) {
    type ParsedPart = { type: 'text'; content: string } | { type: 'tool'; toolIndex: number };

    const parsedParts = useMemo((): ParsedPart[] => {
        if (!toolHistory || toolHistory.length === 0) {
            return [{ type: 'text', content }];
        }

        const markerPattern = /\[\[tool:(\d+)\]\]/g;
        const parts: ParsedPart[] = [];
        let lastIndex = 0;
        let match;

        while ((match = markerPattern.exec(content)) !== null) {
            if (match.index > lastIndex) {
                parts.push({ type: 'text', content: content.slice(lastIndex, match.index) });
            }
            const toolIndex = parseInt(match[1], 10);
            if (toolHistory[toolIndex]) {
                parts.push({ type: 'tool', toolIndex });
            } else {
                parts.push({ type: 'text', content: match[0] });
            }
            lastIndex = match.index + match[0].length;
        }

        if (lastIndex < content.length) {
            parts.push({ type: 'text', content: content.slice(lastIndex) });
        }

        return parts;
    }, [content, toolHistory]);

    // If no tool markers, just render markdown normally
    if (parsedParts.length === 1 && parsedParts[0].type === 'text') {
        return <MarkdownRenderer content={content} compact={compact} />;
    }

    // Render mixed content: markdown sections + tool cards
    return (
        <>
            {parsedParts.map((part, index) => {
                if (part.type === 'text') {
                    return part.content.trim() ? (
                        <MarkdownRenderer key={index} content={part.content} compact={compact} />
                    ) : null;
                }
                // It's a tool marker
                const tool = toolHistory![part.toolIndex];
                return (
                    <span key={index} className="inline-block my-1">
                        <ToolResultCard
                            tool={tool}
                            onClick={() => onToolClick?.(tool)}
                        />
                    </span>
                );
            })}
        </>
    );
}

export default function ChatTray({
    initialContext,
    payloadHandlers,
    hidden = false,
    isOpen: controlledIsOpen,
    onOpenChange,
    defaultWidth = 420,
    minWidth = 320,
    maxWidth = 600,
    resizable = true
}: ChatTrayProps) {
    const [internalIsOpen, setInternalIsOpen] = useState(false);

    // Use controlled state if provided, otherwise use internal state
    const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
    const setIsOpen = (open: boolean) => {
        if (onOpenChange) {
            onOpenChange(open);
        } else {
            setInternalIsOpen(open);
        }
    };

    // Width state with localStorage persistence
    const [width, setWidth] = useState(() => {
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = parseInt(stored, 10);
                if (!isNaN(parsed) && parsed >= minWidth && parsed <= maxWidth) {
                    return parsed;
                }
            }
        }
        return defaultWidth;
    });

    // Resize handling
    const isResizing = useRef(false);
    const resizeHandleRef = useRef<HTMLDivElement>(null);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isResizing.current = true;
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
    }, []);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing.current) return;
            const newWidth = Math.min(maxWidth, Math.max(minWidth, e.clientX));
            setWidth(newWidth);
        };

        const handleMouseUp = () => {
            if (isResizing.current) {
                isResizing.current = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                // Save to localStorage
                localStorage.setItem(STORAGE_KEY, width.toString());
            }
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [width, minWidth, maxWidth]);

    const { messages, sendMessage, isLoading, streamingText, statusText, activeToolProgress, cancelRequest, updateContext, reset } = useGeneralChat({ initialContext });
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    // Payload that's available but not yet opened by user
    const [pendingPayload, setPendingPayload] = useState<{ type: string; data: any; messageIndex: number } | null>(null);
    // Payload currently being displayed in the panel (user has clicked to view)
    const [activePayload, setActivePayload] = useState<{ type: string; data: any } | null>(null);
    // Track which message indices have had their payloads dismissed
    const [dismissedPayloads, setDismissedPayloads] = useState<Set<number>>(new Set());
    const [toolsToShow, setToolsToShow] = useState<ToolHistoryEntry[] | null>(null);

    // Update context when initialContext changes
    useEffect(() => {
        if (initialContext) {
            updateContext(initialContext);
        }
    }, [initialContext, updateContext]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, streamingText]);

    // Detect new payloads and set as pending (don't auto-open the panel)
    // Payloads come through custom_payload regardless of source (tool or LLM)
    useEffect(() => {
        const messageIndex = messages.length - 1;
        const latestMessage = messages[messageIndex];
        if (!latestMessage) return;

        // Check custom_payload - this is where all payloads arrive (from tools or LLM)
        if (latestMessage.custom_payload?.type && latestMessage.custom_payload.data) {
            const payloadType = latestMessage.custom_payload.type;

            // Check if we have a handler for this payload type (local or global)
            const hasLocalHandler = payloadHandlers && payloadHandlers[payloadType];
            const hasGlobalHandler = getPayloadHandler(payloadType);

            // Only set as pending if we have a handler and haven't dismissed this payload
            if ((hasLocalHandler || hasGlobalHandler) && !dismissedPayloads.has(messageIndex)) {
                setPendingPayload({
                    type: payloadType,
                    data: latestMessage.custom_payload.data,
                    messageIndex
                });
            }
        }
    }, [messages, payloadHandlers, dismissedPayloads]);

    // Handle opening the payload panel
    const handleOpenPayload = useCallback(() => {
        if (pendingPayload) {
            setActivePayload({
                type: pendingPayload.type,
                data: pendingPayload.data
            });
        }
    }, [pendingPayload]);

    // Handle closing/dismissing the payload panel
    const handleClosePayload = useCallback(() => {
        if (pendingPayload) {
            // Mark this payload as dismissed so it won't re-appear
            setDismissedPayloads(prev => new Set(prev).add(pendingPayload.messageIndex));
        }
        setActivePayload(null);
        setPendingPayload(null);
    }, [pendingPayload]);

    // Handle full chat reset - clears messages and all payload state
    const handleReset = useCallback(() => {
        reset();
        setPendingPayload(null);
        setActivePayload(null);
        setDismissedPayloads(new Set());
    }, [reset]);

    // Auto-focus input when tray opens
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

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
            // Handle client-side actions
            console.log('Client action:', action);

            // Execute the client action
            switch (action.action) {
                case 'close_chat':
                    setIsOpen(false);
                    break;
                // Add more client action handlers as needed
                default:
                    console.warn('Unknown client action:', action.action);
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

    // Don't render anything if hidden
    if (hidden) {
        return null;
    }

    // Inline-only mode: always renders as a flex child in a flex container
    // Width collapses to 0 when closed, expands when open
    const trayClasses = `h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex-shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out relative ${isOpen ? 'shadow-lg' : ''}`;
    const trayStyle = { width: isOpen ? `${width}px` : '0px', minWidth: isOpen ? `${minWidth}px` : '0px' };

    return (
        <>
            {/* Chat Tray - inline mode only */}
            <div className={trayClasses} style={trayStyle}>
                {/* Inner container with fixed width to prevent content collapse during transition */}
                <div className="flex flex-col h-full" style={{ width: `${width}px` }}>
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                        <div className="flex items-center gap-2">
                            <ChatBubbleLeftRightIcon className="h-5 w-5 text-blue-600" />
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Chat Assistant
                            </h3>
                        </div>
                        <div className="flex items-center gap-1">
                            {messages.length > 0 && (
                                <button
                                    onClick={handleReset}
                                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                                    aria-label="Clear chat"
                                    title="Clear chat"
                                >
                                    <TrashIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                                </button>
                            )}
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                                aria-label="Close chat"
                            >
                                <XMarkIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                            </button>
                        </div>
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
                                        <div className="text-sm">
                                            <MessageContent
                                                content={message.content}
                                                toolHistory={message.tool_history}
                                                compact
                                                onToolClick={(tool) => setToolsToShow([tool])}
                                            />
                                        </div>
                                        <p className="text-xs opacity-70 mt-1">
                                            {new Date(message.timestamp).toLocaleTimeString()}
                                        </p>
                                        {/* Tool history summary button */}
                                        {message.tool_history && message.tool_history.length > 0 && (
                                            <button
                                                onClick={() => setToolsToShow(message.tool_history!)}
                                                className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                                            >
                                                <span>View {message.tool_history.length} tool{message.tool_history.length > 1 ? 's' : ''} used</span>
                                            </button>
                                        )}
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
                                    <div className="text-sm">
                                        <MarkdownRenderer content={streamingText} compact />
                                    </div>
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

                        {/* Tool progress indicator - shown during tool execution even with streaming text */}
                        {isLoading && activeToolProgress && (
                            <div className="flex justify-start">
                                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-2">
                                    <div className="flex items-center gap-2">
                                        <div className="animate-spin h-4 w-4 border-2 border-amber-500 border-t-transparent rounded-full"></div>
                                        <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                                            {activeToolProgress.toolName.replace(/_/g, ' ')}
                                        </span>
                                        <button
                                            onClick={cancelRequest}
                                            className="ml-2 text-xs text-gray-400 hover:text-red-500 transition-colors"
                                            title="Cancel"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                    {activeToolProgress.updates.length > 0 && (
                                        <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                                            {activeToolProgress.updates[activeToolProgress.updates.length - 1]?.message}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Thinking indicator - only when no streaming text and no active tool */}
                        {isLoading && !streamingText && !activeToolProgress && (
                            <div className="flex justify-start">
                                <div className="bg-white dark:bg-gray-800 rounded-lg px-4 py-2 shadow">
                                    <div className="flex items-center gap-2">
                                        <div className="animate-pulse flex gap-1">
                                            <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                                            <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                                            <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                                        </div>
                                        <span className="text-sm text-gray-600 dark:text-gray-400">
                                            {statusText || 'Thinking...'}
                                        </span>
                                        <button
                                            onClick={cancelRequest}
                                            className="ml-2 text-xs text-gray-400 hover:text-red-500 transition-colors"
                                            title="Cancel"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Pending Payload Notification - shows when there's a payload ready to view */}
                        {pendingPayload && !activePayload && (() => {
                            const handler = payloadHandlers?.[pendingPayload.type] || getPayloadHandler(pendingPayload.type);
                            const renderOptions = handler?.renderOptions || {};
                            const headerTitle = renderOptions.headerTitle || getDefaultHeaderTitle(pendingPayload.type);
                            const headerIcon = renderOptions.headerIcon || getDefaultHeaderIcon(pendingPayload.type);

                            return (
                                <div className="mx-2 mb-2">
                                    <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="text-lg flex-shrink-0">{headerIcon}</span>
                                                <span className="text-sm font-medium text-blue-900 dark:text-blue-100 truncate">
                                                    {headerTitle} ready
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                <button
                                                    onClick={handleOpenPayload}
                                                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition-colors"
                                                >
                                                    View
                                                </button>
                                                <button
                                                    onClick={handleClosePayload}
                                                    className="p-1 hover:bg-blue-200 dark:hover:bg-blue-800 rounded transition-colors"
                                                    title="Dismiss"
                                                >
                                                    <XMarkIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                        <form onSubmit={handleSubmit} className="flex gap-2">
                            <input
                                ref={inputRef}
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

                {/* Resize Handle */}
                {resizable && isOpen && (
                    <div
                        ref={resizeHandleRef}
                        onMouseDown={handleMouseDown}
                        className="absolute top-0 right-0 w-1 h-full cursor-ew-resize hover:bg-blue-500 transition-colors group"
                        title="Drag to resize"
                    >
                        <div className="absolute top-1/2 right-0 transform -translate-y-1/2 w-4 h-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="w-1 h-6 bg-blue-500 rounded-full" />
                        </div>
                    </div>
                )}
            </div>

            {/* Floating Payload Panel - positioned next to chat tray */}
            {activePayload && (() => {
                // Check local handlers first, then fall back to global registry
                const handler = payloadHandlers?.[activePayload.type] || getPayloadHandler(activePayload.type);
                const renderOptions = handler?.renderOptions || {};
                const panelWidth = renderOptions.panelWidth || '500px';
                const headerTitle = renderOptions.headerTitle || getDefaultHeaderTitle(activePayload.type);
                const headerIcon = renderOptions.headerIcon || getDefaultHeaderIcon(activePayload.type);

                return (
                    <div
                        className="h-full bg-white dark:bg-gray-800 shadow-xl border-r border-gray-200 dark:border-gray-700 flex-shrink-0 overflow-hidden"
                        style={{ width: panelWidth }}
                    >
                        <div className="flex flex-col h-full">
                            {/* Header */}
                            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/20">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                    <span>{headerIcon}</span>
                                    {headerTitle}
                                </h3>
                                <button
                                    onClick={handleClosePayload}
                                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                                    aria-label="Close panel"
                                >
                                    <XMarkIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                                </button>
                            </div>

                            {/* Scrollable Payload Content */}
                            <div className="flex-1 overflow-y-auto p-4">
                                {handler ? (
                                    handler.render(activePayload.data, {
                                        onAccept: (data) => {
                                            if (handler.onAccept) {
                                                handler.onAccept(data);
                                            }
                                            handleClosePayload();
                                        },
                                        onReject: () => {
                                            if (handler.onReject) {
                                                handler.onReject(activePayload.data);
                                            }
                                            handleClosePayload();
                                        }
                                    })
                                ) : (
                                    <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                                        <p>No handler configured for payload type: {activePayload.type}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Tool History Panel */}
            {toolsToShow && (
                <ToolHistoryPanel
                    tools={toolsToShow}
                    onClose={() => setToolsToShow(null)}
                />
            )}
        </>
    );
}
