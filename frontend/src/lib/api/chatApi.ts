/**
 * Chat API - Unified chat endpoints
 *
 * Combines conversation persistence and streaming chat functionality.
 */

import { api } from './index';
import { makeStreamRequest } from './streamUtils';
import {
    Conversation,
    ConversationWithMessages,
    InteractionType,
    ActionMetadata,
    StreamEvent,
    ChatResponsePayload,
    SuggestedValue,
    SuggestedAction,
    CustomPayload,
    ToolHistoryEntry,
} from '../../types/chat';


// ============================================================================
// Request Types
// ============================================================================

export interface ChatRequest {
    message: string;
    context: Record<string, unknown>;
    interaction_type: InteractionType;
    action_metadata?: ActionMetadata;
    conversation_history: Array<{
        role: 'user' | 'assistant';
        content: string;
        timestamp: string;
    }>;
    /** Optional conversation ID for persistence. If not provided, creates new conversation. */
    conversation_id?: number | null;
}


// ============================================================================
// Response Types
// ============================================================================

export interface ConversationsListResponse {
    conversations: Conversation[];
}


// ============================================================================
// API Client
// ============================================================================

export const chatApi = {
    // === Conversation Persistence ===

    /**
     * List user's conversations
     */
    async listConversations(limit = 50, offset = 0): Promise<ConversationsListResponse> {
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

    // === Streaming Chat ===

    /**
     * Stream chat messages from the backend
     * @param request - Chat request with message, context, and interaction type
     * @param signal - Optional AbortSignal for cancellation
     * @returns AsyncGenerator that yields typed stream events
     */
    async* streamMessage(
        request: ChatRequest,
        signal?: AbortSignal
    ): AsyncGenerator<StreamEvent> {
        try {
            const rawStream = makeStreamRequest('/api/chat/stream', request, 'POST', signal);

            // Buffer for accumulating partial SSE data lines across chunks
            let buffer = '';

            for await (const update of rawStream) {
                // Append new data to buffer
                buffer += update.data;

                // Process complete lines from the buffer
                let newlineIndex: number;
                while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                    const line = buffer.slice(0, newlineIndex);
                    buffer = buffer.slice(newlineIndex + 1);

                    // Skip empty lines and non-data lines
                    if (!line.trim() || !line.startsWith('data: ')) {
                        continue;
                    }

                    const jsonStr = line.slice(6); // Remove "data: " prefix

                    // Skip ping/keepalive messages
                    if (jsonStr === '' || jsonStr === 'ping') {
                        continue;
                    }

                    try {
                        const data = JSON.parse(jsonStr) as StreamEvent;
                        if (data.type !== 'text_delta') {
                            console.log('[SSE] Event:', data.type);
                        }
                        yield data;
                    } catch {
                        // JSON parse failed - put it back and wait for more data
                        buffer = line + '\n' + buffer;
                        break;
                    }
                }
            }

            // Process any remaining buffered data
            if (buffer.trim() && buffer.startsWith('data: ')) {
                const jsonStr = buffer.slice(6);
                try {
                    const data = JSON.parse(jsonStr) as StreamEvent;
                    if (data.type !== 'text_delta') {
                        console.log('[SSE] Event (final):', data.type);
                    }
                    yield data;
                } catch (e) {
                    console.error('Failed to parse final stream data:', jsonStr.slice(0, 200) + '...', e);
                }
            }
        } catch (error) {
            // Re-throw AbortError so callers can detect cancellation
            if (error instanceof Error && error.name === 'AbortError') {
                throw error;
            }
            yield {
                type: 'error',
                message: `Stream error: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
};


// ============================================================================
// Re-exports for convenience
// ============================================================================

export type {
    Conversation,
    ConversationWithMessages,
    StreamEvent,
    ChatResponsePayload,
    SuggestedValue,
    SuggestedAction,
    CustomPayload,
    ToolHistoryEntry,
};


// ============================================================================
// Backwards Compatibility
// ============================================================================

/** @deprecated Use chatApi instead */
export const conversationApi = chatApi;

/** @deprecated Use chatApi instead */
export const generalChatApi = chatApi;

/** @deprecated Use ChatRequest instead */
export type GeneralChatRequest = ChatRequest;
