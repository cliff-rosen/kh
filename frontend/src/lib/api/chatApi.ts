import { ChatRequest, ChatMessage, StreamResponse, AgentResponse, StatusResponse } from '../../types/chat';
import { makeStreamRequest } from './streamUtils';
import { api } from './index';

/**
 * Type guard to check if an object is a valid StatusResponse
 */
function isStatusResponse(data: any): data is StatusResponse {
    return (
        typeof data === 'object' &&
        data !== null &&
        typeof data.status === 'string' &&
        !('token' in data) &&
        !('response_text' in data)
    );
}

/**
 * Type guard to check if an object is a valid AgentResponse
 */
function isAgentResponse(data: any): data is AgentResponse {
    return (
        typeof data === 'object' &&
        data !== null &&
        (data.token !== undefined ||
            data.response_text !== undefined ||
            data.payload !== undefined ||
            data.status !== undefined ||
            data.error !== undefined ||
            data.debug !== undefined)
    );
}

/**
 * Parse a Server-Sent Event line into a StreamResponse object
 * @param line - Raw SSE event line
 * @returns Parsed StreamResponse object or null if invalid
 */
export function parseStreamLine(line: string): StreamResponse | null {
    if (!line.startsWith('data: ')) {
        return null;
    }

    const jsonStr = line.slice(6);

    try {
        const data = JSON.parse(jsonStr);

        // Validate and return appropriate response type
        if (isStatusResponse(data)) {
            return {
                status: data.status,
                payload: data.payload ?? null,
                error: data.error ?? null,
                debug: data.debug ?? null
            } as StatusResponse;
        } else if (isAgentResponse(data)) {
            return {
                token: data.token ?? null,
                response_text: data.response_text ?? null,
                payload: data.payload ?? null,
                status: data.status ?? null,
                error: data.error ?? null,
                debug: data.debug ?? null
            } as AgentResponse;
        } else {
            // Invalid data format - return as AgentResponse with error
            return {
                token: null,
                response_text: null,
                payload: null,
                status: null,
                error: 'Invalid response format',
                debug: { originalData: data }
            } as AgentResponse;
        }
    } catch (e) {
        // JSON parse error - return as AgentResponse with error
        return {
            token: null,
            response_text: null,
            payload: null,
            status: null,
            error: `Failed to parse response: ${e instanceof Error ? e.message : String(e)}`,
            debug: { originalLine: line }
        } as AgentResponse;
    }
}

export const chatApi = {
    /**
     * Stream chat messages from the backend
     * @param chatRequest - Chat request with messages and payload
     * @returns AsyncGenerator that yields StreamResponse objects
     */
    streamMessage: async function* (
        chatRequest: ChatRequest,
    ): AsyncGenerator<StreamResponse> {
        try {
            const rawStream = makeStreamRequest('/api/chat/stream', chatRequest, 'POST');

            for await (const update of rawStream) {
                const lines = update.data.split('\n');
                for (const line of lines) {
                    if (!line.trim()) continue;

                    const response = parseStreamLine(line);
                    if (response) {
                        yield response;
                    }
                }
            }
        } catch (error) {
            // Yield error response if stream fails
            yield {
                token: null,
                response_text: null,
                payload: null,
                status: null,
                error: `Stream error: ${error instanceof Error ? error.message : String(error)}`,
                debug: { streamError: true }
            } as AgentResponse;
        }
    },

    /**
     * Get all messages for a specific chat
     * @param chatId - Chat ID to retrieve messages for
     * @returns Promise with messages array
     */
    getMessages: async function (chatId: string): Promise<{ messages: ChatMessage[] }> {
        const response = await api.get(`/api/chat/${chatId}/messages`);
        return response.data;
    },
}; 