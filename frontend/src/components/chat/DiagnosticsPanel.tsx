import { useState } from 'react';
import { BugAntIcon, ChevronDownIcon, ChevronRightIcon, ArrowsPointingOutIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { AgentTrace, AgentIteration, ToolCall } from '../../types/chat';

interface DiagnosticsPanelProps {
    diagnostics: AgentTrace;
    onClose: () => void;
}

type TabType = 'messages' | 'config' | 'metrics';

// Types for fullscreen content
type FullscreenContent =
    | { type: 'raw'; title: string; content: string }
    | { type: 'messages'; title: string; messages: Array<Record<string, unknown>> }
    | { type: 'blocks'; title: string; blocks: Array<Record<string, unknown>> };

// Fullscreen viewer with tabs for rendered/raw views
function FullscreenViewer({ content, onClose }: { content: FullscreenContent; onClose: () => void }) {
    const [viewMode, setViewMode] = useState<'rendered' | 'raw'>('rendered');

    const hasRenderedView = content.type === 'messages' || content.type === 'blocks';
    const rawContent = content.type === 'raw'
        ? content.content
        : content.type === 'messages'
        ? JSON.stringify(content.messages, null, 2)
        : JSON.stringify(content.blocks, null, 2);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 z-[60] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 bg-gray-900 border-b border-gray-700 flex-shrink-0">
                <h3 className="text-lg font-semibold text-white">{content.title}</h3>
                <div className="flex items-center gap-4">
                    {hasRenderedView && (
                        <div className="flex bg-gray-800 rounded-lg p-1">
                            <button
                                onClick={() => setViewMode('rendered')}
                                className={`px-3 py-1 text-sm rounded ${
                                    viewMode === 'rendered'
                                        ? 'bg-gray-600 text-white'
                                        : 'text-gray-400 hover:text-white'
                                }`}
                            >
                                Rendered
                            </button>
                            <button
                                onClick={() => setViewMode('raw')}
                                className={`px-3 py-1 text-sm rounded ${
                                    viewMode === 'raw'
                                        ? 'bg-gray-600 text-white'
                                        : 'text-gray-400 hover:text-white'
                                }`}
                            >
                                Raw JSON
                            </button>
                        </div>
                    )}
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white p-2"
                    >
                        <XMarkIcon className="h-6 w-6" />
                    </button>
                </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-6">
                {viewMode === 'raw' || !hasRenderedView ? (
                    <pre className="text-sm font-mono whitespace-pre-wrap text-gray-200">
                        {rawContent}
                    </pre>
                ) : content.type === 'messages' ? (
                    <FullscreenMessagesList messages={content.messages} />
                ) : (
                    <FullscreenBlocksList blocks={content.blocks} />
                )}
            </div>
        </div>
    );
}

// Rendered messages list for fullscreen view
function FullscreenMessagesList({ messages }: { messages: Array<Record<string, unknown>> }) {
    return (
        <div className="space-y-3 max-w-4xl mx-auto">
            {messages.map((msg, idx) => (
                <FullscreenMessageItem key={idx} index={idx} message={msg} />
            ))}
        </div>
    );
}

function FullscreenMessageItem({ index, message }: { index: number; message: Record<string, unknown> }) {
    const role = (message.role as string) || 'unknown';
    const blocks = normalizeContent(message.content);
    const roleStyle = ROLE_STYLES[role] || { bg: 'bg-gray-700', text: 'text-gray-300' };

    return (
        <div className="bg-gray-800 rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2 bg-gray-700/50 border-b border-gray-600">
                <span className="text-xs text-gray-400 w-6">{index}</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${roleStyle.bg} ${roleStyle.text}`}>
                    {role}
                </span>
            </div>
            <div className="p-4 space-y-3">
                {blocks.map((block, blockIdx) => (
                    <FullscreenContentBlock key={blockIdx} block={block} />
                ))}
            </div>
        </div>
    );
}

function FullscreenContentBlock({ block }: { block: ContentBlock }) {
    if (block.type === 'text' && 'text' in block) {
        const textBlock = block as TextBlock;
        return (
            <div className="bg-gray-900 rounded p-3 border border-gray-700">
                <div className="text-xs font-medium text-gray-500 mb-2">text</div>
                <pre className="text-sm font-mono whitespace-pre-wrap text-gray-200">
                    {textBlock.text}
                </pre>
            </div>
        );
    }

    if (block.type === 'tool_use' && 'name' in block) {
        const toolUse = block as ToolUseBlock;
        return (
            <div className="bg-blue-900/30 rounded p-3 border border-blue-700">
                <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-blue-400">tool_use</span>
                    <span className="text-sm font-mono font-semibold text-blue-300">{toolUse.name}</span>
                    <span className="text-xs text-gray-500 font-mono">{toolUse.id?.slice(0, 12)}...</span>
                </div>
                <pre className="text-sm font-mono whitespace-pre-wrap text-gray-200 bg-gray-900 rounded p-2">
                    {JSON.stringify(toolUse.input, null, 2)}
                </pre>
            </div>
        );
    }

    if (block.type === 'tool_result' && 'tool_use_id' in block) {
        const toolResult = block as ToolResultBlock;
        const isError = toolResult.is_error === true;
        return (
            <div className={`rounded p-3 border ${
                isError
                    ? 'bg-red-900/30 border-red-700'
                    : 'bg-green-900/30 border-green-700'
            }`}>
                <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs font-medium ${isError ? 'text-red-400' : 'text-green-400'}`}>
                        tool_result{isError && ' (error)'}
                    </span>
                    <span className="text-xs text-gray-500 font-mono">for {toolResult.tool_use_id?.slice(0, 12)}...</span>
                </div>
                <pre className="text-sm font-mono whitespace-pre-wrap text-gray-200 bg-gray-900 rounded p-2">
                    {toolResult.content}
                </pre>
            </div>
        );
    }

    // Unknown block type
    const unknownBlock = block as UnknownBlock;
    return (
        <div className="bg-gray-700 rounded p-3 border border-gray-600">
            <div className="text-xs text-gray-400 mb-2">{unknownBlock.type || 'unknown'}</div>
            <pre className="text-sm font-mono whitespace-pre-wrap text-gray-200">
                {JSON.stringify(block, null, 2)}
            </pre>
        </div>
    );
}

// Rendered content blocks for fullscreen view
function FullscreenBlocksList({ blocks }: { blocks: Array<Record<string, unknown>> }) {
    return (
        <div className="space-y-3 max-w-4xl mx-auto">
            {blocks.map((block, idx) => (
                <FullscreenContentBlock key={idx} block={block as ContentBlock} />
            ))}
        </div>
    );
}

export function DiagnosticsPanel({ diagnostics, onClose }: DiagnosticsPanelProps) {
    const [activeTab, setActiveTab] = useState<TabType>('messages');
    const [expandedIterations, setExpandedIterations] = useState<Set<number>>(new Set([1]));
    const [expandedToolCalls, setExpandedToolCalls] = useState<Set<string>>(new Set());
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['messages']));
    const [fullscreenContent, setFullscreenContent] = useState<FullscreenContent | null>(null);

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
                    content={fullscreenContent}
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
    onFullscreen: (content: FullscreenContent) => void;
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
            {/* System Message - shown once at top */}
            {diagnostics.system_prompt && (
                <CollapsibleSection
                    id="system-message"
                    title="System Message"
                    subtitle={`${diagnostics.system_prompt.length} chars`}
                    isExpanded={expandedSections.has('system-message')}
                    onToggle={() => toggleSection('system-message')}
                    onFullscreen={() => onFullscreen({ type: 'raw', title: 'System Message', content: diagnostics.system_prompt })}
                >
                    <div className="bg-purple-50 dark:bg-purple-900/20 rounded p-3 border border-purple-200 dark:border-purple-800">
                        <div className="text-xs font-medium text-purple-600 dark:text-purple-400 mb-2">system</div>
                        <pre className="text-xs font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-200 max-h-64 overflow-y-auto">
                            {diagnostics.system_prompt}
                        </pre>
                    </div>
                </CollapsibleSection>
            )}

            {/* Iterations */}
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

            {/* Final Agent Response - what was sent to frontend */}
            {diagnostics.final_response && (
                <AgentResponseCard
                    response={diagnostics.final_response}
                    onFullscreen={onFullscreen}
                />
            )}
        </div>
    );
}

// Agent Response with tabbed interface
type AgentResponseTab = 'message' | 'payload' | 'tools';

function AgentResponseCard({ response, onFullscreen }: {
    response: NonNullable<AgentTrace['final_response']>;
    onFullscreen: (content: FullscreenContent) => void;
}) {
    const hasPayload = !!response.custom_payload;
    const hasTools = !!(response.tool_history && response.tool_history.length > 0);

    // Default to first available tab
    const [activeTab, setActiveTab] = useState<AgentResponseTab>('message');

    const tabs: { id: AgentResponseTab; label: string; show: boolean }[] = [
        { id: 'message', label: 'Message', show: true },
        { id: 'payload', label: `Payload${hasPayload ? ` (${response.custom_payload?.type})` : ''}`, show: hasPayload },
        { id: 'tools', label: `Tools${hasTools ? ` (${response.tool_history?.length})` : ''}`, show: hasTools },
    ];

    const visibleTabs = tabs.filter(t => t.show);

    return (
        <div className="border-2 border-indigo-300 dark:border-indigo-700 rounded-lg overflow-hidden">
            {/* Header */}
            <div className="bg-indigo-50 dark:bg-indigo-900/30 px-4 py-3 border-b border-indigo-200 dark:border-indigo-700 flex items-center justify-between">
                <h4 className="font-semibold text-indigo-900 dark:text-indigo-100">
                    Agent Response
                </h4>
                {response.conversation_id && (
                    <span className="text-xs text-indigo-600 dark:text-indigo-400 font-mono">
                        conv: {response.conversation_id}
                    </span>
                )}
            </div>

            {/* Tabs */}
            {visibleTabs.length > 1 && (
                <div className="flex border-b border-indigo-200 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-900/10">
                    {visibleTabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                                activeTab === tab.id
                                    ? 'border-indigo-500 text-indigo-700 dark:text-indigo-300'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Tab Content */}
            <div className="p-4">
                {activeTab === 'message' && (
                    <div className="space-y-4">
                        {/* Message Text */}
                        <div>
                            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Message</div>
                            <pre className="bg-white dark:bg-gray-900 rounded p-3 text-xs font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700">
                                {response.message}
                            </pre>
                        </div>

                        {/* Suggested Values */}
                        {response.suggested_values && response.suggested_values.length > 0 && (
                            <div>
                                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                                    Suggested Values ({response.suggested_values.length})
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {response.suggested_values.map((sv, i) => (
                                        <div key={i} className="px-3 py-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded">
                                            <div className="text-xs font-medium text-blue-800 dark:text-blue-200">{sv.label}</div>
                                            <div className="text-xs text-blue-600 dark:text-blue-400 font-mono">{sv.value}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Suggested Actions */}
                        {response.suggested_actions && response.suggested_actions.length > 0 && (
                            <div>
                                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                                    Suggested Actions ({response.suggested_actions.length})
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {response.suggested_actions.map((sa, i) => (
                                        <div key={i} className="px-3 py-2 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded">
                                            <div className="text-xs font-medium text-green-800 dark:text-green-200">{sa.label}</div>
                                            <div className="text-xs text-green-600 dark:text-green-400 font-mono">
                                                {sa.action} ({sa.handler})
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'payload' && response.custom_payload && (
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                Type: <span className="font-mono">{response.custom_payload.type}</span>
                            </div>
                            <button
                                onClick={() => onFullscreen({
                                    type: 'raw',
                                    title: 'Custom Payload',
                                    content: JSON.stringify(response.custom_payload, null, 2)
                                })}
                                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                                <ArrowsPointingOutIcon className="h-4 w-4" />
                            </button>
                        </div>
                        <pre className="bg-purple-50 dark:bg-purple-900/20 rounded p-3 text-xs font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-200 border border-purple-200 dark:border-purple-800">
                            {JSON.stringify(response.custom_payload.data, null, 2)}
                        </pre>
                    </div>
                )}

                {activeTab === 'tools' && response.tool_history && response.tool_history.length > 0 && (
                    <div className="space-y-3">
                        {response.tool_history.map((th, i) => (
                            <div key={i} className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded p-3">
                                <div className="text-xs font-medium text-orange-800 dark:text-orange-200 font-mono mb-2">
                                    {th.tool_name}
                                </div>
                                <div className="grid grid-cols-2 gap-3 text-xs">
                                    <div>
                                        <div className="text-gray-500 dark:text-gray-400 mb-1">Input</div>
                                        <pre className="bg-white dark:bg-gray-900 rounded p-2 font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                                            {JSON.stringify(th.input, null, 2)}
                                        </pre>
                                    </div>
                                    <div>
                                        <div className="text-gray-500 dark:text-gray-400 mb-1">Output</div>
                                        <pre className="bg-white dark:bg-gray-900 rounded p-2 font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                                            {typeof th.output === 'string' ? th.output : JSON.stringify(th.output, null, 2)}
                                        </pre>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
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
    onFullscreen: (content: FullscreenContent) => void;
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
                            type: 'messages',
                            title: `Iteration ${iteration.iteration} - Input to Model`,
                            messages: iteration.messages_to_model || []
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
                            type: 'blocks',
                            title: `Iteration ${iteration.iteration} - Model Response`,
                            blocks: iteration.response_content || []
                        })}
                    >
                        <div className="space-y-2">
                            {(iteration.response_content || []).map((block, idx) => (
                                <ContentBlockRenderer key={idx} block={block as ContentBlock} />
                            ))}
                        </div>
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

// ============================================================================
// Message Rendering - Unified approach for all API messages
// ============================================================================
//
// Every message has: { role: string, content: string | ContentBlock[] }
// ContentBlock types: text, tool_use, tool_result
//
// We normalize string content to [{ type: "text", text: content }] for uniform rendering.

interface TextBlock {
    type: 'text';
    text: string;
}

interface ToolUseBlock {
    type: 'tool_use';
    id: string;
    name: string;
    input: Record<string, unknown>;
}

interface ToolResultBlock {
    type: 'tool_result';
    tool_use_id: string;
    content: string;
    is_error?: boolean;
}

interface UnknownBlock {
    type: string;
    [key: string]: unknown;
}

type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock | UnknownBlock;

function normalizeContent(content: unknown): ContentBlock[] {
    if (typeof content === 'string') {
        return [{ type: 'text', text: content }];
    }
    if (Array.isArray(content)) {
        return content as ContentBlock[];
    }
    // Unknown format - wrap as text
    return [{ type: 'text', text: JSON.stringify(content, null, 2) }];
}

function getContentSummary(blocks: ContentBlock[]): { text: string; badges: string[] } {
    const badges: string[] = [];
    let textPreview = '';

    for (const block of blocks) {
        if (block.type === 'text' && 'text' in block) {
            const text = (block as TextBlock).text;
            if (!textPreview) {
                textPreview = text.slice(0, 80);
            }
        } else if (block.type === 'tool_use' && 'name' in block) {
            badges.push((block as ToolUseBlock).name);
        } else if (block.type === 'tool_result') {
            badges.push('result');
        }
    }

    return {
        text: textPreview + (textPreview.length >= 80 ? '...' : ''),
        badges
    };
}

const ROLE_STYLES: Record<string, { bg: string; text: string }> = {
    system: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-800 dark:text-purple-400' },
    user: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-800 dark:text-blue-400' },
    assistant: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-800 dark:text-green-400' },
};

function MessagesList({ messages, onFullscreen }: {
    messages: Array<Record<string, unknown>>;
    onFullscreen: (content: FullscreenContent) => void;
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
    onFullscreen: (content: FullscreenContent) => void;
}) {
    const [isExpanded, setIsExpanded] = useState(false);

    const role = (message.role as string) || 'unknown';
    const blocks = normalizeContent(message.content);
    const summary = getContentSummary(blocks);
    const roleStyle = ROLE_STYLES[role] || { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-800 dark:text-gray-400' };

    return (
        <div className="border border-gray-200 dark:border-gray-600 rounded overflow-hidden">
            {/* Header - always visible */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center gap-2 p-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
                {isExpanded ? (
                    <ChevronDownIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                ) : (
                    <ChevronRightIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                )}
                <span className="text-xs text-gray-400 w-5 flex-shrink-0">{index}</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${roleStyle.bg} ${roleStyle.text}`}>
                    {role}
                </span>
                {summary.badges.map((badge, i) => (
                    <span key={i} className="px-1.5 py-0.5 rounded text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 flex-shrink-0">
                        {badge}
                    </span>
                ))}
                <span className="text-xs text-gray-600 dark:text-gray-400 truncate">
                    {summary.text}
                </span>
            </button>

            {/* Expanded content */}
            {isExpanded && (
                <div className="border-t border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 p-2 relative">
                    <button
                        onClick={() => onFullscreen({
                            type: 'blocks',
                            title: `Message ${index} (${role})`,
                            blocks: blocks as Array<Record<string, unknown>>
                        })}
                        className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 z-10"
                        title="View fullscreen"
                    >
                        <ArrowsPointingOutIcon className="h-4 w-4" />
                    </button>
                    <div className="space-y-2">
                        {blocks.map((block, blockIdx) => (
                            <ContentBlockRenderer key={blockIdx} block={block} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function ContentBlockRenderer({ block }: { block: ContentBlock }) {
    if (block.type === 'text' && 'text' in block) {
        const textBlock = block as TextBlock;
        return (
            <div className="bg-white dark:bg-gray-800 rounded p-2 border border-gray-200 dark:border-gray-700">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">text</div>
                <pre className="text-xs font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-200 max-h-64 overflow-y-auto">
                    {textBlock.text}
                </pre>
            </div>
        );
    }

    if (block.type === 'tool_use' && 'name' in block) {
        const toolUse = block as ToolUseBlock;
        return (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded p-2 border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-blue-600 dark:text-blue-400">tool_use</span>
                    <span className="text-xs font-mono font-semibold text-blue-700 dark:text-blue-300">{toolUse.name}</span>
                    <span className="text-xs text-gray-400 font-mono">{toolUse.id?.slice(0, 12)}...</span>
                </div>
                <pre className="text-xs font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900 rounded p-2 max-h-48 overflow-y-auto">
                    {JSON.stringify(toolUse.input, null, 2)}
                </pre>
            </div>
        );
    }

    if (block.type === 'tool_result' && 'tool_use_id' in block) {
        const toolResult = block as ToolResultBlock;
        const isError = toolResult.is_error === true;
        return (
            <div className={`rounded p-2 border ${
                isError
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                    : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
            }`}>
                <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs font-medium ${
                        isError ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                    }`}>
                        tool_result{isError && ' (error)'}
                    </span>
                    <span className="text-xs text-gray-400 font-mono">for {toolResult.tool_use_id?.slice(0, 12)}...</span>
                </div>
                <pre className="text-xs font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900 rounded p-2 max-h-48 overflow-y-auto">
                    {toolResult.content}
                </pre>
            </div>
        );
    }

    // Unknown block type
    const unknownBlock = block as UnknownBlock;
    return (
        <div className="bg-gray-100 dark:bg-gray-700 rounded p-2 border border-gray-200 dark:border-gray-600">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{unknownBlock.type || 'unknown'}</div>
            <pre className="text-xs font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-200 max-h-48 overflow-y-auto">
                {JSON.stringify(block, null, 2)}
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
}

function ToolCallCard({ toolCall, isExpanded, onToggle }: ToolCallCardProps) {
    const [showFullscreen, setShowFullscreen] = useState(false);

    return (
        <>
            <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                <div className="flex items-center bg-blue-50 dark:bg-blue-900/20">
                    <button
                        onClick={onToggle}
                        className="flex-1 flex items-center gap-3 p-3 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                    >
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
                        <span className="text-xs text-gray-500 dark:text-gray-400">{toolCall.execution_ms}ms</span>
                    </button>
                    <button
                        onClick={() => setShowFullscreen(true)}
                        className="p-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                        title="View fullscreen"
                    >
                        <ArrowsPointingOutIcon className="h-4 w-4" />
                    </button>
                </div>

                {isExpanded && (
                    <div className="p-3 border-t border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                            Input → Output • Click expand icon for full view
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <div className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">Input</div>
                                <pre className="bg-gray-50 dark:bg-gray-900 rounded p-2 text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap max-h-24 overflow-hidden">
                                    {JSON.stringify(toolCall.tool_input, null, 2).slice(0, 300)}
                                    {JSON.stringify(toolCall.tool_input, null, 2).length > 300 && '...'}
                                </pre>
                            </div>
                            <div>
                                <div className="text-xs font-medium text-green-600 dark:text-green-400 mb-1">Output</div>
                                <pre className="bg-gray-50 dark:bg-gray-900 rounded p-2 text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap max-h-24 overflow-hidden">
                                    {toolCall.output_to_model.slice(0, 300)}
                                    {toolCall.output_to_model.length > 300 && '...'}
                                </pre>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Fullscreen Tool Call Viewer */}
            {showFullscreen && (
                <ToolCallFullscreen
                    toolCall={toolCall}
                    onClose={() => setShowFullscreen(false)}
                />
            )}
        </>
    );
}

// Fullscreen viewer for a single tool call with tabs
type ToolCallTab = 'input' | 'output' | 'payload';

function ToolCallFullscreen({ toolCall, onClose }: { toolCall: ToolCall; onClose: () => void }) {
    const [activeTab, setActiveTab] = useState<ToolCallTab>('input');
    const hasPayload = !!toolCall.payload;

    const tabs: { id: ToolCallTab; label: string; show: boolean }[] = [
        { id: 'input', label: 'Input', show: true },
        { id: 'output', label: 'Output', show: true },
        { id: 'payload', label: 'Payload', show: hasPayload },
    ];

    const visibleTabs = tabs.filter(t => t.show);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 z-[60] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-gray-900 border-b border-gray-700 flex-shrink-0">
                <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-white font-mono">{toolCall.tool_name}</h3>
                    <span className={`px-2 py-0.5 rounded text-xs ${
                        toolCall.output_type === 'error'
                            ? 'bg-red-900/50 text-red-300'
                            : 'bg-gray-700 text-gray-300'
                    }`}>
                        {toolCall.output_type}
                    </span>
                    <span className="text-xs text-gray-400">{toolCall.execution_ms}ms</span>
                </div>
                <button onClick={onClose} className="text-gray-400 hover:text-white p-2">
                    <XMarkIcon className="h-6 w-6" />
                </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-700 bg-gray-800 px-6 flex-shrink-0">
                {visibleTabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                            activeTab === tab.id
                                ? 'border-blue-500 text-blue-400'
                                : 'border-transparent text-gray-400 hover:text-gray-200'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-auto p-6">
                {activeTab === 'input' && (
                    <div className="max-w-4xl mx-auto">
                        <div className="text-xs text-gray-400 mb-2">What the model requested</div>
                        <pre className="bg-gray-800 rounded-lg p-4 text-sm font-mono text-gray-200 whitespace-pre-wrap">
                            {JSON.stringify(toolCall.tool_input, null, 2)}
                        </pre>
                    </div>
                )}

                {activeTab === 'output' && (
                    <div className="max-w-4xl mx-auto space-y-6">
                        <div>
                            <div className="text-xs text-gray-400 mb-2">Raw output from executor</div>
                            <pre className="bg-gray-800 rounded-lg p-4 text-sm font-mono text-gray-200 whitespace-pre-wrap">
                                {typeof toolCall.output_from_executor === 'string'
                                    ? toolCall.output_from_executor
                                    : JSON.stringify(toolCall.output_from_executor, null, 2)}
                            </pre>
                        </div>
                        <div>
                            <div className="text-xs text-gray-400 mb-2">Formatted output sent to model</div>
                            <pre className="bg-gray-800 rounded-lg p-4 text-sm font-mono text-gray-200 whitespace-pre-wrap">
                                {toolCall.output_to_model}
                            </pre>
                        </div>
                    </div>
                )}

                {activeTab === 'payload' && toolCall.payload && (
                    <div className="max-w-4xl mx-auto">
                        <div className="text-xs text-gray-400 mb-2">Data sent to frontend</div>
                        <pre className="bg-gray-800 rounded-lg p-4 text-sm font-mono text-gray-200 whitespace-pre-wrap">
                            {JSON.stringify(toolCall.payload, null, 2)}
                        </pre>
                    </div>
                )}
            </div>
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
    onFullscreen: (content: FullscreenContent) => void;
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
                onFullscreen={() => onFullscreen({ type: 'raw', title: 'System Prompt', content: diagnostics.system_prompt || '' })}
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
                                        type: 'raw',
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
                    onFullscreen={() => onFullscreen({ type: 'raw', title: 'Context', content: JSON.stringify(diagnostics.context, null, 2) })}
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
    onFullscreen: (content: FullscreenContent) => void;
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
                            onClick={() => onFullscreen({ type: 'raw', title: 'Error Message', content: diagnostics.error_message || '' })}
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
                        onClick={() => onFullscreen({ type: 'raw', title: 'Final Text', content: diagnostics.final_text || '' })}
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
        </div>
    );
}
