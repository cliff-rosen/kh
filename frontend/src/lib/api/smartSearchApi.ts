/**
 * Smart Search API Client
 * 
 * API functions and types for Smart Search functionality in the Lab.
 * Mirrors the backend router pattern - types and implementation in same file.
 */

import { api } from './index';
import type { 
  CanonicalResearchArticle, 
  FilteredArticle, 
  SmartSearchSession,
  SessionListResponse,
  SessionResetResponse 
} from '@/types/smart-search';

// Re-export domain types for convenience
export type { CanonicalResearchArticle, FilteredArticle } from '@/types/smart-search';
import type { FeatureDefinition } from '@/types/workbench';

// Import the type from the domain types
import type { SearchKeywordHistoryItem as DomainSearchKeywordHistoryItem } from '@/types/smart-search';

// Backend expects ISO string for timestamp and snake_case field names
export interface SearchKeywordHistoryItem extends Omit<DomainSearchKeywordHistoryItem, 'timestamp' | 'changeType' | 'refinementDetails'> {
  timestamp: string;  // ISO format for backend
  change_type: 'system_generated' | 'ai_optimized' | 'user_edited';  // snake_case for backend
  refinement_details?: string;  // snake_case for backend
}

// ============================================================================
// API Request/Response Models (ordered by endpoint flow)
// ============================================================================

// Step 1: Create Evidence Specification
export interface EvidenceSpecificationRequest {
  query: string;
  max_results?: number;
  session_id?: string;
}

export interface EvidenceSpecificationResponse {
  original_query: string;
  evidence_specification: string;
  session_id: string;
}

// Step 2: Generate Search Keywords
export interface SearchKeywordsRequest {
  evidence_specification: string;
  session_id: string;
  selected_sources: string[];
}

export interface SearchKeywordsResponse {
  evidence_specification: string;
  search_keywords: string;
  session_id: string;
}

// Extended response that includes automatic count testing result
export interface SearchKeywordsWithCountResponse extends SearchKeywordsResponse {
  count_result?: {
    total_count: number;
    sources_searched: string[];
  };
}


// Step 3: Test Keywords Count
export interface KeywordsCountRequest {
  search_keywords: string;
  session_id: string;
  selected_sources: string[];
}

export interface KeywordsCountResponse {
  search_keywords: string;
  total_count: number;
  sources_searched: string[];
  session_id: string;
}


// Step 4: Generate Optimized Keywords
export interface OptimizedKeywordsRequest {
  current_keywords: string;
  evidence_specification: string;
  target_max_results?: number;
  session_id: string;
  selected_sources: string[];
}

export interface OptimizedKeywordsResponse {
  evidence_specification: string;
  initial_keywords: string;
  initial_count: number;
  final_keywords: string;
  final_count: number;
  refinement_applied: string;
  refinement_status: 'optimal' | 'refined' | 'manual_needed';
  session_id: string;
}


// Step 5: Execute Search
export interface SearchExecutionRequest {
  search_keywords: string;
  max_results?: number;
  offset?: number;
  session_id: string;
  selected_sources: string[];
}

export interface SearchExecutionResponse {
  articles: CanonicalResearchArticle[];
  pagination: {
    total_available: number;
    returned: number;
    offset: number;
    has_more: boolean;
  };
  sources_searched: string[];
  session_id: string;
}

// Step 6: Generate Discriminator
export interface DiscriminatorGenerationRequest {
  evidence_specification: string;
  search_keywords: string;
  strictness: 'low' | 'medium' | 'high';
  session_id: string;
}

export interface DiscriminatorGenerationResponse {
  evidence_specification: string;
  search_keywords: string;
  strictness: string;
  discriminator_prompt: string;
  session_id: string;
}

// Step 7: Filter Articles
export interface ArticleFilterRequest {
  evidence_specification: string;
  search_keywords: string;
  strictness?: 'low' | 'medium' | 'high';
  discriminator_prompt: string;
  session_id: string;
  selected_sources: string[];
  max_results: number;  // Maximum number of articles to retrieve and filter
}

export interface ArticleFilterResponse {
  filtered_articles: FilteredArticle[];
  total_processed: number;
  total_accepted: number;
  total_rejected: number;
  total_available: number;  // Total articles initially reported as available
  total_retrieved: number;  // Total articles actually retrieved for filtering
  average_confidence: number;
  duration_seconds: number;
  token_usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  session_id: string;
  search_limitation_note?: string;  // Optional note about search limitations
}

// Step 8: Extract Features
export interface FeatureExtractionRequest {
  session_id: string;
  features: FeatureDefinition[];
}

export interface FeatureExtractionResponse {
  session_id: string;
  results: Record<string, Record<string, any>>;  // article_id -> feature_id -> value
  extraction_metadata: {
    total_articles: number;
    features_extracted: number;
    extraction_time: number;
  };
}

// ============================================================================
// API Client Implementation
// ============================================================================

class SmartSearchApi {

  /**
   * Step 1: Create evidence specification from user query
   */
  async createEvidenceSpec(request: EvidenceSpecificationRequest): Promise<EvidenceSpecificationResponse> {
    const response = await api.post('/api/lab/smart-search/evidence-spec', request);
    return response.data;
  }

  /**
   * Step 2: Generate search keywords from evidence specification
   */
  async generateKeywords(request: SearchKeywordsRequest): Promise<SearchKeywordsResponse> {
    const response = await api.post('/api/lab/smart-search/generate-keywords', request);
    return response.data;
  }

  /**
   * Step 3: Test search query to get result count without retrieving articles
   */
  async testKeywordsCount(request: KeywordsCountRequest): Promise<KeywordsCountResponse> {
    const response = await api.post('/api/lab/smart-search/test-keywords-count', request);
    return response.data;
  }

  /**
   * Step 4: Generate optimized search query with volume control
   */
  async generateOptimizedKeywords(request: OptimizedKeywordsRequest): Promise<OptimizedKeywordsResponse> {
    const response = await api.post('/api/lab/smart-search/generate-optimized-keywords', request);
    return response.data;
  }

  /**
   * Step 5: Execute search with boolean query
   */
  async search(request: SearchExecutionRequest): Promise<SearchExecutionResponse> {
    const response = await api.post('/api/lab/smart-search/search', request);
    return response.data;
  }

  /**
   * Step 6: Generate semantic discriminator prompt for review
   */
  async generateDiscriminator(request: DiscriminatorGenerationRequest): Promise<DiscriminatorGenerationResponse> {
    const response = await api.post('/api/lab/smart-search/generate-discriminator', request);
    return response.data;
  }

  /**
   * Step 7: Filter articles using semantic discriminator
   */
  async filterArticles(request: ArticleFilterRequest): Promise<ArticleFilterResponse> {
    const response = await api.post('/api/lab/smart-search/filter-articles', request);
    return response.data;
  }

  /**
   * Step 8: Extract custom AI features from filtered articles
   */
  async extractFeatures(request: FeatureExtractionRequest): Promise<FeatureExtractionResponse> {
    const response = await api.post('/api/lab/smart-search/extract-features', request);
    return response.data;
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  /**
   * Reset session to a specific step
   */
  async resetSessionToStep(sessionId: string, step: string): Promise<SessionResetResponse> {
    const response = await api.post(`/api/lab/smart-search/sessions/${sessionId}/reset-to-step`, {
      step
    });
    return response.data;
  }

  /**
   * Get user's search session history
   */
  async getUserSessions(limit: number = 50, offset: number = 0): Promise<SessionListResponse> {
    const response = await api.get(`/api/lab/smart-search/sessions?limit=${limit}&offset=${offset}`);
    return response.data;
  }

  /**
   * Get all users' search session history (admin only)
   */
  async getAllSessions(limit: number = 50, offset: number = 0): Promise<SessionListResponse> {
    const response = await api.get(`/api/lab/smart-search/admin/sessions?limit=${limit}&offset=${offset}`);
    return response.data;
  }

  /**
   * Get specific search session details
   */
  async getSession(sessionId: string): Promise<SmartSearchSession> {
    const response = await api.get(`/api/lab/smart-search/sessions/${sessionId}`);
    return response.data;
  }

  /**
   * Delete a search session
   */
  async deleteSession(sessionId: string): Promise<void> {
    await api.delete(`/api/lab/smart-search/sessions/${sessionId}`);
  }

  /**
   * Update search keyword history for a session
   */
  async updateSearchKeywordHistory(sessionId: string, history: SearchKeywordHistoryItem[]): Promise<void> {
    await api.put(`/api/lab/smart-search/sessions/${sessionId}/search-keyword-history`, {
      search_keyword_history: history
    });
  }

}

export const smartSearchApi = new SmartSearchApi();