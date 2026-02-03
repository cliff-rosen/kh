/**
 * ConversationList Component
 *
 * Displays chat conversations for platform admins with full message inspection.
 */

import { useState, useEffect } from 'react';
import { ChatBubbleLeftRightIcon, XMarkIcon, ArrowPathIcon, UserIcon, CpuChipIcon, BugAntIcon } from '@heroicons/react/24/outline';
import { api } from '@/lib/api';
import { showErrorToast } from '@/lib/errorToast';
import { AgentTrace as ChatAgentTrace } from '@/types/chat';
import { DiagnosticsPanel } from '@/components/chat/DiagnosticsPanel';

interface SuggestedValue {
    label: string;
    value: string;
}

interface SuggestedAction {
    label: string;
    action: string;
    handler?: string;
    data?: Record<string, unknown>;
}

interface ToolRecord {
    tool_name: string;
    input: Record<string, unknown>;
    output: string;
}

// Legacy diagnostics format (for old messages)
interface LegacyDiagnostics {
    model: string;
    max_tokens: number;
    max_iterations?: number;
    temperature?: number;
    system_prompt: string;
    tools: string[];
    messages: Array<{ role: string; content: string }>;
    context: Record<string, unknown>;
    raw_llm_response?: string;
}

// New trace format (for new messages)
interface AgentTrace {
    trace_id: string;
    model: string;
    max_tokens: number;
    max_iterations: number;
    temperature: number;
    system_prompt: string;
    tools: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>;
    context: Record<string, unknown>;
    initial_messages: Array<Record<string, unknown>>;
    iterations: Array<{
        iteration: number;
        messages_to_model: Array<Record<string, unknown>>;
        response_content: Array<Record<string, unknown>>;
        stop_reason: string;
        usage: { input_tokens: number; output_tokens: number };
        api_call_ms: number;
        tool_calls: Array<{
            tool_use_id: string;
            tool_name: string;
            // New format uses tool_input, legacy uses input_from_model/input_to_executor
            tool_input?: Record<string, unknown>;
            input_from_model?: Record<string, unknown>;
            input_to_executor?: Record<string, unknown>;
            output_from_executor: unknown;
            output_type: string;
            output_to_model: string;
            payload?: Record<string, unknown>;
            execution_ms: number;
        }>;
    }>;
    final_text: string;
    total_iterations: number;
    outcome: string;
    error_message?: string;
    total_input_tokens: number;
    total_output_tokens: number;
    total_duration_ms: number;
}

interface MessageExtras {
    tool_history?: ToolRecord[];
    custom_payload?: Record<string, unknown>;
    diagnostics?: LegacyDiagnostics;  // Legacy format
    trace?: AgentTrace;  // New format
    suggested_values?: SuggestedValue[];
    suggested_actions?: SuggestedAction[];
}

interface Message {
    id: number;
    role: string;
    content: string;
    context?: Record<string, unknown>;
    extras?: MessageExtras;
    created_at: string;
}

interface AdminConversation {
    id: number;
    user_id: number;
    user_email: string;
    user_name?: string;
    title?: string;
    message_count: number;
    created_at: string;
    updated_at: string;
}

interface ChatsResponse {
    chats: AdminConversation[];
    total: number;
    limit: number;
    offset: number;
}

interface ConversationDetail {
    id: number;
    user_id: number;
    user_email: string;
    user_name?: string;
    title?: string;
    created_at: string;
    updated_at: string;
    messages: Message[];
}

interface UserOption {
    user_id: number;
    email: string;
    full_name?: string;
}

export function ConversationList() {
    const [conversations, setConversations] = useState<AdminConversation[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filters
    const [userId, setUserId] = useState<number | ''>('');
    const [users, setUsers] = useState<UserOption[]>([]);

    // Pagination
    const [offset, setOffset] = useState(0);
    const limit = 50;

    // Detail view
    const [selectedConversation, setSelectedConversation] = useState<ConversationDetail | null>(null);
    const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);

    const fetchConversations = async () => {
        setLoading(true);
        setError(null);
        try {
            const params: Record<string, string | number> = { limit, offset };
            if (userId) params.user_id = userId;

            const response = await api.get<ChatsResponse>('/api/chats/admin/all', { params });
            setConversations(response.data.chats);
            setTotal(response.data.total);
        } catch (err) {
            setError('Failed to load conversations');
            showErrorToast(err, 'Failed to load conversations');
        } finally {
            setLoading(false);
        }
    };

    const fetchUsers = async () => {
        try {
            const response = await api.get<{ users: UserOption[] }>('/api/admin/users');
            setUsers(response.data.users);
        } catch (err) {
            console.error('Error loading users:', err);
        }
    };

    const fetchConversationDetail = async (chatId: number) => {
        setLoadingDetail(true);
        try {
            const response = await api.get<ConversationDetail>(`/api/chats/admin/${chatId}`);
            setSelectedConversation(response.data);
        } catch (err) {
            showErrorToast(err, 'Failed to load conversation');
        } finally {
            setLoadingDetail(false);
        }
    };

    useEffect(() => {
        fetchConversations();
    }, [userId, offset]);

    useEffect(() => {
        fetchUsers();
    }, []);

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString();
    };

    const totalPages = Math.ceil(total / limit);
    const currentPage = Math.floor(offset / limit) + 1;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <ChatBubbleLeftRightIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                        Chat Conversations
                    </h2>
                    <span className="ml-2 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded-full text-gray-600 dark:text-gray-300">
                        {total} total
                    </span>
                </div>
                <button
                    onClick={() => fetchConversations()}
                    disabled={loading}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
                >
                    <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">User:</label>
                    <select
                        value={userId}
                        onChange={(e) => {
                            setUserId(e.target.value ? parseInt(e.target.value) : '');
                            setOffset(0);
                        }}
                        className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                        <option value="">All Users</option>
                        {users.map((user) => (
                            <option key={user.user_id} value={user.user_id}>
                                {user.full_name || user.email}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
                    {error}
                </div>
            )}

            {/* Conversations List */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                User
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Title / Preview
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Messages
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Last Updated
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {loading ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                                    Loading conversations...
                                </td>
                            </tr>
                        ) : conversations.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                                    No conversations found
                                </td>
                            </tr>
                        ) : (
                            conversations.map((conv) => (
                                <tr key={conv.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                                            {conv.user_name || 'Unknown'}
                                        </div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400">
                                            {conv.user_email}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-sm text-gray-900 dark:text-white truncate max-w-xs">
                                            {conv.title || 'Untitled conversation'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full">
                                            {conv.message_count}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {formatDate(conv.updated_at)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <button
                                            onClick={() => fetchConversationDetail(conv.id)}
                                            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                        >
                                            View
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 rounded-lg">
                    <div className="text-sm text-gray-700 dark:text-gray-300">
                        Page {currentPage} of {totalPages}
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setOffset(Math.max(0, offset - limit))}
                            disabled={offset === 0}
                            className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                            Previous
                        </button>
                        <button
                            onClick={() => setOffset(offset + limit)}
                            disabled={offset + limit >= total}
                            className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}

            {/* Conversation Detail - Full Screen Panel */}
            {selectedConversation && (
                <div className="fixed inset-0 z-50 bg-gray-100 dark:bg-gray-900 overflow-hidden flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shrink-0">
                        <div>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                                {selectedConversation.title || 'Untitled Conversation'}
                            </h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {selectedConversation.user_name || selectedConversation.user_email} •
                                Started {formatDate(selectedConversation.created_at)} •
                                {selectedConversation.messages.length} messages
                            </p>
                        </div>
                        <button
                            onClick={() => {
                                setSelectedConversation(null);
                                setSelectedMessage(null);
                            }}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                        >
                            <XMarkIcon className="h-6 w-6 text-gray-500" />
                        </button>
                    </div>

                    {/* Content - Two column layout */}
                    <div className="flex-1 flex overflow-hidden">
                        {/* Messages List - Left Panel */}
                        <div className="w-1/2 border-r border-gray-200 dark:border-gray-700 overflow-y-auto bg-white dark:bg-gray-800">
                            {loadingDetail ? (
                                <div className="text-center text-gray-500 py-8">Loading messages...</div>
                            ) : selectedConversation.messages.length === 0 ? (
                                <div className="text-center text-gray-500 py-8">No messages</div>
                            ) : (
                                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {selectedConversation.messages.map((msg, idx) => (
                                        <div
                                            key={msg.id}
                                            onClick={() => setSelectedMessage(msg)}
                                            className={`p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                                                selectedMessage?.id === msg.id ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500' : ''
                                            }`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                                                    msg.role === 'user'
                                                        ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
                                                        : 'bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-400'
                                                }`}>
                                                    {msg.role === 'user' ? (
                                                        <UserIcon className="h-4 w-4" />
                                                    ) : (
                                                        <CpuChipIcon className="h-4 w-4" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                                                            {msg.role}
                                                        </span>
                                                        <span className="text-xs text-gray-400 dark:text-gray-500">
                                                            #{idx + 1}
                                                        </span>
                                                        <span className="text-xs text-gray-400 dark:text-gray-500">
                                                            {formatDate(msg.created_at)}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm text-gray-900 dark:text-white line-clamp-3">
                                                        {msg.content}
                                                    </p>
                                                    {/* Badges for extras */}
                                                    {msg.extras && Object.keys(msg.extras).length > 0 && (
                                                        <div className="flex flex-wrap gap-1 mt-2">
                                                            {(msg.extras.trace || msg.extras.diagnostics) && (
                                                                <span className="px-1.5 py-0.5 text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded">
                                                                    {msg.extras.trace ? 'trace' : 'diagnostics'}
                                                                </span>
                                                            )}
                                                            {msg.extras.tool_history && msg.extras.tool_history.length > 0 && (
                                                                <span className="px-1.5 py-0.5 text-xs bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded">
                                                                    {msg.extras.tool_history.length} tool{msg.extras.tool_history.length !== 1 ? 's' : ''}
                                                                </span>
                                                            )}
                                                            {msg.extras.custom_payload && (
                                                                <span className="px-1.5 py-0.5 text-xs bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 rounded">
                                                                    payload
                                                                </span>
                                                            )}
                                                            {msg.extras.suggested_values && msg.extras.suggested_values.length > 0 && (
                                                                <span className="px-1.5 py-0.5 text-xs bg-cyan-100 dark:bg-cyan-900 text-cyan-700 dark:text-cyan-300 rounded">
                                                                    {msg.extras.suggested_values.length} values
                                                                </span>
                                                            )}
                                                            {msg.extras.suggested_actions && msg.extras.suggested_actions.length > 0 && (
                                                                <span className="px-1.5 py-0.5 text-xs bg-pink-100 dark:bg-pink-900 text-pink-700 dark:text-pink-300 rounded">
                                                                    {msg.extras.suggested_actions.length} actions
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Message Detail - Right Panel */}
                        <div className="w-1/2 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-6">
                            {selectedMessage ? (
                                <MessageDetailPanel message={selectedMessage} />
                            ) : (
                                <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
                                    <p>Select a message to view details</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Full detail panel for a selected message
function MessageDetailPanel({ message }: { message: Message }) {
    const extras = message.extras || {};

    // Support both old diagnostics format and new trace format
    const trace = extras.trace;
    const legacyDiagnostics = extras.diagnostics;
    const hasDiagnostics = !!trace || !!legacyDiagnostics;

    // For raw output, check both formats
    const hasRawOutput = !!trace?.final_text || !!legacyDiagnostics?.raw_llm_response;
    const hasIterations = trace?.iterations && trace.iterations.length > 0;
    const hasToolCalls = extras.tool_history && extras.tool_history.length > 0;
    const hasExtras = !!extras.custom_payload ||
                      (extras.suggested_values && extras.suggested_values.length > 0) ||
                      (extras.suggested_actions && extras.suggested_actions.length > 0);

    const tabs = [
        { id: 'input' as const, label: 'LLM Input', show: hasDiagnostics },
        { id: 'iterations' as const, label: `Iterations (${trace?.iterations?.length || 0})`, show: hasIterations },
        { id: 'raw' as const, label: 'Raw Output', show: hasRawOutput },
        { id: 'tools' as const, label: `Tool Calls (${extras.tool_history?.length || 0})`, show: hasToolCalls },
        { id: 'extras' as const, label: 'Extras', show: hasExtras },
    ].filter(t => t.show);

    // Default to first available tab
    const [activeTab, setActiveTab] = useState<'input' | 'iterations' | 'raw' | 'tools' | 'extras'>(
        tabs.length > 0 ? tabs[0].id : 'input'
    );

    // State for diagnostics panel (rich trace viewer)
    const [showDiagnosticsPanel, setShowDiagnosticsPanel] = useState(false);

    return (
        <div className="space-y-4">
            {/* Message Header */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            message.role === 'user'
                                ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
                                : 'bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-400'
                        }`}>
                            {message.role === 'user' ? (
                                <UserIcon className="h-5 w-5" />
                            ) : (
                                <CpuChipIcon className="h-5 w-5" />
                            )}
                        </div>
                        <div>
                            <div className="font-semibold text-gray-900 dark:text-white capitalize">{message.role}</div>
                            <div className="text-xs text-gray-500">{new Date(message.created_at).toLocaleString()}</div>
                        </div>
                    </div>
                    {/* View Trace button - only shown for new trace format */}
                    {trace && (
                        <button
                            onClick={() => setShowDiagnosticsPanel(true)}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors"
                        >
                            <BugAntIcon className="h-4 w-4" />
                            View Trace
                        </button>
                    )}
                </div>
            </div>

            {/* Diagnostics Panel Modal (rich trace viewer) */}
            {showDiagnosticsPanel && trace && (
                <DiagnosticsPanel
                    diagnostics={trace as unknown as ChatAgentTrace}
                    onClose={() => setShowDiagnosticsPanel(false)}
                />
            )}

            {/* Tabs */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
                {tabs.length > 0 && (
                    <div className="flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`px-4 py-2 text-sm font-medium whitespace-nowrap ${
                                    activeTab === tab.id
                                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-b-2 border-blue-500'
                                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                )}

                <div className="p-4">
                    {/* No tabs available (user messages) */}
                    {tabs.length === 0 && (
                        <div className="prose dark:prose-invert max-w-none">
                            <pre className="whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto">
                                {message.content}
                            </pre>
                        </div>
                    )}

                    {/* LLM Input Tab - supports both old diagnostics and new trace format */}
                    {activeTab === 'input' && hasDiagnostics && (
                        <div className="space-y-4">
                            {/* Model Config */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Model</div>
                                    <div className="font-mono text-sm text-gray-900 dark:text-gray-100">{trace?.model || legacyDiagnostics?.model}</div>
                                </div>
                                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Max Tokens</div>
                                    <div className="font-mono text-sm text-gray-900 dark:text-gray-100">{trace?.max_tokens || legacyDiagnostics?.max_tokens}</div>
                                </div>
                                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Temperature</div>
                                    <div className="font-mono text-sm text-gray-900 dark:text-gray-100">{trace?.temperature ?? legacyDiagnostics?.temperature ?? 'N/A'}</div>
                                </div>
                                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Max Iterations</div>
                                    <div className="font-mono text-sm text-gray-900 dark:text-gray-100">{trace?.max_iterations ?? legacyDiagnostics?.max_iterations ?? 'N/A'}</div>
                                </div>
                            </div>

                            {/* Trace metrics (new format only) */}
                            {trace && (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Outcome</div>
                                        <div className="font-mono text-sm text-green-700 dark:text-green-300">{trace.outcome}</div>
                                    </div>
                                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Iterations</div>
                                        <div className="font-mono text-sm text-gray-900 dark:text-gray-100">{trace.total_iterations}</div>
                                    </div>
                                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total Tokens</div>
                                        <div className="font-mono text-sm text-gray-900 dark:text-gray-100">{trace.total_input_tokens} in / {trace.total_output_tokens} out</div>
                                    </div>
                                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Duration</div>
                                        <div className="font-mono text-sm text-gray-900 dark:text-gray-100">{trace.total_duration_ms}ms</div>
                                    </div>
                                </div>
                            )}

                            {/* Tools */}
                            {((trace?.tools && trace.tools.length > 0) || (legacyDiagnostics?.tools && legacyDiagnostics.tools.length > 0)) && (
                                <div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                        Available Tools ({trace?.tools?.length || legacyDiagnostics?.tools?.length || 0})
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {(trace?.tools || []).map((tool, idx) => (
                                            <span key={idx} className="px-2 py-1 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded text-xs font-mono">
                                                {tool.name}
                                            </span>
                                        ))}
                                        {(!trace && legacyDiagnostics?.tools || []).map((tool, idx) => (
                                            <span key={idx} className="px-2 py-1 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded text-xs font-mono">
                                                {tool}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Context */}
                            {(trace?.context || legacyDiagnostics?.context) && (
                                <div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Context</div>
                                    <pre className="text-xs text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 p-3 rounded-lg overflow-x-auto max-h-48 overflow-y-auto">
                                        {JSON.stringify(trace?.context || legacyDiagnostics?.context, null, 2)}
                                    </pre>
                                </div>
                            )}

                            {/* System Prompt */}
                            <div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                    System Prompt ({(trace?.system_prompt || legacyDiagnostics?.system_prompt)?.length || 0} chars)
                                </div>
                                <pre className="text-xs text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 p-3 rounded-lg overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap">
                                    {trace?.system_prompt || legacyDiagnostics?.system_prompt}
                                </pre>
                            </div>

                            {/* Initial Messages (new format) or Message History (old format) */}
                            {trace?.initial_messages && trace.initial_messages.length > 0 ? (
                                <div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                        Initial Messages ({trace.initial_messages.length}) - stored conversation before tool exchange
                                    </div>
                                    <pre className="text-xs text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 p-3 rounded-lg overflow-x-auto max-h-64 overflow-y-auto">
                                        {JSON.stringify(trace.initial_messages, null, 2)}
                                    </pre>
                                </div>
                            ) : legacyDiagnostics?.messages && legacyDiagnostics.messages.length > 0 ? (
                                <div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Message History ({legacyDiagnostics.messages.length} messages)</div>
                                    <div className="space-y-2 max-h-64 overflow-y-auto">
                                        {legacyDiagnostics.messages.map((msg, idx) => (
                                            <div key={idx} className="bg-gray-50 dark:bg-gray-900 p-2 rounded text-xs">
                                                <span className="font-semibold text-gray-600 dark:text-gray-400">{msg.role}:</span>
                                                <span className="ml-2 text-gray-800 dark:text-gray-200">{msg.content?.substring(0, 200)}{msg.content?.length > 200 ? '...' : ''}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    )}

                    {/* Iterations Tab (new trace format only) */}
                    {activeTab === 'iterations' && trace?.iterations && (
                        <div className="space-y-4">
                            {trace.iterations.map((iter, idx) => (
                                <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                                    <div className="bg-gray-50 dark:bg-gray-700/50 p-3 flex justify-between items-center">
                                        <div className="flex items-center gap-3">
                                            <span className="font-semibold text-gray-900 dark:text-white">Iteration {iter.iteration}</span>
                                            <span className={`px-2 py-0.5 rounded text-xs ${
                                                iter.stop_reason === 'end_turn' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                                iter.stop_reason === 'tool_use' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                                                'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                                            }`}>
                                                {iter.stop_reason}
                                            </span>
                                            {iter.tool_calls?.length > 0 && (
                                                <span className="text-xs text-gray-500">{iter.tool_calls.length} tool calls</span>
                                            )}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {iter.usage?.input_tokens || 0} in / {iter.usage?.output_tokens || 0} out | {iter.api_call_ms}ms
                                        </div>
                                    </div>
                                    <div className="p-3 space-y-3 bg-white dark:bg-gray-800">
                                        <div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Messages to Model ({iter.messages_to_model?.length || 0})</div>
                                            <pre className="text-xs text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 p-2 rounded overflow-x-auto max-h-32 overflow-y-auto">
                                                {JSON.stringify(iter.messages_to_model, null, 2)}
                                            </pre>
                                        </div>
                                        <div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Response Content</div>
                                            <pre className="text-xs text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 p-2 rounded overflow-x-auto max-h-32 overflow-y-auto">
                                                {JSON.stringify(iter.response_content, null, 2)}
                                            </pre>
                                        </div>
                                        {iter.tool_calls && iter.tool_calls.length > 0 && (
                                            <div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Tool Calls</div>
                                                {iter.tool_calls.map((tc, tcIdx) => (
                                                    <div key={tcIdx} className="bg-blue-50 dark:bg-blue-900/30 p-2 rounded mb-2 text-xs">
                                                        <div className="font-mono text-blue-700 dark:text-blue-300 mb-1">{tc.tool_name} ({tc.execution_ms}ms)</div>
                                                        <div className="grid grid-cols-2 gap-2 mt-2">
                                                            <div>
                                                                <div className="text-gray-500 dark:text-gray-400 mb-1">Input</div>
                                                                <pre className="text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900 p-1 rounded overflow-x-auto">
                                                                    {JSON.stringify(tc.tool_input || tc.input_from_model, null, 2)}
                                                                </pre>
                                                            </div>
                                                            <div>
                                                                <div className="text-gray-500 dark:text-gray-400 mb-1">Output to Model</div>
                                                                <pre className="text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900 p-1 rounded overflow-x-auto max-h-24 overflow-y-auto whitespace-pre-wrap">
                                                                    {tc.output_to_model?.substring(0, 500)}{tc.output_to_model?.length > 500 ? '...' : ''}
                                                                </pre>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Raw Output Tab - supports both formats */}
                    {activeTab === 'raw' && hasRawOutput && (
                        <div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                {trace ? 'Final Text' : 'Raw LLM Response'} ({(trace?.final_text || legacyDiagnostics?.raw_llm_response)?.length || 0} chars)
                            </div>
                            <pre className="text-xs text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">
                                {trace?.final_text || legacyDiagnostics?.raw_llm_response}
                            </pre>
                        </div>
                    )}

                    {/* Tool Calls Tab */}
                    {activeTab === 'tools' && extras.tool_history && extras.tool_history.length > 0 && (
                        <div className="space-y-4">
                            {extras.tool_history.map((tool, idx) => (
                                <div key={idx} className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                                    <div className="font-semibold text-purple-600 dark:text-purple-400 mb-3">
                                        {idx + 1}. {tool.tool_name}
                                    </div>
                                    <div className="space-y-3">
                                        <div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Input</div>
                                            <pre className="text-xs text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 p-2 rounded overflow-x-auto">
                                                {JSON.stringify(tool.input, null, 2)}
                                            </pre>
                                        </div>
                                        <div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Output</div>
                                            <pre className="text-xs text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 p-2 rounded overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
                                                {tool.output}
                                            </pre>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Extras Tab */}
                    {activeTab === 'extras' && (
                        <div className="space-y-6">
                            {/* Custom Payload */}
                            {extras.custom_payload && (
                                <div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Custom Payload</div>
                                    <pre className="text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto">
                                        {JSON.stringify(extras.custom_payload, null, 2)}
                                    </pre>
                                </div>
                            )}

                            {/* Suggested Values */}
                            {extras.suggested_values && extras.suggested_values.length > 0 && (
                                <div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Suggested Values ({extras.suggested_values.length})</div>
                                    <div className="space-y-1">
                                        {extras.suggested_values.map((val, idx) => (
                                            <div key={idx} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-900 p-2 rounded">
                                                <span className="font-medium text-sm text-gray-900 dark:text-gray-100">{val.label}</span>
                                                <span className="text-xs text-gray-500 dark:text-gray-400">→</span>
                                                <code className="text-xs text-gray-800 dark:text-gray-200 bg-gray-200 dark:bg-gray-700 px-1 rounded">{val.value}</code>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Suggested Actions */}
                            {extras.suggested_actions && extras.suggested_actions.length > 0 && (
                                <div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Suggested Actions ({extras.suggested_actions.length})</div>
                                    <div className="space-y-1">
                                        {extras.suggested_actions.map((action, idx) => (
                                            <div key={idx} className="bg-gray-50 dark:bg-gray-900 p-2 rounded">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-sm text-gray-900 dark:text-gray-100">{action.label}</span>
                                                    <code className="text-xs text-gray-800 dark:text-gray-200 bg-gray-200 dark:bg-gray-700 px-1 rounded">{action.action}</code>
                                                    {action.handler && (
                                                        <span className="text-xs text-gray-500 dark:text-gray-400">({action.handler})</span>
                                                    )}
                                                </div>
                                                {action.data && (
                                                    <pre className="text-xs mt-1 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 p-1 rounded overflow-x-auto">
                                                        {JSON.stringify(action.data, null, 2)}
                                                    </pre>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
