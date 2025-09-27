/**
 * Unified Workbench API Client
 * 
 * Single API client that handles:
 * - Article group management (table view, collections)
 * - Individual article research (deep dive, notes, features)  
 * - Analysis operations (column extraction, bulk operations)
 */

import { api } from './index';
import {
  FeatureDefinition,
  ArticleGroup,
  ArticleGroupWithDetails,
} from '@/types/workbench';
import { CanonicalResearchArticle } from '@/types/canonical_types';
import { EntityExtractionResponse, ArticleArchetypeResponse } from '@/types/entity-extraction';
import {
  CanonicalStudyRepresentation,
  SaveCanonicalStudyRequest,
  SaveCanonicalStudyResponse
} from '@/types/canonical-study';

// ================== REQUEST/RESPONSE TYPES ==================

// Feature Definition Types (alias for backward compatibility)
export type ColumnDefinition = FeatureDefinition;

export interface FeaturePreset {
  id: string;
  name: string;
  description: string;
  category?: string;
  features: FeatureDefinition[];
}

// Legacy alias
export type ColumnPreset = FeaturePreset;

// New Extract Request/Response
export interface ExtractRequest {
  articles: Array<{
    id: string;
    title: string;
    abstract: string;
  }>;
  features: FeatureDefinition[];
}

export interface ExtractResponse {
  results: Record<string, Record<string, string>>; // articleId -> columnName -> value
  metadata?: Record<string, any>;
}

export interface FeaturePresetsResponse {
  presets: FeaturePreset[];
}

// Quick Action Types
export interface QuickAction {
  id: string;
  name: string;
  prompt: string;
  description?: string;
  scope: 'global' | 'user';
  user_id?: number;
  position: number;
}

export interface QuickActionsResponse {
  actions: QuickAction[];
}

// Company Profile Types
export interface CompanyProfile {
  id: string;
  user_id: number;
  company_name: string;
  company_description?: string;
  business_focus: string;
  research_interests?: string;
  therapeutic_areas?: string;
  key_compounds?: string;
  pathways_of_interest?: string;
  competitive_landscape?: string;
  research_agent_role: string;
  analysis_focus?: string;
}


// Article Group Management Requests
export interface CreateArticleGroupRequest {
  name: string;
  description?: string;
  articles?: CanonicalResearchArticle[];
  feature_definitions?: FeatureDefinition[];
  search_context?: {
    query: string;
    provider: string;
    parameters: Record<string, any>;
  };
}

export interface UpdateArticleGroupRequest {
  name?: string;
  description?: string;
  feature_definitions?: FeatureDefinition[];
  articles?: CanonicalResearchArticle[];
  search_query?: string;
  search_provider?: string;
  search_params?: Record<string, any>;
}

export interface SaveToGroupRequest {
  group_name: string;
  group_description?: string;
  articles: CanonicalResearchArticle[];
  feature_definitions: FeatureDefinition[];
  search_query?: string;
  search_provider?: string;
  search_params?: Record<string, any>;
}

export interface AddArticlesRequest {
  articles: CanonicalResearchArticle[];
  extract_features?: boolean;
}

// Analysis Requests

export interface BatchExtractFeaturesRequest {
  article_ids: string[];
  feature_name: string;
  feature_type: 'boolean' | 'text' | 'score' | 'number';
  extraction_prompt: string;
}

export interface BatchUpdateMetadataRequest {
  metadata_updates: Record<string, Record<string, any>>; // article_id -> metadata
}

// Response Types
export interface ArticleGroupListResponse {
  groups: ArticleGroup[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface ArticleGroupResponse {
  group: ArticleGroupWithDetails;
  message?: string;
}

export interface ArticleGroupDetailResponse {
  group: ArticleGroupWithDetails;
}

export interface ArticleGroupSaveResponse {
  success: boolean;
  message: string;
  group_id: string;
  articles_saved: number;
}

export interface ArticleGroupDeleteResponse {
  success: boolean;
  message: string;
  deleted_group_id: string;
  deleted_articles_count: number;
}

export interface BatchOperationResponse {
  results: Record<string, any>;
  failures: Record<string, string>;
  summary: {
    total_requested: number;
    successful: number;
    failed: number;
  };
}

export class WorkbenchApi {

  // ================== GROUP MANAGEMENT ==================

  async getGroups(
    page: number = 1,
    limit: number = 20,
    search?: string
  ): Promise<ArticleGroupListResponse> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      ...(search && { search })
    });

    const response = await api.get(`/api/workbench/groups?${params}`);
    return response.data;
  }

  async createGroup(request: CreateArticleGroupRequest): Promise<ArticleGroup> {
    const response = await api.post('/api/workbench/groups', request);
    return response.data;
  }

  async getGroupDetails(groupId: string, page: number = 1, pageSize: number = 20): Promise<ArticleGroupWithDetails> {
    const params = new URLSearchParams({
      page: page.toString(),
      page_size: pageSize.toString()
    });
    const response = await api.get(`/api/workbench/groups/${groupId}?${params}`);
    return response.data.group; // Extract group from response wrapper
  }

  async updateGroup(groupId: string, request: UpdateArticleGroupRequest): Promise<ArticleGroup> {
    const response = await api.put(`/api/workbench/groups/${groupId}`, request);
    return response.data;
  }

  async deleteGroup(groupId: string): Promise<ArticleGroupDeleteResponse> {
    const response = await api.delete(`/api/workbench/groups/${groupId}`);
    return response.data;
  }

  async addArticlesToGroup(groupId: string, request: AddArticlesRequest): Promise<ArticleGroupSaveResponse> {
    const response = await api.post(`/api/workbench/groups/${groupId}/articles`, request);
    return response.data;
  }

  // ================== ANALYSIS OPERATIONS ==================

  // New unified extract method
  async extract(request: ExtractRequest): Promise<ExtractResponse> {
    const response = await api.post('/api/workbench/extract', request);
    return response.data;
  }

  // Alias for the new context
  async extractFeatures(request: ExtractRequest): Promise<ExtractResponse> {
    return this.extract(request);
  }

  // Get feature presets
  async getFeaturePresets(): Promise<FeaturePresetsResponse> {
    const response = await api.get('/api/workbench/feature-presets');
    return response.data;
  }

  // Create a new feature preset
  async createFeaturePreset(preset: Omit<FeaturePreset, 'id'>): Promise<FeaturePreset> {
    const response = await api.post('/api/workbench/feature-presets', preset);
    return response.data;
  }

  // Update an existing feature preset
  async updateFeaturePreset(id: string, preset: Omit<FeaturePreset, 'id'>): Promise<FeaturePreset> {
    const response = await api.put(`/api/workbench/feature-presets/${id}`, preset);
    return response.data;
  }

  // Delete a feature preset
  async deleteFeaturePreset(id: string): Promise<{ success: boolean; message: string }> {
    const response = await api.delete(`/api/workbench/feature-presets/${id}`);
    return response.data;
  }

  // Duplicate a feature preset
  async duplicateFeaturePreset(id: string, name?: string): Promise<FeaturePreset> {
    const params = name ? `?name=${encodeURIComponent(name)}` : '';
    const response = await api.post(`/api/workbench/feature-presets/${id}/duplicate${params}`);
    return response.data;
  }

  // ================== QUICK ACTIONS ==================

  // Get quick actions
  async getQuickActions(): Promise<QuickActionsResponse> {
    const response = await api.get('/api/workbench/quick-actions');
    return response.data;
  }

  // Create a new quick action
  async createQuickAction(action: {
    name: string;
    prompt: string;
    description?: string;
    position?: number;
  }): Promise<QuickAction> {
    const response = await api.post('/api/workbench/quick-actions', action);
    return response.data;
  }

  // Update an existing quick action
  async updateQuickAction(id: string, action: {
    name?: string;
    prompt?: string;
    description?: string;
    position?: number;
  }): Promise<QuickAction> {
    const response = await api.put(`/api/workbench/quick-actions/${id}`, action);
    return response.data;
  }

  // Delete a quick action
  async deleteQuickAction(id: string): Promise<{ success: boolean; message: string }> {
    const response = await api.delete(`/api/workbench/quick-actions/${id}`);
    return response.data;
  }

  // Duplicate a quick action
  async duplicateQuickAction(id: string, name?: string): Promise<QuickAction> {
    const params = name ? `?name=${encodeURIComponent(name)}` : '';
    const response = await api.post(`/api/workbench/quick-actions/${id}/duplicate${params}`);
    return response.data;
  }

  // ================== COMPANY PROFILE ==================

  // Get company profile
  async getCompanyProfile(): Promise<CompanyProfile> {
    const response = await api.get('/api/workbench/company-profile');
    return response.data;
  }

  // Update company profile
  async updateCompanyProfile(profile: Partial<Omit<CompanyProfile, 'id' | 'user_id'>>): Promise<CompanyProfile> {
    const response = await api.put('/api/workbench/company-profile', profile);
    return response.data;
  }

  // ================== UNIFIED CANONICAL STUDY API ==================

  // Get complete canonical study representation (archetype + ER graph)
  async getCanonicalStudy(groupId: string, articleId: string): Promise<CanonicalStudyRepresentation> {
    const response = await api.get(`/api/workbench/groups/${groupId}/articles/${articleId}/canonical-study`);
    return response.data;
  }

  // Save complete canonical study representation (archetype + ER graph)
  async saveCanonicalStudy(
    groupId: string,
    articleId: string,
    data: SaveCanonicalStudyRequest
  ): Promise<SaveCanonicalStudyResponse> {
    const response = await api.put(`/api/workbench/groups/${groupId}/articles/${articleId}/canonical-study`, data);
    return response.data;
  }

  // Stage 1: Extract study archetype in natural language
  async extractArticleArchtype(request: {
    article_id: string;
    title: string;
    abstract: string;
    full_text?: string | null;
  }): Promise<ArticleArchetypeResponse> {
    const response = await api.post('/api/extraction/extract-article-archtype', request);
    return response.data;
  }

  // Stage 2: Convert archetype to ER graph
  async archetypeToErGraph(request: { article_id: string; archetype: string; study_type?: string; pattern_id?: string }): Promise<EntityExtractionResponse> {
    const response = await api.post('/api/extraction/archetype-to-er-graph', request);
    return response.data;
  }

  // ================== INDIVIDUAL ARTICLE RESEARCH ==================

  async getGroupDetail(groupId: string, articleId: string): Promise<{
    article: CanonicalResearchArticle;
    notes: string;
    feature_data: Record<string, any>;
    metadata: Record<string, any>;
    position?: number;
    group_id: string;
    group_name: string;
    created_at: string;
    updated_at?: string;
  }> {
    const response = await api.get(`/api/workbench/groups/${groupId}/articles/${articleId}`);
    return response.data;
  }

  async updateNotes(groupId: string, articleId: string, notes: string): Promise<{ notes: string; updated_at: string }> {
    const response = await api.put(`/api/workbench/groups/${groupId}/articles/${articleId}/notes`, {
      notes
    });
    return response.data;
  }

  async updateMetadata(groupId: string, articleId: string, metadata: Record<string, any>): Promise<{ metadata: Record<string, any>; updated_at: string }> {
    const response = await api.put(`/api/workbench/groups/${groupId}/articles/${articleId}/metadata`, {
      metadata
    });
    return response.data;
  }

  // ================== BATCH OPERATIONS ==================

  async batchExtractFeatures(groupId: string, request: BatchExtractFeaturesRequest): Promise<BatchOperationResponse> {
    const response = await api.post(`/api/workbench/groups/${groupId}/batch/extract-features`, request);
    return response.data;
  }

  async batchUpdateMetadata(groupId: string, request: BatchUpdateMetadataRequest): Promise<BatchOperationResponse> {
    const response = await api.put(`/api/workbench/groups/${groupId}/batch/metadata`, request);
    return response.data;
  }

  // ================== UTILITY METHODS ==================

  /**
   * Convert articles to extraction format for analysis operations
   */
  convertArticlesForExtraction(articles: any[]): Array<{ id: string, title: string, abstract: string }> {
    return articles.map(article => ({
      id: article.id,
      title: article.title || '',
      abstract: article.abstract || ''
    }));
  }

  /**
   * Export articles and data as CSV
   */
  exportAsCSV(articles: any[], features: any[], filename: string = 'workbench-data.csv'): void {
    // Create headers
    const headers = ['ID', 'Title', 'Authors', 'Journal', 'Year', 'URL'];
    features.forEach(feature => headers.push(feature.name));

    // Create rows
    const rows = articles.map(article => {
      const row = [
        article.id || '',
        article.title || '',
        (article.authors || []).join('; '),
        article.journal || '',
        article.publication_year || article.year || '',
        article.url || ''
      ];

      // Add column data
      features.forEach(feature => {
        row.push(feature.data[article.id] || '');
      });

      return row;
    });

    // Convert to CSV
    const csvContent = [headers, ...rows]
      .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
      .join('\\n');

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }
}

// Export singleton instance
export const workbenchApi = new WorkbenchApi();

// Legacy exports for backward compatibility
export {
  workbenchApi as articleGroupApi,
  workbenchApi as articleWorkbenchApi
};