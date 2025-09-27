/**
 * Article Chat API Client
 * 
 * Provides stateless chat functionality for article discussions.
 * No persistence - conversation history is managed by the frontend.
 * Uses the same streaming pattern as the main chat API.
 */

import { makeStreamRequest } from './streamUtils';
import { CanonicalResearchArticle } from '@/types/canonical_types';

export interface ArticleChatRequest {
  message: string;
  article_context: {
    id: string;
    title: string;
    authors: string[];
    abstract: string;
    journal: string;
    publication_year?: number;
    doi?: string;
    extracted_features: Record<string, any>;
    source: string;
  };
  conversation_history: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  company_context?: string;
}

export interface ArticleChatStreamResponse {
  type: 'metadata' | 'content' | 'done' | 'error';
  data: {
    content?: string;
    error?: string;
    article_id?: string;
    model?: string;
  };
}

/**
 * Parse a Server-Sent Event line into an ArticleChatStreamResponse object
 */
export function parseArticleChatStreamLine(line: string): ArticleChatStreamResponse | null {
  if (!line.startsWith('data: ')) {
    return null;
  }

  const jsonStr = line.slice(6);

  try {
    const data = JSON.parse(jsonStr);

    // Validate the expected format
    if (data.type && data.data && typeof data.type === 'string') {
      return data as ArticleChatStreamResponse;
    }

    return null;
  } catch (e) {
    console.warn('Failed to parse article chat stream line:', line, e);
    return null;
  }
}

class ArticleChatApi {
  /**
   * Stream chat messages for article discussions using the same pattern as main chat
   */
  async* streamMessage(
    message: string,
    article: CanonicalResearchArticle,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
  ): AsyncGenerator<ArticleChatStreamResponse> {
    try {
      const chatRequest: ArticleChatRequest = {
        message,
        article_context: {
          id: article.id,
          title: article.title,
          authors: article.authors,
          abstract: article.abstract || '',
          journal: article.journal || '',
          publication_year: article.publication_year,
          doi: article.doi,
          extracted_features: article.extracted_features || {},
          source: article.source
        },
        conversation_history: conversationHistory,
        // Use default Palatin context - could be made configurable later
        company_context: undefined // Let backend use default
      };

      const rawStream = makeStreamRequest('/api/article-chat/chat/stream', chatRequest, 'POST');

      for await (const update of rawStream) {
        const lines = update.data.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;

          const response = parseArticleChatStreamLine(line);
          if (response) {
            yield response;
          }
        }
      }
    } catch (error) {
      // Yield error response if stream fails (same pattern as main chat)
      yield {
        type: 'error',
        data: {
          error: `Stream error: ${error instanceof Error ? error.message : String(error)}`
        }
      } as ArticleChatStreamResponse;
    }
  }

  /**
   * Callback-based streaming method for easier integration with existing components
   */
  async sendMessageStream(
    message: string,
    article: CanonicalResearchArticle,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    onChunk: (chunk: string) => void,
    onComplete: () => void,
    onError: (error: string) => void
  ): Promise<void> {
    try {
      const stream = this.streamMessage(message, article, conversationHistory);

      for await (const response of stream) {
        switch (response.type) {
          case 'metadata':
            // Could use metadata for UI state if needed
            break;
          case 'content':
            if (response.data.content) {
              onChunk(response.data.content);
            }
            break;
          case 'done':
            onComplete();
            return;
          case 'error':
            onError(response.data.error || 'Unknown error occurred');
            return;
        }
      }
    } catch (error) {
      console.error('Article chat stream error:', error);
      onError(error instanceof Error ? error.message : 'Failed to get response from article chat');
    }
  }

  /**
   * Legacy non-streaming method for backward compatibility
   */
  async sendMessage(
    message: string,
    article: CanonicalResearchArticle,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let fullResponse = '';

      this.sendMessageStream(
        message,
        article,
        conversationHistory,
        (chunk) => {
          fullResponse += chunk;
        },
        () => {
          resolve(fullResponse);
        },
        (error) => {
          reject(new Error(error));
        }
      );
    });
  }
}

export const articleChatApi = new ArticleChatApi();