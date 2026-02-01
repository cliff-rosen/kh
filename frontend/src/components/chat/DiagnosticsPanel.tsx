import { useState } from 'react';
import { BugAntIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import { AgentTrace, AgentIteration, ToolCall } from '../../types/chat';

interface DiagnosticsPanelProps {
    diagnostics: AgentTrace;
    onClose: () => void;
}

type TabType = 'config' | 'prompt' | 'iterations' | 'metrics';

export function DiagnosticsPanel({ diagnostics, onClose }: DiagnosticsPanelProps) {
    const [activeTab, setActiveTab] = useState<TabType>('iterations');
    const [expandedIterations, setExpandedIterations] = useState<Set<number>>(new Set([1]));
    const [expandedToolCalls, setExpandedToolCalls] = useState<Set<string>>(new Set());

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

    const tabs: { id: TabType; label: string }[] = [
        { id: 'iterations', label: `Iterations (${diagnostics.iterations?.length || 0})` },
        { id: 'config', label: 'Config' },
        { id: 'prompt', label: 'System Prompt' },
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
                    {activeTab === 'config' && (
                        <ConfigTab diagnostics={diagnostics} />
                    )}

                    {activeTab === 'prompt' && (
                        <PromptTab diagnostics={diagnostics} />
                    )}

                    {activeTab === 'iterations' && (
                        <IterationsTab
                            diagnostics={diagnostics}
                            expandedIterations={expandedIterations}
                            expandedToolCalls={expandedToolCalls}
                            toggleIteration={toggleIteration}
                            toggleToolCall={toggleToolCall}
                        />
                    )}

                    {activeTab === 'metrics' && (
                        <MetricsTab diagnostics={diagnostics} />
                    )}
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// Config Tab
// ============================================================================

function ConfigTab({ diagnostics }: { diagnostics: AgentTrace }) {
    const [expandedTool, setExpandedTool] = useState<string | null>(null);

    return (
        <>
            {/* Model Config */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <ConfigCard label="Model" value={diagnostics.model} />
                <ConfigCard label="Max Tokens" value={diagnostics.max_tokens} />
                <ConfigCard label="Temperature" value={diagnostics.temperature} />
                <ConfigCard label="Max Iterations" value={diagnostics.max_iterations} />
            </div>

            {/* Tools */}
            <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Tools Available ({diagnostics.tools?.length || 0})
                </h4>
                <div className="space-y-2">
                    {diagnostics.tools?.map((tool) => (
                        <div key={tool.name} className="border border-gray-200 dark:border-gray-700 rounded-lg">
                            <button
                                onClick={() => setExpandedTool(expandedTool === tool.name ? null : tool.name)}
                                className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
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
                            {expandedTool === tool.name && (
                                <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                                    <pre className="text-xs font-mono overflow-x-auto text-gray-800 dark:text-gray-200">
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
            <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Context</h4>
                <pre className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-xs font-mono overflow-x-auto text-gray-800 dark:text-gray-200">
                    {JSON.stringify(diagnostics.context, null, 2)}
                </pre>
            </div>

            {/* Initial Messages (stored conversation) */}
            <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Initial Messages ({diagnostics.initial_messages?.length || 0})
                    <span className="font-normal text-gray-500 ml-2">- stored conversation before tool exchange</span>
                </h4>
                <pre className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-xs font-mono overflow-x-auto text-gray-800 dark:text-gray-200 max-h-64 overflow-y-auto">
                    {JSON.stringify(diagnostics.initial_messages, null, 2)}
                </pre>
            </div>
        </>
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
// Prompt Tab
// ============================================================================

function PromptTab({ diagnostics }: { diagnostics: AgentTrace }) {
    return (
        <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                System Prompt ({diagnostics.system_prompt?.length || 0} chars)
            </h4>
            <pre className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap text-gray-800 dark:text-gray-200">
                {diagnostics.system_prompt}
            </pre>
        </div>
    );
}

// ============================================================================
// Iterations Tab
// ============================================================================

interface IterationsTabProps {
    diagnostics: AgentTrace;
    expandedIterations: Set<number>;
    expandedToolCalls: Set<string>;
    toggleIteration: (iter: number) => void;
    toggleToolCall: (id: string) => void;
}

function IterationsTab({
    diagnostics,
    expandedIterations,
    expandedToolCalls,
    toggleIteration,
    toggleToolCall,
}: IterationsTabProps) {
    if (!diagnostics.iterations || diagnostics.iterations.length === 0) {
        return <p className="text-gray-500 dark:text-gray-400">No iterations recorded</p>;
    }

    return (
        <div className="space-y-4">
            {diagnostics.iterations.map((iteration) => (
                <IterationCard
                    key={iteration.iteration}
                    iteration={iteration}
                    isExpanded={expandedIterations.has(iteration.iteration)}
                    expandedToolCalls={expandedToolCalls}
                    onToggle={() => toggleIteration(iteration.iteration)}
                    onToggleToolCall={toggleToolCall}
                    initialMessagesCount={diagnostics.initial_messages?.length || 0}
                />
            ))}
        </div>
    );
}

interface IterationCardProps {
    iteration: AgentIteration;
    isExpanded: boolean;
    expandedToolCalls: Set<string>;
    onToggle: () => void;
    onToggleToolCall: (id: string) => void;
    initialMessagesCount: number;
}

function IterationCard({
    iteration,
    isExpanded,
    expandedToolCalls,
    onToggle,
    onToggleToolCall,
    initialMessagesCount,
}: IterationCardProps) {
    const toolExchangeCount = (iteration.messages_to_model?.length || 0) - initialMessagesCount;

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
                        <span className="text-xs text-gray-500">
                            {iteration.tool_calls.length} tool call{iteration.tool_calls.length !== 1 ? 's' : ''}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>{iteration.usage?.input_tokens || 0} in / {iteration.usage?.output_tokens || 0} out</span>
                    <span>{iteration.api_call_ms}ms</span>
                </div>
            </button>

            {/* Expanded Content */}
            {isExpanded && (
                <div className="p-4 space-y-4 border-t border-gray-200 dark:border-gray-700">
                    {/* Messages to Model */}
                    <div>
                        <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Messages to Model ({iteration.messages_to_model?.length || 0})
                            {toolExchangeCount > 0 && (
                                <span className="font-normal text-orange-600 dark:text-orange-400 ml-2">
                                    +{toolExchangeCount} from tool exchange
                                </span>
                            )}
                        </h5>
                        <pre className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 text-xs font-mono overflow-x-auto text-gray-800 dark:text-gray-200 max-h-64 overflow-y-auto">
                            {JSON.stringify(iteration.messages_to_model, null, 2)}
                        </pre>
                    </div>

                    {/* Response Content */}
                    <div>
                        <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Response Content
                        </h5>
                        <pre className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 text-xs font-mono overflow-x-auto text-gray-800 dark:text-gray-200 max-h-64 overflow-y-auto">
                            {JSON.stringify(iteration.response_content, null, 2)}
                        </pre>
                    </div>

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

interface ToolCallCardProps {
    toolCall: ToolCall;
    isExpanded: boolean;
    onToggle: () => void;
}

function ToolCallCard({ toolCall, isExpanded, onToggle }: ToolCallCardProps) {
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
                </div>
                <span className="text-xs text-gray-500">{toolCall.execution_ms}ms</span>
            </button>

            {isExpanded && (
                <div className="p-3 space-y-3 border-t border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800">
                    {/* Input from Model */}
                    <div>
                        <h6 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            Input from Model
                        </h6>
                        <pre className="bg-gray-50 dark:bg-gray-900 rounded p-2 text-xs font-mono overflow-x-auto text-gray-800 dark:text-gray-200">
                            {JSON.stringify(toolCall.input_from_model, null, 2)}
                        </pre>
                    </div>

                    {/* Input to Executor */}
                    <div>
                        <h6 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            Input to Executor
                        </h6>
                        <pre className="bg-gray-50 dark:bg-gray-900 rounded p-2 text-xs font-mono overflow-x-auto text-gray-800 dark:text-gray-200">
                            {JSON.stringify(toolCall.input_to_executor, null, 2)}
                        </pre>
                    </div>

                    {/* Output from Executor */}
                    <div>
                        <h6 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            Output from Executor (raw)
                        </h6>
                        <pre className="bg-gray-50 dark:bg-gray-900 rounded p-2 text-xs font-mono overflow-x-auto text-gray-800 dark:text-gray-200 max-h-32 overflow-y-auto">
                            {typeof toolCall.output_from_executor === 'string'
                                ? toolCall.output_from_executor
                                : JSON.stringify(toolCall.output_from_executor, null, 2)}
                        </pre>
                    </div>

                    {/* Output to Model */}
                    <div>
                        <h6 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            Output to Model (in message)
                        </h6>
                        <pre className="bg-gray-50 dark:bg-gray-900 rounded p-2 text-xs font-mono overflow-x-auto whitespace-pre-wrap text-gray-800 dark:text-gray-200 max-h-32 overflow-y-auto">
                            {toolCall.output_to_model}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    );
}

// ============================================================================
// Metrics Tab
// ============================================================================

function MetricsTab({ diagnostics }: { diagnostics: AgentTrace }) {
    return (
        <>
            {/* Outcome */}
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
                <div className="grid grid-cols-2 gap-4">
                    <ConfigCard label="Total Input Tokens" value={diagnostics.total_input_tokens || 0} />
                    <ConfigCard label="Total Output Tokens" value={diagnostics.total_output_tokens || 0} />
                </div>
            </div>

            {/* Error Message */}
            {diagnostics.error_message && (
                <div>
                    <h4 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-3">Error Message</h4>
                    <pre className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-xs font-mono text-red-800 dark:text-red-200">
                        {diagnostics.error_message}
                    </pre>
                </div>
            )}

            {/* Final Text */}
            <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Final Text ({diagnostics.final_text?.length || 0} chars)
                </h4>
                <pre className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap text-gray-800 dark:text-gray-200 max-h-64 overflow-y-auto">
                    {diagnostics.final_text}
                </pre>
            </div>
        </>
    );
}
