/**
 * Unified Search API Client
 * 
 * Provides API integration for the unified search system that works
 * with multiple academic search providers.
 */

import { api } from './index';
import { CanonicalResearchArticle } from '@/types/canonical_types';

// ================== REQUEST/RESPONSE TYPES ==================

export interface UnifiedSearchParams {
  provider: 'pubmed' | 'scholar';
  query: string;
  page?: number;
  page_size?: number;
  offset?: number;
  sort_by?: 'relevance' | 'date';
  year_low?: number;
  year_high?: number;
  date_from?: string;
  date_to?: string;
  date_type?: 'completion' | 'publication' | 'entry' | 'revised';
  include_citations?: boolean;
  include_pdf_links?: boolean;
}

export interface UnifiedSearchResponse {
  articles: CanonicalResearchArticle[];
  metadata: {
    total_results: number;
    returned_results: number;
    search_time: number;
    provider: string;
    query_translation?: string;
    provider_metadata?: Record<string, any>;
    current_page?: number;
    page_size?: number;
    total_pages?: number;
    has_next_page?: boolean;
    has_prev_page?: boolean;
  };
  success: boolean;
  error?: string;
}

export interface BatchSearchRequest {
  providers: string[];
  query: string;
  page?: number;
  page_size?: number;
  sort_by?: 'relevance' | 'date';
  year_low?: number;
  year_high?: number;
}

export interface BatchSearchResponse {
  results: Record<string, UnifiedSearchResponse>;
}

class UnifiedSearchApi {
  /**
   * Get list of all registered search providers
   */
  async getProviders(): Promise<string[]> {
    const response = await api.get('/api/unified-search/providers');
    return response.data;
  }

  /**
   * Get list of currently available search providers
   */
  async getAvailableProviders(): Promise<string[]> {
    const response = await api.get('/api/unified-search/providers/available');
    return response.data;
  }

  /**
   * Perform a unified search with a single provider
   */
  async search(params: UnifiedSearchParams): Promise<UnifiedSearchResponse> {
    const response = await api.get('/api/unified-search/search', {
      params: {
        provider: params.provider,
        query: params.query,
        sort_by: params.sort_by,
        ...(params.year_low !== undefined && { year_low: params.year_low }),
        ...(params.year_high !== undefined && { year_high: params.year_high }),
        ...(params.date_from !== undefined && { date_from: params.date_from }),
        ...(params.date_to !== undefined && { date_to: params.date_to }),
        ...(params.date_type !== undefined && { date_type: params.date_type }),
        ...(params.include_citations !== undefined && { include_citations: params.include_citations }),
        ...(params.include_pdf_links !== undefined && { include_pdf_links: params.include_pdf_links }),
        // Pagination parameters - backend expects num_results
        ...(params.page !== undefined && { page: params.page }),
        ...(params.page_size !== undefined && { num_results: params.page_size }),
        ...(params.offset !== undefined && { offset: params.offset }),
      }
    });

    return response.data;
  }

  /**
   * Perform batch search across multiple providers
   */
  async batchSearch(request: BatchSearchRequest): Promise<BatchSearchResponse> {
    const response = await api.post('/api/unified-search/search/batch', {}, {
      params: {
        query: request.query,
        sort_by: request.sort_by,
        providers: request.providers,
        ...(request.year_low !== undefined && { year_low: request.year_low }),
        ...(request.year_high !== undefined && { year_high: request.year_high }),
        // Add pagination support for batch search
        ...(request.page !== undefined && { page: request.page }),
        ...(request.page_size !== undefined && { page_size: request.page_size }),
      }
    });

    return { results: response.data };
  }

}

export const unifiedSearchApi = new UnifiedSearchApi();