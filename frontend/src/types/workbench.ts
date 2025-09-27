/**
 * Workbench Core Types
 * 
 * Core business object types for the workbench functionality
 * These must align exactly with the backend schemas in workbench.py
 */

import { CanonicalResearchArticle } from './canonical_types';

// ================== FEATURE METADATA AND DATA STRUCTURES ==================

export interface FeatureDefinition {
  id: string;              // Stable UUID for feature identification
  name: string;            // Feature display name
  description: string;     // Feature description for LLM extraction
  type: 'boolean' | 'text' | 'score';
  options?: Record<string, any>;  // Feature options (e.g., min/max for score)
}

// ================== ARTICLE GROUP STRUCTURES ==================

export interface ArticleGroupDetail {
  id: string;                              // Unique detail record ID
  article_id: string;                      // Article ID
  group_id: string;                        // Group ID
  article: CanonicalResearchArticle;       // The article data
  feature_data: Record<string, any>;       // Extracted feature data keyed by feature.id
  notes?: string;                          // Article-specific notes
  position?: number;                       // Position in the group
  added_at: string;                        // When article was added to group
}

export interface ArticleGroupWithDetails {
  id: string;                              // Group ID
  name: string;                            // Group name
  description?: string;                    // Group description
  article_count: number;                   // Number of articles in group
  feature_definitions: FeatureDefinition[]; // Feature definitions
  search_context?: Record<string, any>;    // Search context
  created_at: string;                      // Creation timestamp
  updated_at: string;                      // Last update timestamp
  articles: ArticleGroupDetail[];          // Articles with feature data
  pagination?: {                           // Pagination metadata (optional for backward compatibility)
    current_page: number;
    total_pages: number;
    total_results: number;
    page_size: number;
  };
}

export interface ArticleGroup {
  id: string;                              // Group ID
  user_id: number;                         // Owner user ID
  name: string;                            // Group name
  description?: string;                    // Group description
  search_query?: string;                   // Search query used
  search_provider?: string;                // Search provider used
  search_params?: Record<string, any>;     // Search parameters
  feature_definitions: FeatureDefinition[]; // Feature definitions
  article_count: number;                   // Number of articles in group
  created_at: string;                      // Creation timestamp
  updated_at: string;                      // Last update timestamp
}

// ================== FRONTEND-ONLY TYPES ==================

// Summary info for group listings
export interface ArticleGroupSummary {
  id: string;
  name: string;
  description?: string;
  article_count: number;
  feature_count: number;
  created_at: string;
  updated_at: string;
  search_provider?: string;
}

// Lightweight article preview for performance
export interface ArticlePreview {
  id: string;
  title: string;
  authors: string[];
  publication_year?: number;
  journal?: string;
  feature_data?: Record<string, any>;
}

// Individual article research data (deep dive mode) - DEPRECATED
// Use ArticleGroupDetail instead for consistent data structure

export interface ExtractedFeature {
  name: string;
  value: any;
  type: 'boolean' | 'text' | 'score' | 'number';
  extracted_at: string;
  extraction_method: 'ai' | 'manual' | 'computed';
  confidence?: number;
}

export interface WorkbenchMetadata {
  tags: string[];
  rating?: number;
  status?: 'unread' | 'read' | 'reviewing' | 'completed';
  priority?: 'low' | 'medium' | 'high';
  custom_fields?: Record<string, any>;
}

// Analysis preset configurations
export interface AnalysisPreset {
  id: string;
  name: string;
  description: string;
  features: FeatureDefinition[];
  is_default?: boolean;
  created_by?: string;
}