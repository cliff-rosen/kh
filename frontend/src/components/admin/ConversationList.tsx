/**
 * ConversationList Component
 *
 * Displays chat conversations for platform admins.
 */

import { useState, useEffect } from 'react';
import { ChatBubbleLeftRightIcon, XMarkIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { api } from '@/lib/api';
import { showErrorToast } from '@/lib/errorToast';

interface Message {
    id: number;
    role: string;
    content: string;
    context?: Record<string, unknown>;
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

interface ConversationsResponse {
    conversations: AdminConversation[];
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
    const [loadingDetail, setLoadingDetail] = useState(false);

    const fetchConversations = async () => {
        setLoading(true);
        setError(null);
        try {
            const params: Record<string, string | number> = { limit, offset };
            if (userId) params.user_id = userId;

            const response = await api.get<ConversationsResponse>('/api/conversations/admin/all', { params });
            setConversations(response.data.conversations);
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

    const fetchConversationDetail = async (conversationId: number) => {
        setLoadingDetail(true);
        try {
            const response = await api.get<ConversationDetail>(`/api/conversations/admin/${conversationId}`);
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

            {/* Conversation Detail Modal */}
            {selectedConversation && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    {selectedConversation.title || 'Conversation'}
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    {selectedConversation.user_name || selectedConversation.user_email} - {formatDate(selectedConversation.created_at)}
                                </p>
                            </div>
                            <button
                                onClick={() => setSelectedConversation(null)}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                            >
                                <XMarkIcon className="h-5 w-5 text-gray-500" />
                            </button>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {loadingDetail ? (
                                <div className="text-center text-gray-500 py-8">Loading messages...</div>
                            ) : selectedConversation.messages.length === 0 ? (
                                <div className="text-center text-gray-500 py-8">No messages</div>
                            ) : (
                                selectedConversation.messages.map((msg) => (
                                    <div
                                        key={msg.id}
                                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div
                                            className={`max-w-[80%] rounded-lg px-4 py-2 ${
                                                msg.role === 'user'
                                                    ? 'bg-blue-600 text-white'
                                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
                                            }`}
                                        >
                                            <div className="text-xs font-medium opacity-70 mb-1">
                                                {msg.role}
                                            </div>
                                            <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                                            <div className="text-xs opacity-70 mt-1">
                                                {formatDate(msg.created_at)}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                            <button
                                onClick={() => setSelectedConversation(null)}
                                className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
