/**
 * Conversation API - Chat persistence endpoints
 */

import { api } from './index';

export interface Message {
    id: number;
    role: 'user' | 'assistant' | 'system';
    content: string;
    context?: Record<string, any>;
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

export interface CreateConversationRequest {
    title?: string;
}

export interface AddMessageRequest {
    role: 'user' | 'assistant' | 'system';
    content: string;
    context?: Record<string, any>;
}

export const conversationApi = {
    /**
     * Create a new conversation
     */
    async createConversation(title?: string): Promise<Conversation> {
        const response = await api.post('/api/conversations', { title });
        return response.data;
    },

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

    /**
     * Update conversation title
     */
    async updateTitle(conversationId: number, title: string): Promise<Conversation> {
        const response = await api.patch(`/api/conversations/${conversationId}`, { title });
        return response.data;
    },

    /**
     * Delete a conversation
     */
    async deleteConversation(conversationId: number): Promise<void> {
        await api.delete(`/api/conversations/${conversationId}`);
    },

    /**
     * Add a message to a conversation
     */
    async addMessage(conversationId: number, message: AddMessageRequest): Promise<Message> {
        const response = await api.post(`/api/conversations/${conversationId}/messages`, message);
        return response.data;
    }
};
