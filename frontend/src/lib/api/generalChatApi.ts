import { makeStreamRequest } from './streamUtils';
import { GeneralChatRequest } from '../../types/chat';

export interface ChatStreamChunk {
    token?: string | null;
    response_text?: string | null;
    payload?: any;
    status?: string | null;
    error?: string | null;
    debug?: any;
}

export const generalChatApi = {
    /**
     * Stream chat messages from the backend
     * @param request - Chat request with message, context, and interaction type
     * @returns AsyncGenerator that yields stream chunks
     */
    async* streamMessage(
        request: GeneralChatRequest
    ): AsyncGenerator<ChatStreamChunk> {
        try {
            const rawStream = makeStreamRequest('/api/chat/stream', request, 'POST');

            for await (const update of rawStream) {
                const lines = update.data.split('\n');
                for (const line of lines) {
                    if (!line.trim()) continue;

                    if (line.startsWith('data: ')) {
                        const jsonStr = line.slice(6);
                        try {
                            const data = JSON.parse(jsonStr);
                            yield data;
                        } catch (e) {
                            console.error('Failed to parse stream data:', e);
                        }
                    }
                }
            }
        } catch (error) {
            yield {
                error: `Stream error: ${error instanceof Error ? error.message : String(error)}`,
                status: null
            };
        }
    }
};
