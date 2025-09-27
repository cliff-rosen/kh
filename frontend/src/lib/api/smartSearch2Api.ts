/**
 * SmartSearch2 API Client
 * 
 * Direct search API functions for SmartSearch2 - no session management required.
 */

import { api } from './index';
import type { CanonicalResearchArticle } from '@/types/canonical_types';
import type { SearchPaginationInfo, FilteredArticle } from '@/types/smart-search';
import type { CanonicalFeatureDefinition } from '@/types/canonical_types';
import type {
    FeatureExtractionResponse as BaseFeatureExtractionResponse
} from './smartSearchApi';

// ============================================================================
// API Request/Response Models
// ============================================================================

export interface DirectSearchRequest {
    query: string;
    source: 'pubmed' | 'google_scholar';
    max_results?: number;
    offset?: number;
}

export interface DirectSearchResponse {
    articles: CanonicalResearchArticle[];
    pagination: SearchPaginationInfo;
    source: string;
    query: string;
}

export interface EvidenceSpecRequest {
    user_description: string;
    conversation_history?: Array<{ question: string; answer: string }>;
}

export interface EvidenceSpecResponse {
    is_complete: boolean;
    evidence_specification: string | null;
    clarification_questions: string[] | null;
    completeness_score: number;
    missing_elements: string[];
    reasoning?: string;
}

export interface ConceptExtractionRequest {
    evidence_specification: string;
}

export interface ConceptExtractionResponse {
    concepts: string[];
    evidence_specification: string;
}


export interface ConceptExpansionRequest {
    concepts: string[];
    source: 'pubmed' | 'google_scholar';
}

export interface ConceptExpansionResponse {
    expansions: Array<{
        concept: string;
        expression: string;
        count: number;
    }>;
    source: string;
}

export interface KeywordCombinationRequest {
    expressions: string[];
    source: 'pubmed' | 'google_scholar';
}

export interface KeywordCombinationResponse {
    combined_query: string;
    estimated_results: number;
    source: string;
}


// Article filtering types
export interface ArticleFilterRequest {
    filter_condition: string;
    articles: CanonicalResearchArticle[];  // SmartSearch2 passes articles directly (no session needed)
    strictness?: 'low' | 'medium' | 'high';
}

export interface ArticleFilterResponse {
    filtered_articles: FilteredArticle[];
    total_processed: number;
    total_accepted: number;
    total_rejected: number;
    average_confidence: number;
    duration_seconds: number;
    token_usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

// SmartSearch2-specific types (no session_id required)
export interface FeatureExtractionRequest {
    articles: CanonicalResearchArticle[];  // SmartSearch2 passes articles directly
    features: CanonicalFeatureDefinition[];
}

export interface FeatureExtractionResponse extends Omit<BaseFeatureExtractionResponse, 'session_id'> {
    // Inherits results and extraction_metadata from base type
}

// ============================================================================
// API Client Implementation
// ============================================================================

class SmartSearch2Api {
    /**
     * Direct search without session management
     */
    async search(request: DirectSearchRequest): Promise<DirectSearchResponse> {
        const response = await api.post('/api/smart-search-2/search', request);
        return response.data;
    }

    /**
     * Refine evidence specification from user description (conversational)
     * Can be used for both initial generation and iterative refinement
     */
    async refineEvidenceSpec(request: EvidenceSpecRequest): Promise<EvidenceSpecResponse> {
        const response = await api.post('/api/smart-search-2/evidence-spec', request);
        return response.data;
    }

    /**
     * Extract key concepts from evidence specification
     */
    async extractConcepts(request: ConceptExtractionRequest): Promise<ConceptExtractionResponse> {
        const response = await api.post('/api/smart-search-2/extract-concepts', request);
        return response.data;
    }

    /**
     * Expand concepts to Boolean expressions with counts
     */
    async expandConcepts(request: ConceptExpansionRequest): Promise<ConceptExpansionResponse> {
        const response = await api.post('/api/smart-search-2/expand-concepts', request);
        return response.data;
    }

    /**
     * Test combination of Boolean expressions
     */
    async testKeywordCombination(request: KeywordCombinationRequest): Promise<KeywordCombinationResponse> {
        const response = await api.post('/api/smart-search-2/test-keyword-combination', request);
        return response.data;
    }


    /**
     * Filter articles using semantic discriminator (no session required)
     */
    async filterArticles(request: ArticleFilterRequest): Promise<ArticleFilterResponse> {
        const response = await api.post('/api/smart-search-2/filter-articles', request);
        return response.data;
    }

    /**
     * Extract AI features from articles
     */
    async extractFeatures(request: FeatureExtractionRequest): Promise<FeatureExtractionResponse> {
        const response = await api.post('/api/smart-search-2/extract-features', request);
        return response.data;
    }
}

// Export singleton instance
export const smartSearch2Api = new SmartSearch2Api();

// ============= ANALYTICS =============

export interface JourneyAnalyticsData {
  current_journey: {
    journey_id: string;
    event_count: number;
    duration: string;
    events: Array<{
      user_id: string;
      journey_id: string;
      event_id: string;
      event_type: string;
      timestamp: string;
      event_data: any;
    }>;
  } | null;
  recent_journeys: Array<{
    journey_id: string;
    event_count: number;
    start_time: string;
    duration: string;
    last_event_type: string;
  }>;
}

export async function getJourneyAnalytics(journeyId: string): Promise<JourneyAnalyticsData> {
  const response = await api.get(`/api/analytics/journey/${journeyId}`);
  return response.data;
}

export interface UserJourney {
  journey_id: string;
  user_id?: number;
  username?: string;
  start_time: string;
  last_time: string;
  duration: string;
  event_count: number;
  last_event_type: string;
}

export interface UserJourneysResponse {
  journeys: UserJourney[];
}

export async function getUserJourneys(): Promise<UserJourneysResponse> {
  const response = await api.get('/api/smart-search-2/analytics/my-journeys');
  return response.data;
}

export async function getAllUserJourneys(): Promise<UserJourneysResponse> {
  const response = await api.get('/api/smart-search-2/analytics/all-journeys');
  return response.data;
}
