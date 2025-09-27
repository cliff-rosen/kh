/**
 * Lab API Client
 * 
 * API functions for Lab functionality including iterative answer generation.
 */

import { api } from './index';
import { makeStreamRequest } from './streamUtils';

export interface QuestionRefinementRequest {
  question: string;
}

export interface QuestionRefinementResponse {
  refined_question: string;
  suggested_format: string;
  suggested_criteria: string;
  refinement_reasoning: string;
}

export interface StreamingGenerateAnswerRequest {
  instruct: string;
  resp_format: string;
  eval_crit: string;
  iter_max?: number;
  score_threshold?: number;
  model?: string;
}

export interface StreamMessage {
  type: 'status' | 'iteration' | 'result' | 'error';
  message: string;
  data?: any;
  timestamp: string;
}

export interface IterationData {
  answer: string;
  evaluation: {
    score: number;
    meets_criteria: boolean;
    evaluation_reasoning: string;
    improvement_suggestions: string[];
  };
  iteration_number: number;
}

export interface GenerateAnswerResult {
  final_answer: string;
  iterations: IterationData[];
  success: boolean;
  total_iterations: number;
  final_score: number;
  metadata?: any;
}

class LabApi {
  /**
   * Refine a question and get suggestions for format and criteria
   */
  async refineQuestion(request: QuestionRefinementRequest): Promise<QuestionRefinementResponse> {
    const response = await api.post('/api/lab/refine-question', request);
    return response.data;
  }

  /**
   * Generate answer with streaming status updates
   */
  async generateAnswerStreaming(
    request: StreamingGenerateAnswerRequest,
    onMessage: (message: StreamMessage) => void,
    onResult: (result: GenerateAnswerResult) => void,
    onError: (error: string) => void
  ): Promise<void> {
    try {
      const streamGenerator = makeStreamRequest('/api/lab/generate-answer-stream', request, 'POST');
      
      let buffer = '';
      
      for await (const update of streamGenerator) {
        buffer += update.data;
        
        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim(); // Remove 'data: ' prefix
            if (data) {
              try {
                const message: StreamMessage = JSON.parse(data);
                onMessage(message);

                // Check if this is the final result
                if (message.type === 'result' && message.data) {
                  onResult(message.data as GenerateAnswerResult);
                  return;
                } else if (message.type === 'error') {
                  onError(message.message);
                  return;
                }
              } catch (parseError) {
                console.warn('Failed to parse SSE message:', data);
              }
            }
          }
        }
      }
      
      // Process any remaining data in buffer
      if (buffer.trim()) {
        const finalLine = buffer.trim();
        if (finalLine.startsWith('data: ')) {
          const data = finalLine.slice(6).trim();
          if (data) {
            try {
              const message: StreamMessage = JSON.parse(data);
              onMessage(message);
              if (message.type === 'result' && message.data) {
                onResult(message.data as GenerateAnswerResult);
              }
            } catch (parseError) {
              console.warn('Failed to parse final SSE message:', data);
            }
          }
        }
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Unknown error');
    }
  }
}

export const labApi = new LabApi();