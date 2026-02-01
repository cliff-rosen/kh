import { useState } from 'react';
import { BugAntIcon, ChevronDownIcon, ChevronRightIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { AgentTrace, AgentIteration, ToolCall } from '../../types/chat';

interface DiagnosticsPanelProps {
    diagnostics: AgentTrace;
    onClose: () => void;
}

type TabType = 'messages' | 'config' | 'metrics';

// Fullscreen viewer for long content
function FullscreenViewer({ title, content, onClose }: { title: string; content: string; onClose: () => void }) {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 z-[60] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 bg-gray-900 border-b border-gray-700 flex-shrink-0">
                <h3 className="text-lg font-semibold text-white">{title}</h3>
                <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-white p-2"
                >
                    <XMarkIcon className="h-6 w-6" />
                </button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-6">
                <pre className="text-sm font-mono whitespace-pre-wrap text-gray-200">
                    {content}
                </pre>
            </div>
        </div>
    );
}

export function DiagnosticsPanel({ diagnostics, onClose }: DiagnosticsPanelProps) {
    const [activeTab, setActiveTab] = useState<TabType>('messages');
    const [expandedIterations, setExpandedIterations] = useState<Set<number>>(new Set([1]));
    const [expandedToolCalls, setExpandedToolCalls] = useState<Set<string>>(new Set());
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['messages']));
    const [fullscreenContent, setFullscreenContent] = useState<{ title: string; content: string } | null>(null);

    const toggleIteration = (iter: number) => {
        const next = new Set(expandedIterations);
        if (next.has(iter)) {
            next.delete(iter);
        } else {
            next.add(iter);
        }
        setExpandedIterations(next);
    };

    const toggleToolCall = (id: string) => {
        const next = new Set(expandedToolCalls);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        setExpandedToolCalls(next);
    };

    const toggleSection = (id: string) => {
        const next = new Set(expandedSections);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        setExpandedSections(next);
    };

    const tabs: { id: TabType; label: string }[] = [
        { id: 'messages', label: `Messages (${diagnostics.iterations?.length || 0} iterations)` },
        { id: 'config', label: 'Config' },
        { id: 'metrics', label: 'Metrics' },
    ];

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
            <div className="absolute inset-4 bg-white dark:bg-gray-800 shadow-xl flex flex-col rounded-lg">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-orange-50 dark:bg-orange-900/20 flex-shrink-0 rounded-t-lg">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <BugAntIcon className="h-5 w-5 text-orange-500" />
                        Agent Trace
                        <span className="text-sm font-normal text-gray-500">
                            {diagnostics.trace_id?.slice(0, 8)}
                        </span>
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none"
                    >
                        &times;
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200 dark:border-gray-700 px-6 flex-shrink-0">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px ${
                                activeTab === tab.id
                                    ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
                    {activeTab === 'messages' && (
                        <MessagesTab
                            diagnostics={diagnostics}
                            expandedIterations={expandedIterations}
                            expandedToolCalls={expandedToolCalls}
                            expandedSections={expandedSections}
                            toggleIteration={toggleIteration}
                            toggleToolCall={toggleToolCall}
                            toggleSection={toggleSection}
                            onFullscreen={setFullscreenContent}
                        />
                    )}

                    {activeTab === 'config' && (
                        <ConfigTab
                            diagnostics={diagnostics}
                            expandedSections={expandedSections}
                            toggleSection={toggleSection}
                            onFullscreen={setFullscreenContent}
                        />
                    )}

                    {activeTab === 'metrics' && (
                        <MetricsTab diagnostics={diagnostics} onFullscreen={setFullscreenContent} />
                    )}
                </div>
            </div>

            {/* Fullscreen content viewer */}
            {fullscreenContent && (
                <FullscreenViewer
                    title={fullscreenContent.title}
                    content={fullscreenContent.content}
                    onClose={() => setFullscreenContent(null)}
                />
            )}
        </div>
    );
}

// ============================================================================
// Messages Tab - Shows the full message flow per iteration
// ============================================================================

interface MessagesTabProps {
    diagnostics: AgentTrace;
    expandedIterations: Set<number>;
    expandedToolCalls: Set<string>;
    expandedSections: Set<string>;
    toggleIteration: (iter: number) => void;
    toggleToolCall: (id: string) => void;
    toggleSection: (id: string) => void;
    onFullscreen: (content: { title: string; content: string }) => void;
}

function MessagesTab({
    diagnostics,
    expandedIterations,
    expandedToolCalls,
    expandedSections,
    toggleIteration,
    toggleToolCall,
    toggleSection,
    onFullscreen,
}: MessagesTabProps) {
    if (!diagnostics.iterations || diagnostics.iterations.length === 0) {
        return <p className="text-gray-500 dark:text-gray-400">No iterations recorded</p>;
    }

    return (
        <div className="space-y-4">
            {diagnostics.iterations.map((iteration, index) => (
                <IterationCard
                    key={iteration.iteration}
                    iteration={iteration}
                    prevIteration={index > 0 ? diagnostics.iterations[index - 1] : null}
                    isExpanded={expandedIterations.has(iteration.iteration)}
                    expandedToolCalls={expandedToolCalls}
                    expandedSections={expandedSections}
                    onToggle={() => toggleIteration(iteration.iteration)}
                    onToggleToolCall={toggleToolCall}
                    onToggleSection={toggleSection}
                    onFullscreen={onFullscreen}
                />
            ))}
        </div>
    );
}

interface IterationCardProps {
    iteration: AgentIteration;
    prevIteration: AgentIteration | null;
    isExpanded: boolean;
    expandedToolCalls: Set<string>;
    expandedSections: Set<string>;
    onToggle: () => void;
    onToggleToolCall: (id: string) => void;
    onToggleSection: (id: string) => void;
    onFullscreen: (content: { title: string; content: string }) => void;
}

function IterationCard({
    iteration,
    prevIteration,
    isExpanded,
    expandedToolCalls,
    expandedSections,
    onToggle,
    onToggleToolCall,
    onToggleSection,
    onFullscreen,
}: IterationCardProps) {
    const currentMsgCount = iteration.messages_to_model?.length || 0;
    const prevMsgCount = prevIteration?.messages_to_model?.length || 0;
    const newMsgCount = prevIteration ? currentMsgCount - prevMsgCount : 0;

    const inputSectionId = `iter-${iteration.iteration}-input`;
    const responseSectionId = `iter-${iteration.iteration}-response`;

    return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            {/* Header */}
            <button
                onClick={onToggle}
                className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
                <div className="flex items-center gap-4">
                    {isExpanded ? (
                        <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                    ) : (
                        <ChevronRightIcon className="h-5 w-5 text-gray-400" />
                    )}
                    <span className="font-semibold text-gray-900 dark:text-white">
                        Iteration {iteration.iteration}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        iteration.stop_reason === 'end_turn'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : iteration.stop_reason === 'tool_use'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                            : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                    }`}>
                        {iteration.stop_reason}
                    </span>
                    {iteration.tool_calls?.length > 0 && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            {iteration.tool_calls.length} tool call{iteration.tool_calls.length !== 1 ? 's' : ''}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                    <span>{iteration.usage?.input_tokens || 0} in / {iteration.usage?.output_tokens || 0} out</span>
                    <span>{iteration.api_call_ms}ms</span>
                </div>
            </button>

            {/* Expanded Content */}
            {isExpanded && (
                <div className="p-4 space-y-4 border-t border-gray-200 dark:border-gray-700">
                    {/* Input to Model */}
                    <CollapsibleSection
                        id={inputSectionId}
                        title="Input to Model"
                        subtitle={
                            newMsgCount > 0
                                ? `${currentMsgCount} messages (+${newMsgCount} from tool exchange)`
                                : `${currentMsgCount} messages`
                        }
                        subtitleColor={newMsgCount > 0 ? 'orange' : undefined}
                        isExpanded={expandedSections.has(inputSectionId)}
                        onToggle={() => onToggleSection(inputSectionId)}
                        onFullscreen={() => onFullscreen({
                            title: `Iteration ${iteration.iteration} - Input to Model`,
                            content: JSON.stringify(iteration.messages_to_model, null, 2)
                        })}
                    >
                        <MessagesList messages={iteration.messages_to_model || []} onFullscreen={onFullscreen} />
                    </CollapsibleSection>

                    {/* Model Response */}
                    <CollapsibleSection
                        id={responseSectionId}
                        title="Model Response"
                        isExpanded={expandedSections.has(responseSectionId)}
                        onToggle={() => onToggleSection(responseSectionId)}
                        onFullscreen={() => onFullscreen({
                            title: `Iteration ${iteration.iteration} - Model Response`,
                            content: JSON.stringify(iteration.response_content, null, 2)
                        })}
                    >
                        <ExpandableContent content={JSON.stringify(iteration.response_content, null, 2)} />
                    </CollapsibleSection>

                    {/* Tool Calls */}
                    {iteration.tool_calls && iteration.tool_calls.length > 0 && (
                        <div>
                            <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Tool Calls
                            </h5>
                            <div className="space-y-2">
                                {iteration.tool_calls.map((toolCall) => (
                                    <ToolCallCard
                                        key={toolCall.tool_use_id}
                                        toolCall={toolCall}
                                        isExpanded={expandedToolCalls.has(toolCall.tool_use_id)}
                                        onToggle={() => onToggleToolCall(toolCall.tool_use_id)}
                                        onFullscreen={onFullscreen}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// Displays messages in a structured list format
function MessagesList({ messages, onFullscreen }: {
    messages: Array<Record<string, unknown>>;
    onFullscreen: (content: { title: string; content: string }) => void;
}) {
    return (
        <div className="space-y-2">
            {messages.map((msg, idx) => (
                <MessageItem key={idx} index={idx} message={msg} onFullscreen={onFullscreen} />
            ))}
        </div>
    );
}

function MessageItem({ index, message, onFullscreen }: {
    index: number;
    message: Record<string, unknown>;
    onFullscreen: (content: { title: string; content: string }) => void;
}) {
    const role = (message.role as string) || 'unknown';
    const content = message.content;
    const [isExpanded, setIsExpanded] = useState(false);

    const roleColors: Record<string, string> = {
        system: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
        user: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
        assistant: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    };

    // Analyze content type for smart preview
    const isArrayContent = Array.isArray(content);
    const contentBlocks = isArrayContent ? (content as Array<Record<string, unknown>>) : null;

    // Generate smart preview based on content type
    const getPreview = (): { text: string; badges: string[] } => {
        if (typeof content === 'string') {
            return {
                text: content.slice(0, 80) + (content.length > 80 ? '...' : ''),
                badges: []
            };
        }

        if (contentBlocks) {
            const badges: string[] = [];
            let textPreview = '';

            for (const block of contentBlocks) {
                if (block.type === 'text' && typeof block.text === 'string') {
                    if (!textPreview) textPreview = block.text.slice(0, 60);
                } else if (block.type === 'tool_use') {
                    badges.push(`tool_use:${block.name}`);
                } else if (block.type === 'tool_result') {
                    badges.push(`tool_result`);
                }
            }

            return {
                text: textPreview ? textPreview + '...' : '',
                badges
            };
        }

        return { text: JSON.stringify(content).slice(0, 60) + '...', badges: [] };
    };

    const preview = getPreview();
    const fullContentStr = typeof content === 'string' ? content : JSON.stringify(content, null, 2);

    return (
        <div className="border border-gray-200 dark:border-gray-600 rounded overflow-hidden">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center gap-3 p-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
                {isExpanded ? (
                    <ChevronDownIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                ) : (
                    <ChevronRightIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                )}
                <span className="text-xs text-gray-400 w-6">{index}</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${roleColors[role] || 'bg-gray-100 text-gray-600'}`}>
                    {role}
                </span>
                {preview.badges.map((badge, i) => (
                    <span key={i} className="px-1.5 py-0.5 rounded text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                        {badge}
                    </span>
                ))}
                <span className="text-xs text-gray-600 dark:text-gray-400 truncate flex-1">
                    {preview.text}
                </span>
            </button>
            {isExpanded && (
                <div className="p-2 border-t border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900">
                    <div className="flex justify-end mb-1">
                        <button
                            onClick={() => onFullscreen({ title: `Message ${index} (${role})`, content: fullContentStr })}
                            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            title="View fullscreen"
                        >
                            <ArrowsPointingOutIcon className="h-4 w-4" />
                        </button>
                    </div>
                    {/* Render content based on type */}
                    {typeof content === 'string' ? (
                        <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap text-gray-800 dark:text-gray-200 resize-y overflow-y-auto min-h-[3rem] max-h-64">
                            {content}
                        </pre>
                    ) : contentBlocks ? (
                        <div className="space-y-2">
                            {contentBlocks.map((block, blockIdx) => (
                                <ContentBlock key={blockIdx} block={block} />
                            ))}
                        </div>
                    ) : (
                        <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap text-gray-800 dark:text-gray-200 resize-y overflow-y-auto min-h-[3rem] max-h-64">
                            {fullContentStr}
                        </pre>
                    )}
                </div>
            )}
        </div>
    );
}

// Render a content block (text, tool_use, tool_result)
function ContentBlock({ block }: { block: Record<string, unknown> }) {
    const blockType = block.type as string;

    if (blockType === 'text') {
        return (
            <div className="bg-white dark:bg-gray-800 rounded p-2 border border-gray-200 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">text</div>
                <pre className="text-xs font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-200">
                    {block.text as string}
                </pre>
            </div>
        );
    }

    if (blockType === 'tool_use') {
        return (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded p-2 border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">tool_use</span>
                    <span className="text-xs font-mono text-blue-700 dark:text-blue-300">{block.name as string}</span>
                    <span className="text-xs text-gray-400">id: {(block.id as string)?.slice(0, 8)}...</span>
                </div>
                <pre className="text-xs font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900 rounded p-1 max-h-32 overflow-y-auto">
                    {JSON.stringify(block.input, null, 2)}
                </pre>
            </div>
        );
    }

    if (blockType === 'tool_result') {
        const isError = block.is_error === true;
        return (
            <div className={`rounded p-2 border ${
                isError
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                    : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
            }`}>
                <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-medium ${
                        isError ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                    }`}>
                        tool_result {isError && '(error)'}
                    </span>
                    <span className="text-xs text-gray-400">for: {(block.tool_use_id as string)?.slice(0, 8)}...</span>
                </div>
                <pre className="text-xs font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900 rounded p-1 max-h-32 overflow-y-auto resize-y">
                    {typeof block.content === 'string' ? block.content : JSON.stringify(block.content, null, 2)}
                </pre>
            </div>
        );
    }

    // Unknown block type - show as JSON
    return (
        <div className="bg-gray-100 dark:bg-gray-700 rounded p-2 border border-gray-200 dark:border-gray-600">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{blockType || 'unknown'}</div>
            <pre className="text-xs font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-200">
                {JSON.stringify(block, null, 2)}
            </pre>
        </div>
    );
}

// Resizable and expandable content area
function ExpandableContent({ content }: { content: string }) {
    const [isMaximized, setIsMaximized] = useState(false);

    return (
        <div className="relative">
            <div className="absolute top-2 right-2 z-10">
                <button
                    onClick={() => setIsMaximized(!isMaximized)}
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-white dark:bg-gray-800 rounded"
                    title={isMaximized ? "Collapse" : "Expand"}
                >
                    {isMaximized ? (
                        <ArrowsPointingInIcon className="h-4 w-4" />
                    ) : (
                        <ArrowsPointingOutIcon className="h-4 w-4" />
                    )}
                </button>
            </div>
            <pre className={`bg-gray-50 dark:bg-gray-900 rounded-lg p-3 text-xs font-mono overflow-x-auto text-gray-800 dark:text-gray-200 resize-y overflow-y-auto ${
                isMaximized ? 'min-h-[20rem]' : 'min-h-[3rem] max-h-64'
            }`}>
                {content}
            </pre>
        </div>
    );
}

interface CollapsibleSectionProps {
    id: string;
    title: string;
    subtitle?: string;
    subtitleColor?: 'orange';
    isExpanded: boolean;
    onToggle: () => void;
    onFullscreen?: () => void;
    children: React.ReactNode;
}

function CollapsibleSection({ title, subtitle, subtitleColor, isExpanded, onToggle, onFullscreen, children }: CollapsibleSectionProps) {
    return (
        <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
            <div className="flex items-center bg-gray-50 dark:bg-gray-700/30">
                <button
                    onClick={onToggle}
                    className="flex-1 flex items-center gap-3 p-3 text-left hover:bg-gray-100 dark:hover:bg-gray-700/50"
                >
                    {isExpanded ? (
                        <ChevronDownIcon className="h-4 w-4 text-gray-400" />
                    ) : (
                        <ChevronRightIcon className="h-4 w-4 text-gray-400" />
                    )}
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{title}</span>
                    {subtitle && (
                        <span className={`text-xs ${
                            subtitleColor === 'orange'
                                ? 'text-orange-600 dark:text-orange-400'
                                : 'text-gray-500 dark:text-gray-400'
                        }`}>
                            {subtitle}
                        </span>
                    )}
                </button>
                {onFullscreen && (
                    <button
                        onClick={onFullscreen}
                        className="p-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        title="View fullscreen"
                    >
                        <ArrowsPointingOutIcon className="h-4 w-4" />
                    </button>
                )}
            </div>
            {isExpanded && (
                <div className="p-3 border-t border-gray-200 dark:border-gray-600">
                    {children}
                </div>
            )}
        </div>
    );
}

interface ToolCallCardProps {
    toolCall: ToolCall;
    isExpanded: boolean;
    onToggle: () => void;
    onFullscreen: (content: { title: string; content: string }) => void;
}

function ToolCallCard({ toolCall, isExpanded, onToggle, onFullscreen }: ToolCallCardProps) {
    return (
        <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
            <button
                onClick={onToggle}
                className="w-full flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30"
            >
                <div className="flex items-center gap-3">
                    {isExpanded ? (
                        <ChevronDownIcon className="h-4 w-4 text-gray-400" />
                    ) : (
                        <ChevronRightIcon className="h-4 w-4 text-gray-400" />
                    )}
                    <span className="font-mono text-sm text-blue-700 dark:text-blue-300">
                        {toolCall.tool_name}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs ${
                        toolCall.output_type === 'error'
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                    }`}>
                        {toolCall.output_type}
                    </span>
                    {toolCall.payload && (
                        <span className="px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                            payload
                        </span>
                    )}
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400">{toolCall.execution_ms}ms</span>
            </button>

            {isExpanded && (
                <div className="p-3 border-t border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800">
                    {/* Tool call flow visualization */}
                    <div className="space-y-3">
                        <BoundaryBox
                            label="Tool Input"
                            sublabel="What model requested and tool received"
                            content={toolCall.tool_input}
                            onFullscreen={() => onFullscreen({
                                title: `${toolCall.tool_name} - Tool Input`,
                                content: JSON.stringify(toolCall.tool_input, null, 2)
                            })}
                        />
                        <FlowArrow label="executed" />
                        <BoundaryBox
                            label="Output from Executor"
                            sublabel="Raw tool result"
                            content={toolCall.output_from_executor}
                            isOutput
                            onFullscreen={() => onFullscreen({
                                title: `${toolCall.tool_name} - Output from Executor`,
                                content: typeof toolCall.output_from_executor === 'string'
                                    ? toolCall.output_from_executor
                                    : JSON.stringify(toolCall.output_from_executor, null, 2)
                            })}
                        />
                        <FlowArrow label="formatted" />
                        <BoundaryBox
                            label="Output to Model"
                            sublabel="What went in the message"
                            content={toolCall.output_to_model}
                            isOutput
                            onFullscreen={() => onFullscreen({
                                title: `${toolCall.tool_name} - Output to Model`,
                                content: toolCall.output_to_model
                            })}
                        />

                        {/* Payload (if present) */}
                        {toolCall.payload && (
                            <>
                                <FlowArrow label="payload" />
                                <div className="border rounded-lg overflow-hidden border-purple-200 dark:border-purple-800">
                                    <div className="flex items-center justify-between px-3 py-1.5 text-xs font-medium bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400">
                                        <div>
                                            Payload
                                            <span className="font-normal ml-2 text-gray-500 dark:text-gray-400">
                                                Data sent to frontend
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => onFullscreen({
                                                title: `${toolCall.tool_name} - Payload`,
                                                content: JSON.stringify(toolCall.payload, null, 2)
                                            })}
                                            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                            title="View fullscreen"
                                        >
                                            <ArrowsPointingOutIcon className="h-3 w-3" />
                                        </button>
                                    </div>
                                    <pre className="p-2 text-xs font-mono overflow-x-auto max-h-32 overflow-y-auto resize-y min-h-[2rem] bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200">
                                        {JSON.stringify(toolCall.payload, null, 2)}
                                    </pre>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function BoundaryBox({ label, sublabel, content, isOutput, onFullscreen }: {
    label: string;
    sublabel: string;
    content: unknown;
    isOutput?: boolean;
    onFullscreen?: () => void;
}) {
    return (
        <div className={`border rounded-lg overflow-hidden ${
            isOutput
                ? 'border-green-200 dark:border-green-800'
                : 'border-blue-200 dark:border-blue-800'
        }`}>
            <div className={`flex items-center justify-between px-3 py-1.5 text-xs font-medium ${
                isOutput
                    ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                    : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
            }`}>
                <div>
                    {label}
                    <span className="font-normal ml-2 text-gray-500 dark:text-gray-400">{sublabel}</span>
                </div>
                {onFullscreen && (
                    <button
                        onClick={onFullscreen}
                        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        title="View fullscreen"
                    >
                        <ArrowsPointingOutIcon className="h-3 w-3" />
                    </button>
                )}
            </div>
            <pre className="p-2 text-xs font-mono overflow-x-auto max-h-32 overflow-y-auto resize-y min-h-[2rem] bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200">
                {typeof content === 'string' ? content : JSON.stringify(content, null, 2)}
            </pre>
        </div>
    );
}

function FlowArrow({ label }: { label: string }) {
    return (
        <div className="flex items-center justify-center gap-2 text-gray-400">
            <div className="h-4 border-l border-dashed border-gray-300 dark:border-gray-600" />
            <span className="text-xs">↓ {label}</span>
        </div>
    );
}

// ============================================================================
// Config Tab - Model settings, system prompt, and tools
// ============================================================================

interface ConfigTabProps {
    diagnostics: AgentTrace;
    expandedSections: Set<string>;
    toggleSection: (id: string) => void;
    onFullscreen: (content: { title: string; content: string }) => void;
}

function ConfigTab({ diagnostics, expandedSections, toggleSection, onFullscreen }: ConfigTabProps) {
    const [expandedTool, setExpandedTool] = useState<string | null>(null);

    return (
        <div className="space-y-6">
            {/* Model Settings */}
            <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Model Settings</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <ConfigCard label="Model" value={diagnostics.model} />
                    <ConfigCard label="Max Tokens" value={diagnostics.max_tokens} />
                    <ConfigCard label="Temperature" value={diagnostics.temperature} />
                    <ConfigCard label="Max Iterations" value={diagnostics.max_iterations} />
                </div>
            </div>

            {/* System Prompt */}
            <CollapsibleSection
                id="system-prompt"
                title="System Prompt"
                subtitle={`${diagnostics.system_prompt?.length || 0} chars`}
                isExpanded={expandedSections.has('system-prompt')}
                onToggle={() => toggleSection('system-prompt')}
                onFullscreen={() => onFullscreen({ title: 'System Prompt', content: diagnostics.system_prompt || '' })}
            >
                <pre className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap text-gray-800 dark:text-gray-200 max-h-96 overflow-y-auto resize-y min-h-[3rem]">
                    {diagnostics.system_prompt}
                </pre>
            </CollapsibleSection>

            {/* Tools */}
            <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Tools Available ({diagnostics.tools?.length || 0})
                </h4>
                <div className="space-y-2">
                    {diagnostics.tools?.map((tool) => (
                        <div key={tool.name} className="border border-gray-200 dark:border-gray-700 rounded-lg">
                            <div className="flex items-center">
                                <button
                                    onClick={() => setExpandedTool(expandedTool === tool.name ? null : tool.name)}
                                    className="flex-1 flex items-center justify-between p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
                                >
                                    <div>
                                        <span className="font-mono text-sm text-blue-600 dark:text-blue-400">{tool.name}</span>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{tool.description}</p>
                                    </div>
                                    {expandedTool === tool.name ? (
                                        <ChevronDownIcon className="h-4 w-4 text-gray-400" />
                                    ) : (
                                        <ChevronRightIcon className="h-4 w-4 text-gray-400" />
                                    )}
                                </button>
                                <button
                                    onClick={() => onFullscreen({
                                        title: `Tool: ${tool.name}`,
                                        content: JSON.stringify(tool, null, 2)
                                    })}
                                    className="p-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                    title="View fullscreen"
                                >
                                    <ArrowsPointingOutIcon className="h-4 w-4" />
                                </button>
                            </div>
                            {expandedTool === tool.name && (
                                <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                                    <pre className="text-xs font-mono overflow-x-auto text-gray-800 dark:text-gray-200 resize-y min-h-[3rem] max-h-64 overflow-y-auto">
                                        {JSON.stringify(tool.input_schema, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>
                    ))}
                    {(!diagnostics.tools || diagnostics.tools.length === 0) && (
                        <span className="text-gray-500 dark:text-gray-400 text-sm">No tools available</span>
                    )}
                </div>
            </div>

            {/* Context */}
            {diagnostics.context && Object.keys(diagnostics.context).length > 0 && (
                <CollapsibleSection
                    id="context"
                    title="Context"
                    isExpanded={expandedSections.has('context')}
                    onToggle={() => toggleSection('context')}
                    onFullscreen={() => onFullscreen({ title: 'Context', content: JSON.stringify(diagnostics.context, null, 2) })}
                >
                    <pre className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-xs font-mono overflow-x-auto text-gray-800 dark:text-gray-200 resize-y min-h-[3rem] max-h-64 overflow-y-auto">
                        {JSON.stringify(diagnostics.context, null, 2)}
                    </pre>
                </CollapsibleSection>
            )}
        </div>
    );
}

function ConfigCard({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</div>
            <div className="font-mono text-sm text-gray-900 dark:text-white">{value}</div>
        </div>
    );
}

// ============================================================================
// Metrics Tab - Token usage, timing, and outcome
// ============================================================================

function MetricsTab({ diagnostics, onFullscreen }: {
    diagnostics: AgentTrace;
    onFullscreen: (content: { title: string; content: string }) => void;
}) {
    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Outcome</div>
                    <div className={`font-semibold text-sm ${
                        diagnostics.outcome === 'complete'
                            ? 'text-green-600 dark:text-green-400'
                            : diagnostics.outcome === 'error'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-yellow-600 dark:text-yellow-400'
                    }`}>
                        {diagnostics.outcome}
                    </div>
                </div>
                <ConfigCard label="Total Iterations" value={diagnostics.total_iterations || 0} />
                <ConfigCard label="Total Duration" value={`${diagnostics.total_duration_ms || 0}ms`} />
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Trace ID</div>
                    <div className="font-mono text-xs text-gray-900 dark:text-white truncate">
                        {diagnostics.trace_id}
                    </div>
                </div>
            </div>

            {/* Token Usage */}
            <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Token Usage</h4>
                <div className="grid grid-cols-2 gap-4 mb-4">
                    <ConfigCard label="Total Input Tokens" value={diagnostics.total_input_tokens || 0} />
                    <ConfigCard label="Total Output Tokens" value={diagnostics.total_output_tokens || 0} />
                </div>

                {/* Per-iteration breakdown */}
                {diagnostics.iterations && diagnostics.iterations.length > 1 && (
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 dark:bg-gray-700">
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Iteration</th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Input</th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Output</th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">API Time</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {diagnostics.iterations.map((iter) => (
                                    <tr key={iter.iteration} className="text-gray-900 dark:text-gray-100">
                                        <td className="px-4 py-2">{iter.iteration}</td>
                                        <td className="px-4 py-2 text-right font-mono">{iter.usage?.input_tokens || 0}</td>
                                        <td className="px-4 py-2 text-right font-mono">{iter.usage?.output_tokens || 0}</td>
                                        <td className="px-4 py-2 text-right font-mono">{iter.api_call_ms}ms</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Error Message */}
            {diagnostics.error_message && (
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-red-600 dark:text-red-400">Error Message</h4>
                        <button
                            onClick={() => onFullscreen({ title: 'Error Message', content: diagnostics.error_message || '' })}
                            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            title="View fullscreen"
                        >
                            <ArrowsPointingOutIcon className="h-4 w-4" />
                        </button>
                    </div>
                    <pre className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-xs font-mono text-red-800 dark:text-red-200 resize-y min-h-[3rem] max-h-64 overflow-y-auto">
                        {diagnostics.error_message}
                    </pre>
                </div>
            )}

            {/* Final Text */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                        Final Text ({diagnostics.final_text?.length || 0} chars)
                    </h4>
                    <button
                        onClick={() => onFullscreen({ title: 'Final Text', content: diagnostics.final_text || '' })}
                        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        title="View fullscreen"
                    >
                        <ArrowsPointingOutIcon className="h-4 w-4" />
                    </button>
                </div>
                <pre className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap text-gray-800 dark:text-gray-200 max-h-64 overflow-y-auto resize-y min-h-[3rem]">
                    {diagnostics.final_text}
                </pre>
            </div>

            {/* Final Response (what was sent to frontend) */}
            {diagnostics.final_response && (
                <div>
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                        Final Response to Frontend
                    </h4>
                    <div className="space-y-3">
                        {/* Suggested Values */}
                        {diagnostics.final_response.suggested_values && diagnostics.final_response.suggested_values.length > 0 && (
                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                                <div className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-2">
                                    Suggested Values ({diagnostics.final_response.suggested_values.length})
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {diagnostics.final_response.suggested_values.map((sv, i) => (
                                        <span key={i} className="px-2 py-1 bg-blue-100 dark:bg-blue-800 rounded text-xs text-blue-800 dark:text-blue-200">
                                            {sv.label}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Suggested Actions */}
                        {diagnostics.final_response.suggested_actions && diagnostics.final_response.suggested_actions.length > 0 && (
                            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                                <div className="text-xs font-medium text-green-700 dark:text-green-400 mb-2">
                                    Suggested Actions ({diagnostics.final_response.suggested_actions.length})
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {diagnostics.final_response.suggested_actions.map((sa, i) => (
                                        <span key={i} className="px-2 py-1 bg-green-100 dark:bg-green-800 rounded text-xs text-green-800 dark:text-green-200">
                                            {sa.label} → {sa.action}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Custom Payload */}
                        {diagnostics.final_response.custom_payload && (
                            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-xs font-medium text-purple-700 dark:text-purple-400">
                                        Custom Payload (type: {diagnostics.final_response.custom_payload.type})
                                    </div>
                                    <button
                                        onClick={() => onFullscreen({
                                            title: 'Custom Payload',
                                            content: JSON.stringify(diagnostics.final_response?.custom_payload, null, 2)
                                        })}
                                        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                        title="View fullscreen"
                                    >
                                        <ArrowsPointingOutIcon className="h-3 w-3" />
                                    </button>
                                </div>
                                <pre className="text-xs font-mono overflow-x-auto text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900 rounded p-2 max-h-32 overflow-y-auto">
                                    {JSON.stringify(diagnostics.final_response.custom_payload.data, null, 2)}
                                </pre>
                            </div>
                        )}

                        {/* No extras */}
                        {!diagnostics.final_response.suggested_values?.length &&
                         !diagnostics.final_response.suggested_actions?.length &&
                         !diagnostics.final_response.custom_payload && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 italic">
                                No suggested values, actions, or custom payload in response
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
