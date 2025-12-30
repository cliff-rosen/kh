/**
 * Conversations API
 *
 * API for chat conversation persistence.
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

export interface CreateConversationRequest {
    title?: string;
}

export interface AddMessageRequest {
    role: 'user' | 'assistant' | 'system';
    content: string;
    context?: Record<string, unknown>;
}

// === API Functions ===

/**
 * Create a new conversation
 */
export async function createConversation(title?: string): Promise<Conversation> {
    const response = await api.post('/api/conversations', { title });
    return response.data;
}

/**
 * List user's conversations
 */
export async function listConversations(
    limit: number = 50,
    offset: number = 0
): Promise<Conversation[]> {
    const response = await api.get('/api/conversations', {
        params: { limit, offset }
    });
    return response.data.conversations;
}

/**
 * Get a conversation with its messages
 */
export async function getConversation(conversationId: number): Promise<ConversationWithMessages> {
    const response = await api.get(`/api/conversations/${conversationId}`);
    return response.data;
}

/**
 * Update conversation title
 */
export async function updateConversationTitle(
    conversationId: number,
    title: string
): Promise<Conversation> {
    const response = await api.patch(`/api/conversations/${conversationId}`, { title });
    return response.data;
}

/**
 * Delete a conversation
 */
export async function deleteConversation(conversationId: number): Promise<void> {
    await api.delete(`/api/conversations/${conversationId}`);
}

/**
 * Add a message to a conversation
 */
export async function addMessage(
    conversationId: number,
    role: 'user' | 'assistant' | 'system',
    content: string,
    context?: Record<string, unknown>
): Promise<Message> {
    const response = await api.post(`/api/conversations/${conversationId}/messages`, {
        role,
        content,
        context
    });
    return response.data;
}
