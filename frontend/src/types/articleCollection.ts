/**
 * Unified Article Collection Types
 * 
 * Implements the unified collection model from the Article-Group Data Architecture.
 * A search result IS a group - both are containers for articles with metadata and features.
 */

import { CanonicalResearchArticle } from './canonical_types';
import { FeatureDefinition, ArticleGroupDetail, ArticleGroupWithDetails } from './workbench';
import { generateUUID } from '@/lib/utils/uuid';

// ================== COLLECTION MODEL ==================

export enum CollectionSource {
  SEARCH = 'search',        // From search API
  SAVED_GROUP = 'saved',    // From saved group API  
  MODIFIED = 'modified'     // Edited/filtered from original
}

export interface SearchParams {
  query: string;
  filters: Record<string, any>;
  page: number;
  page_size: number;
  provider?: string;
  sort_by?: 'relevance' | 'date';
  year_low?: number;
  year_high?: number;
  date_from?: string;
  date_to?: string;
  date_type?: 'completion' | 'publication' | 'entry' | 'revised';
  include_citations?: boolean;
  include_pdf_links?: boolean;
}

export interface ArticleCollection {
  // Identity
  id: string;                                    // UUID for all collections
  source: CollectionSource;                      // How this collection was created
  name: string;                                  // Display name
  description?: string;                          // Optional description
  
  // Articles with contextual data
  articles: ArticleGroupDetail[];                // Always wrapped, may have empty features
  
  // Feature definitions  
  feature_definitions: FeatureDefinition[];      // What features this collection extracts
  
  // Source metadata
  search_params?: SearchParams;                  // If source=SEARCH
  saved_group_id?: string;                       // If source=SAVED_GROUP  
  parent_collection_id?: string;                 // If source=MODIFIED
  
  // State
  is_saved: boolean;                            // Whether persisted to backend
  is_modified: boolean;                         // Whether changed since load/create
  created_at: string;
  updated_at: string;
}

// ================== COLLECTION ACTIONS ==================

export type CollectionAction = 
  | 'extract_features' 
  | 'export_csv' 
  | 'filter_articles'
  | 'save_as_group' 
  | 'refine_search'
  | 'save_changes' 
  | 'revert_changes'
  | 'duplicate_group' 
  | 'delete_group'
  | 'save_as_new_group' 
  | 'apply_to_parent';

export function getCollectionActions(collection: ArticleCollection): CollectionAction[] {
  const actions: CollectionAction[] = [];
  
  // Always available
  actions.push('extract_features', 'export_csv', 'filter_articles');
  
  // Source-specific actions
  switch (collection.source) {
    case CollectionSource.SEARCH:
      actions.push('save_as_group', 'refine_search');
      break;
      
    case CollectionSource.SAVED_GROUP:
      if (collection.is_modified) {
        actions.push('save_changes', 'revert_changes');
      }
      actions.push('duplicate_group', 'delete_group');
      break;
      
    case CollectionSource.MODIFIED:
      actions.push('save_as_new_group', 'apply_to_parent');
      break;
  }
  
  return actions;
}

// ================== UTILITY FUNCTIONS ==================

export function createSearchCollection(
  articles: CanonicalResearchArticle[], 
  searchParams: SearchParams
): ArticleCollection {
  const now = new Date().toISOString();
  
  return {
    id: generateUUID(),
    source: CollectionSource.SEARCH,
    name: `Search: "${searchParams.query}"`,
    articles: articles.map(article => ({
      id: generateUUID(),
      article_id: article.id,
      group_id: '',
      article: article,
      feature_data: {},
      added_at: now
    })),
    feature_definitions: [],
    search_params: searchParams,
    is_saved: false,
    is_modified: false,
    created_at: now,
    updated_at: now
  };
}

export function createSavedGroupCollection(group: ArticleGroupWithDetails): ArticleCollection {
  // Convert feature definitions from backend format to frontend format
  const modernFeatureDefinitions = (group.feature_definitions || []).map((feature: any) => ({
    id: feature.id,
    name: feature.name,
    description: feature.description,
    type: feature.type,
    options: feature.options
  }));

  // Process articles - the backend sends them with feature_data and notes already embedded
  const articles = (group.articles || []).map((articleItem: any) => ({
    id: articleItem.id,
    article_id: articleItem.article_id,
    group_id: articleItem.group_id,
    article: articleItem.article,
    feature_data: articleItem.feature_data || {},
    notes: articleItem.notes,
    position: articleItem.position,
    added_at: articleItem.added_at
  }));

  return {
    id: group.id,
    source: CollectionSource.SAVED_GROUP,
    name: group.name,
    description: group.description,
    articles: articles,
    feature_definitions: modernFeatureDefinitions,
    saved_group_id: group.id,
    is_saved: true,
    is_modified: false,
    created_at: group.created_at,
    updated_at: group.updated_at
  };
}

export function createModifiedCollection(
  originalCollection: ArticleCollection, 
  modifiedArticles: ArticleGroupDetail[]
): ArticleCollection {
  const now = new Date().toISOString();
  
  return {
    ...originalCollection,
    id: generateUUID(),
    source: CollectionSource.MODIFIED,
    name: `${originalCollection.name} (modified)`,
    articles: modifiedArticles,
    parent_collection_id: originalCollection.id,
    is_saved: false,
    is_modified: true,
    updated_at: now
  };
}