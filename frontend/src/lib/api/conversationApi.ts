/**
 * Conversation API - Chat persistence endpoints
 */

import { api } from './index';

// === Types ===

export interface Message {
    id: number;
    role: 'user' | 'assistant' | 'system';
    content: string;
    context?: Record<string, unknown>;
    created_at: string;
}

export interface Conversation {
    id: number;
    title?: string;
    created_at: string;
    updated_at: string;
}

export interface ConversationWithMessages extends Conversation {
    messages: Message[];
}

// === API ===

export const conversationApi = {
    /**
     * List user's conversations
     */
    async listConversations(limit = 50, offset = 0): Promise<{ conversations: Conversation[] }> {
        const response = await api.get('/api/conversations', {
            params: { limit, offset }
        });
        return response.data;
    },

    /**
     * Get a conversation with all its messages
     */
    async getConversation(conversationId: number): Promise<ConversationWithMessages> {
        const response = await api.get(`/api/conversations/${conversationId}`);
        return response.data;
    },
};
