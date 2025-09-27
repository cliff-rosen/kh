/**
 * WorkbenchContext - Unified state management for article collections
 * 
 * Implements the unified collection model where search results and saved groups
 * are both treated as ArticleCollections with different sources and states.
 */

import React, { createContext, useContext, useState, useCallback } from 'react';

import {
  ArticleCollection,
  CollectionSource,
  createSearchCollection,
  createSavedGroupCollection,
  SearchParams
} from '@/types/articleCollection';
import { FeatureDefinition, ArticleGroupDetail, ArticleGroup } from '@/types/workbench';
import { SearchProvider } from '@/types/unifiedSearch';

import { unifiedSearchApi } from '@/lib/api/unifiedSearchApi';
import { workbenchApi } from '@/lib/api/workbenchApi';
import { generatePrefixedUUID } from '@/lib/utils/uuid';

// ================== STATE INTERFACE ==================

interface WorkbenchState {
  // DUAL COLLECTION STATE
  searchCollection: ArticleCollection | null;   // Search results collection
  groupCollection: ArticleCollection | null;    // Loaded group collection (paginated view)
  fullGroupArticles: ArticleGroupDetail[] | null; // All articles in the group for client-side pagination
  collectionLoading: boolean;

  // GROUPS LIST STATE
  groupsList: ArticleGroup[];
  groupsListLoading: boolean;

  // SEARCH STATE
  searchQuery: string;
  selectedProviders: SearchProvider[];
  searchMode: 'single' | 'multi';
  searchParams: {
    pageSize: number;
    sortBy: 'relevance' | 'date';
    yearLow?: number;
    yearHigh?: number;
    dateFrom?: string;
    dateTo?: string;
    dateType: 'completion' | 'publication' | 'entry' | 'revised';
    includeCitations: boolean;
    includePdfLinks: boolean;
  };

  groupParams: {
    pageSize: number;
  };

  // PAGINATION STATE
  searchPagination: {
    currentPage: number;
    totalPages: number;
    totalResults: number;
    pageSize: number;
  } | null;

  groupPagination: {
    currentPage: number;
    totalPages: number;
    totalResults: number;
    pageSize: number;
  } | null;

  // UI STATE  
  selectedArticleIds: Set<string>;               // For operations on articles
  selectedArticleDetail: ArticleGroupDetail | null;  // For detail view

  // Feature extraction state
  isExtracting: boolean;
  extractionProgress?: {
    current: number;
    total: number;
    currentArticle?: string;
  };

  // Error state
  error: string | null;
}

// ================== ACTIONS INTERFACE ==================

interface WorkbenchActions {
  // Search Operations (affects searchCollection)
  fetchSearchCollection: (page?: number) => Promise<import('@/lib/api/unifiedSearchApi').UnifiedSearchResponse | undefined>;
  updateSearchQuery: (query: string) => void;
  updateSearchProviders: (providers: SearchProvider[]) => void;
  updateSearchMode: (mode: 'single' | 'multi') => void;
  updateSearchParams: (params: Partial<WorkbenchState['searchParams']>) => void;
  clearSearchResults: () => void;

  // Group Loading Operations (affects groupCollection)  
  fetchGroupCollection: (groupId: string, page?: number) => Promise<void>;
  updateGroupPaginationParams: (params: Partial<WorkbenchState['groupParams']>) => void;
  setGroupPage: (page: number) => void;

  // Backend Group Management (affects backend + groupsList)
  createGroupFromCollection: (name: string, description?: string, collectionType?: 'search' | 'group', selectedArticleIds?: string[]) => Promise<string>;
  addArticlesToExistingGroup: (groupId: string, articleIds?: string[], collectionType?: 'search' | 'group') => Promise<{ articlesAdded: number; duplicatesSkipped: number }>;
  updateGroupMetadata: (groupId: string, name: string, description?: string) => Promise<void>;
  deleteGroupPermanently: (groupId: string) => Promise<void>;
  fetchCachedGroupsList: () => Promise<ArticleGroup[]>;
  refreshGroupsList: () => Promise<ArticleGroup[]>;

  // Collection State Sync (affects current collection + backend)
  updateGroupFromCollection: (collectionType?: 'search' | 'group') => Promise<void>;
  deleteCurrentCollection: (collectionType?: 'search' | 'group') => Promise<void>;

  // Collection Getters
  getActiveCollection: (tab: 'search' | 'groups') => ArticleCollection | null;

  // Local Collection Modifications (FE state only)
  removeArticlesFromCollection: (articleIds: string[], collectionType?: 'search' | 'group') => void;
  reorderArticleInCollection: (articleId: string, newPosition: number, collectionType?: 'search' | 'group') => void;

  // Feature Operations (local state + optional API calls)
  addFeatureDefinitionsLocal: (features: FeatureDefinition[], collectionType?: 'search' | 'group') => void;
  addFeaturesAndExtract: (features: FeatureDefinition[], collectionType?: 'search' | 'group', targetArticleIds?: string[]) => Promise<void>;
  removeFeatureDefinition: (featureId: string, collectionType?: 'search' | 'group') => void;
  extractFeatureValues: (featureIds?: string[], collectionType?: 'search' | 'group', targetArticleIds?: string[]) => Promise<void>;
  updateFeatureValueLocal: (articleId: string, featureId: string, value: any, collectionType?: 'search' | 'group') => void;

  // Article Data Operations (local state + backend sync)
  updateArticleNotes: (articleId: string, notes: string, collectionType?: 'search' | 'group') => Promise<void>;

  // Selection Management (UI state only)
  selectArticleDetail: (articleDetail: ArticleGroupDetail | null) => void;
  toggleArticleSelection: (articleId: string) => void;
  selectAllArticlesInView: () => void;
  clearArticleSelection: () => void;

  // Utility Actions
  exportActiveCollection: (format: 'csv' | 'json', collectionType?: 'search' | 'group') => Promise<void>;
  copyCollectionToClipboard: (format: 'csv' | 'json' | 'text', collectionType?: 'search' | 'group') => Promise<void>;
  clearError: () => void;
  resetAllWorkbenchState: () => void;
}

// ================== CONTEXT ==================

interface WorkbenchContextType extends WorkbenchState, WorkbenchActions { }

const WorkbenchContext = createContext<WorkbenchContextType | undefined>(undefined);

// ================== PROVIDER COMPONENT ==================

interface WorkbenchProviderProps {
  children: React.ReactNode;
}

export function WorkbenchProvider({ children }: WorkbenchProviderProps) {
  // State
  const [searchCollection, setSearchCollection] = useState<ArticleCollection | null>(null);
  const [groupCollection, setGroupCollection] = useState<ArticleCollection | null>(null);
  const [fullGroupArticles, setFullGroupArticles] = useState<ArticleGroupDetail[] | null>(null);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [groupsList, setGroupsList] = useState<ArticleGroup[]>([]);
  const [groupsListLoading, setGroupsListLoading] = useState(false);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProviders, setSelectedProviders] = useState<SearchProvider[]>(['pubmed']);
  const [searchMode, setSearchMode] = useState<'single' | 'multi'>('single');
  const [searchParams, setSearchParams] = useState<WorkbenchState['searchParams']>({
    pageSize: 20,
    sortBy: 'relevance',
    yearLow: undefined,
    yearHigh: undefined,
    dateFrom: undefined,
    dateTo: undefined,
    dateType: 'publication',
    includeCitations: false,
    includePdfLinks: false
  });

  const [groupParams, setGroupParams] = useState<WorkbenchState['groupParams']>({
    pageSize: 50
  });

  const [searchPagination, setSearchPagination] = useState<WorkbenchState['searchPagination']>(null);
  const [groupPagination, setGroupPagination] = useState<WorkbenchState['groupPagination']>(null);
  const [selectedArticleIds, setSelectedArticleIds] = useState<Set<string>>(new Set());
  const [selectedArticleDetail, setSelectedArticleDetail] = useState<ArticleGroupDetail | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState<WorkbenchState['extractionProgress']>();
  const [error, setError] = useState<string | null>(null);

  // ================== SEARCH STATE MANAGEMENT ==================

  const updateSearchQuery = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const updateSearchProviders = useCallback((providers: SearchProvider[]) => {
    setSelectedProviders(providers);
  }, []);

  const updateSearchMode = useCallback((mode: 'single' | 'multi') => {
    setSearchMode(mode);
  }, []);

  const updateSearchParams = useCallback((params: Partial<WorkbenchState['searchParams']>) => {
    setSearchParams(prev => ({ ...prev, ...params }));
  }, []);

  const updateGroupPaginationParams = useCallback((params: Partial<WorkbenchState['groupParams']>) => {
    setGroupParams(prev => ({ ...prev, ...params }));
  }, []);

  // ================== COLLECTION GETTERS ==================

  const getActiveCollection = useCallback((tab: 'search' | 'groups'): ArticleCollection | null => {
    if (tab === 'search') {
      return searchCollection;
    } else {
      return groupCollection;
    }
  }, [searchCollection, groupCollection]);

  // ================== COLLECTION MANAGEMENT ==================

  const fetchSearchCollection = useCallback(async (page: number = 1) => {
    if (!searchQuery.trim()) {
      setError('Please enter a search query');
      return;
    }
    setCollectionLoading(true);
    setError(null);

    try {
      const searchResult = await unifiedSearchApi.search({
        query: searchQuery,
        provider: selectedProviders[0] || 'pubmed',
        page: page,
        page_size: searchParams.pageSize,
        sort_by: searchParams.sortBy,
        year_low: searchParams.yearLow,
        year_high: searchParams.yearHigh,
        date_from: searchParams.dateFrom,
        date_to: searchParams.dateTo,
        date_type: searchParams.dateType,
        include_citations: searchParams.includeCitations,
        include_pdf_links: searchParams.includePdfLinks
      });

      const searchParamsForCollection: SearchParams = {
        query: searchQuery,
        filters: {},
        page: page,
        page_size: searchParams.pageSize,
        provider: selectedProviders[0] || 'pubmed',
        sort_by: searchParams.sortBy,
        year_low: searchParams.yearLow,
        year_high: searchParams.yearHigh,
        date_from: searchParams.dateFrom,
        date_to: searchParams.dateTo,
        date_type: searchParams.dateType,
        include_citations: searchParams.includeCitations,
        include_pdf_links: searchParams.includePdfLinks
      };

      const collection = createSearchCollection(searchResult.articles, searchParamsForCollection);
      setSearchCollection(collection);

      // Update pagination state from metadata
      if (searchResult.metadata) {
        setSearchPagination({
          currentPage: searchResult.metadata.current_page || page,
          totalPages: searchResult.metadata.total_pages || 1,
          totalResults: searchResult.metadata.total_results || searchResult.articles.length,
          pageSize: searchResult.metadata.page_size || searchParams.pageSize
        });
      } else {
        // Fallback for responses without metadata
        setSearchPagination({
          currentPage: page,
          totalPages: 1,
          totalResults: searchResult.articles.length,
          pageSize: searchParams.pageSize
        });
      }

      setSelectedArticleIds(new Set());
      setSelectedArticleDetail(null);

      // Return the search result for the caller to use
      return searchResult;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      console.error('Search error:', err);
      throw err;
    } finally {
      setCollectionLoading(false);
    }
  }, [searchQuery, selectedProviders, searchParams]);

  const fetchGroupCollection = useCallback(async (groupId: string, page: number = 1) => {
    setCollectionLoading(true);
    setError(null);

    try {
      // Load ALL articles for client-side pagination
      // Use a very large page size to get everything in one request
      const group = await workbenchApi.getGroupDetails(groupId, 1, 10000);

      const fullCollection = createSavedGroupCollection(group);

      // Store the full articles list
      setFullGroupArticles(fullCollection.articles);

      // Create paginated view
      const pageSize = groupParams.pageSize;
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedArticles = fullCollection.articles.slice(startIndex, endIndex);

      // Create paginated collection
      const paginatedCollection: ArticleCollection = {
        ...fullCollection,
        articles: paginatedArticles
      };

      setGroupCollection(paginatedCollection);
      setSearchPagination(null); // Clear search pagination

      // Set client-side pagination based on full dataset
      const totalArticles = fullCollection.articles.length;
      setGroupPagination({
        currentPage: page,
        totalPages: Math.ceil(totalArticles / pageSize),
        totalResults: totalArticles,
        pageSize: pageSize
      });

      setSelectedArticleIds(new Set());
      setSelectedArticleDetail(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load group');
      console.error('Load group error:', err);
    } finally {
      setCollectionLoading(false);
    }
  }, [groupParams.pageSize]);

  const setGroupPage = useCallback((page: number) => {
    if (!fullGroupArticles || !groupCollection) return;

    const pageSize = groupParams.pageSize;
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedArticles = fullGroupArticles.slice(startIndex, endIndex);

    // Create new paginated collection
    const paginatedCollection: ArticleCollection = {
      ...groupCollection,
      articles: paginatedArticles
    };

    setGroupCollection(paginatedCollection);

    // Update pagination state
    setGroupPagination({
      currentPage: page,
      totalPages: Math.ceil(fullGroupArticles.length / pageSize),
      totalResults: fullGroupArticles.length,
      pageSize: pageSize
    });
  }, [fullGroupArticles, groupCollection, groupParams.pageSize]);

  const fetchCachedGroupsList = useCallback(async () => {
    // Return cached groups list for backward compatibility
    return groupsList;
  }, [groupsList]);

  const refreshGroupsList = useCallback(async () => {
    setGroupsListLoading(true);
    try {
      const response = await workbenchApi.getGroups(1, 100); // Get first 100 groups
      setGroupsList(response.groups);
      return response.groups;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load groups');
      console.error('Load groups error:', err);
      return [];
    } finally {
      setGroupsListLoading(false);
    }
  }, []);

  const createGroupFromCollection = useCallback(async (name: string, description?: string, collectionType: 'search' | 'group' = 'search', selectedArticleIds?: string[]): Promise<string> => {
    const currentCollection = collectionType === 'search' ? searchCollection : groupCollection;
    if (!currentCollection) throw new Error('No collection to save');

    setCollectionLoading(true);
    setError(null);

    try {
      // Use selected articles if provided, otherwise use all articles
      let articlesToSave;
      if (selectedArticleIds && selectedArticleIds.length > 0) {
        // For selected articles, filter from the current collection's articles
        articlesToSave = currentCollection.articles
          .filter(item => selectedArticleIds.includes(item.article.id))
          .map(item => ({
            ...item.article,
            extracted_features: item.feature_data || {}
          }));
      } else {
        // For groups, use all articles (fullGroupArticles) not just current page
        if (collectionType === 'group' && fullGroupArticles && fullGroupArticles.length > 0) {
          articlesToSave = fullGroupArticles.map(item => ({
            ...item.article,
            extracted_features: item.feature_data || {}
          }));
        } else {
          // For search collections or when fullGroupArticles is not available, use current page
          articlesToSave = currentCollection.articles.map(item => ({
            ...item.article,
            extracted_features: item.feature_data || {}
          }));
        }
      }

      const savedGroup = await workbenchApi.createGroup({
        name,
        description,
        articles: articlesToSave,
        feature_definitions: currentCollection.feature_definitions,
        search_context: {
          query: currentCollection.search_params?.query || '',
          provider: currentCollection.search_params?.provider || 'pubmed',
          parameters: currentCollection.search_params?.filters || {}
        }
      });

      // Update the appropriate collection to reflect saved state
      const updatedCollection = {
        ...currentCollection,
        id: savedGroup.id,
        source: CollectionSource.SAVED_GROUP,
        name: savedGroup.name,
        saved_group_id: savedGroup.id,
        is_saved: true,
        is_modified: false,
        updated_at: new Date().toISOString()
      };

      if (collectionType === 'search') {
        setSearchCollection(updatedCollection);
      } else {
        setGroupCollection(updatedCollection);
      }

      // Refresh groups list after successful save
      await refreshGroupsList();

      // Return the saved group ID
      return savedGroup.id;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save collection');
      console.error('Save collection error:', err);
      throw err;
    } finally {
      setCollectionLoading(false);
    }
  }, [searchCollection, groupCollection, fullGroupArticles, refreshGroupsList]);

  const addArticlesToExistingGroup = useCallback(async (groupId: string, articleIds?: string[], collectionType: 'search' | 'group' = 'search'): Promise<{ articlesAdded: number; duplicatesSkipped: number }> => {
    const currentCollection = collectionType === 'search' ? searchCollection : groupCollection;
    if (!currentCollection) throw new Error('No collection available');

    setCollectionLoading(true);
    setError(null);

    try {
      // Get articles to add - either specified IDs or all articles
      let articlesToAdd;
      if (articleIds && articleIds.length > 0) {
        articlesToAdd = currentCollection.articles
          .filter(item => articleIds.includes(item.article.id))
          .map(item => ({
            ...item.article,
            extracted_features: item.feature_data || {}
          }));
      } else {
        // For groups, use all articles (fullGroupArticles) not just current page
        if (collectionType === 'group' && fullGroupArticles && fullGroupArticles.length > 0) {
          articlesToAdd = fullGroupArticles.map(item => ({
            ...item.article,
            extracted_features: item.feature_data || {}
          }));
        } else {
          // For search collections or when fullGroupArticles is not available, use current page
          articlesToAdd = currentCollection.articles.map(item => ({
            ...item.article,
            extracted_features: item.feature_data || {}
          }));
        }
      }

      const response = await workbenchApi.addArticlesToGroup(groupId, {
        articles: articlesToAdd,
        extract_features: false // Don't auto-extract when adding to existing group
      });

      // Load the updated group to reflect the changes
      await fetchGroupCollection(groupId);

      // Refresh groups list to reflect updated article count
      await refreshGroupsList();

      // Return the counts from the API response
      return {
        articlesAdded: response.articles_saved || 0,
        duplicatesSkipped: (response as any).duplicates_skipped || 0
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add to existing group');
      console.error('Add to group error:', err);
      throw err;
    } finally {
      setCollectionLoading(false);
    }
  }, [searchCollection, groupCollection, fullGroupArticles, fetchGroupCollection, refreshGroupsList]);

  const updateGroupFromCollection = useCallback(async (collectionType: 'search' | 'group' = 'group') => {
    const currentCollection = collectionType === 'search' ? searchCollection : groupCollection;
    if (!currentCollection || !currentCollection.saved_group_id) return;

    setCollectionLoading(true);
    setError(null);

    try {
      // Use the elegant unified update API - pass articles to trigger full state synchronization
      // Important: Use ALL articles, not just the current page
      const articlesToSave = collectionType === 'group' && fullGroupArticles
        ? fullGroupArticles
        : currentCollection.articles;

      const articlesWithFeatures = articlesToSave.map(item => {
        console.log(`DEBUG: Article ${item.article.id} feature_data:`, item.feature_data);

        // Create a copy of the article and add extracted_features from feature_data
        const articleWithFeatures = {
          ...item.article,
          extracted_features: item.feature_data || {}
        };

        console.log(`DEBUG: Article ${item.article.id} extracted_features being sent:`, articleWithFeatures.extracted_features);

        return articleWithFeatures;
      });

      await workbenchApi.updateGroup(currentCollection.saved_group_id, {
        name: currentCollection.name,
        description: currentCollection.description,
        feature_definitions: currentCollection.feature_definitions,
        articles: articlesWithFeatures,
        search_query: currentCollection.search_params?.query,
        search_provider: currentCollection.search_params?.provider,
        search_params: currentCollection.search_params?.filters || {}
      });

      const updatedCollection = {
        ...currentCollection,
        is_modified: false,
        updated_at: new Date().toISOString()
      };

      if (collectionType === 'search') {
        setSearchCollection(updatedCollection);
      } else {
        setGroupCollection(updatedCollection);
      }

      // Refresh groups list to reflect changes
      await refreshGroupsList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
      console.error('Save changes error:', err);
    } finally {
      setCollectionLoading(false);
    }
  }, [searchCollection, groupCollection, fullGroupArticles, refreshGroupsList]);

  const deleteCurrentCollection = useCallback(async (collectionType: 'search' | 'group' = 'group') => {
    const currentCollection = collectionType === 'search' ? searchCollection : groupCollection;
    if (!currentCollection || !currentCollection.saved_group_id) return;

    if (!confirm('Are you sure you want to delete this collection?')) return;

    setCollectionLoading(true);
    setError(null);

    try {
      await workbenchApi.deleteGroup(currentCollection.saved_group_id);

      if (collectionType === 'search') {
        setSearchCollection(null);
      } else {
        setGroupCollection(null);
      }

      setSelectedArticleIds(new Set());
      setSelectedArticleDetail(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete collection');
      console.error('Delete collection error:', err);
    } finally {
      setCollectionLoading(false);
    }
  }, [searchCollection, groupCollection]);

  const deleteGroupPermanently = useCallback(async (groupId: string) => {
    setCollectionLoading(true);
    setError(null);

    try {
      await workbenchApi.deleteGroup(groupId);

      // Clear the group collection if it matches the deleted group
      if (groupCollection && groupCollection.saved_group_id === groupId) {
        setGroupCollection(null);
      }

      setSelectedArticleIds(new Set());
      setSelectedArticleDetail(null);

      // Refresh groups list to reflect deletion
      await refreshGroupsList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete group');
      console.error('Delete group error:', err);
      throw err; // Re-throw for caller to handle
    } finally {
      setCollectionLoading(false);
    }
  }, [groupCollection, refreshGroupsList]);

  const updateGroupMetadata = useCallback(async (groupId: string, name: string, description?: string) => {
    setCollectionLoading(true);
    setError(null);

    try {
      await workbenchApi.updateGroup(groupId, {
        name,
        description
      });

      // Update the appropriate collection with new name/description
      const updateCollection = (collection: ArticleCollection | null): ArticleCollection | null => {
        if (collection && collection.saved_group_id === groupId) {
          return {
            ...collection,
            name,
            description,
            is_modified: false, // Reset modified flag after successful update
            updated_at: new Date().toISOString()
          };
        }
        return collection;
      };

      setSearchCollection(prevCollection => updateCollection(prevCollection));
      setGroupCollection(prevCollection => updateCollection(prevCollection));

      // Refresh groups list to reflect updated info
      await refreshGroupsList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update group info');
      console.error('Update group info error:', err);
      throw err; // Re-throw for caller to handle
    } finally {
      setCollectionLoading(false);
    }
  }, [refreshGroupsList]);

  const updateArticleNotes = useCallback(async (
    articleId: string,
    notes: string,
    collectionType: 'search' | 'group' = 'group'
  ) => {
    const currentCollection = collectionType === 'search' ? searchCollection : groupCollection;
    if (!currentCollection || !currentCollection.saved_group_id) {
      throw new Error('Cannot update notes: collection not saved');
    }

    try {
      // Update backend first
      await workbenchApi.updateNotes(currentCollection.saved_group_id, articleId, notes);

      // Update local collection state
      const updateArticleNotes = (articles: ArticleGroupDetail[]) =>
        articles.map(article =>
          article.article.id === articleId
            ? { ...article, notes }
            : article
        );

      const updatedCollection = {
        ...currentCollection,
        articles: updateArticleNotes(currentCollection.articles),
        is_modified: true,
        updated_at: new Date().toISOString()
      };

      if (collectionType === 'search') {
        setSearchCollection(updatedCollection);
      } else {
        setGroupCollection(updatedCollection);

        // Also update fullGroupArticles if they exist
        if (fullGroupArticles) {
          setFullGroupArticles(updateArticleNotes(fullGroupArticles));
        }
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to update notes');
      throw error;
    }
  }, [searchCollection, groupCollection, fullGroupArticles]);


  // ================== COLLECTION MODIFICATION ==================

  const removeArticlesFromCollection = useCallback((articleIds: string[], collectionType: 'search' | 'group' = 'search') => {
    const currentCollection = collectionType === 'search' ? searchCollection : groupCollection;
    if (!currentCollection) return;

    const idSet = new Set(articleIds);

    if (collectionType === 'search') {
      const filteredArticles = currentCollection.articles.filter(
        a => !idSet.has(a.article_id)
      );

      const updatedCollection = {
        ...currentCollection,
        articles: filteredArticles,
        is_modified: true,
        updated_at: new Date().toISOString()
      };

      setSearchCollection(updatedCollection);
    } else {
      // For groups, update both fullGroupArticles and the paginated view
      if (!fullGroupArticles) return;

      const filteredFullArticles = fullGroupArticles.filter(
        a => !idSet.has(a.article.id)
      );

      setFullGroupArticles(filteredFullArticles);

      // Calculate pagination after deletion
      const pageSize = groupParams.pageSize;
      const totalPages = Math.ceil(filteredFullArticles.length / pageSize);
      let currentPage = groupPagination?.currentPage || 1;

      // If current page is now beyond the total pages, go to the last valid page
      if (currentPage > totalPages && totalPages > 0) {
        currentPage = totalPages;
      }

      // If there are no articles left, reset to page 1
      if (filteredFullArticles.length === 0) {
        currentPage = 1;
      }

      // Calculate the articles for the current page
      const startIndex = (currentPage - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedArticles = filteredFullArticles.slice(startIndex, endIndex);

      const updatedCollection = {
        ...currentCollection,
        articles: paginatedArticles,
        is_modified: true,
        updated_at: new Date().toISOString()
      };

      setGroupCollection(updatedCollection);

      // Update pagination with the corrected current page
      setGroupPagination({
        currentPage: currentPage,
        totalPages: Math.max(totalPages, 1), // Ensure at least 1 page even if empty
        totalResults: filteredFullArticles.length,
        pageSize: pageSize
      });
    }

    // Clear selection if needed
    setSelectedArticleIds(prev => {
      const newSet = new Set(prev);
      articleIds.forEach(id => newSet.delete(id));
      return newSet;
    });
  }, [searchCollection, groupCollection, fullGroupArticles, groupPagination, groupParams.pageSize]);

  const reorderArticleInCollection = useCallback((articleId: string, newPosition: number, collectionType: 'search' | 'group' = 'search') => {
    const currentCollection = collectionType === 'search' ? searchCollection : groupCollection;
    if (!currentCollection) return;

    const articles = [...currentCollection.articles];
    const currentIndex = articles.findIndex(a => a.article_id === articleId);

    if (currentIndex === -1) return;

    const [movedArticle] = articles.splice(currentIndex, 1);
    articles.splice(newPosition, 0, movedArticle);

    // Update positions
    articles.forEach((article, index) => {
      article.position = index;
    });

    const updatedCollection = {
      ...currentCollection,
      articles,
      is_modified: true,
      updated_at: new Date().toISOString()
    };

    if (collectionType === 'search') {
      setSearchCollection(updatedCollection);
    } else {
      setGroupCollection(updatedCollection);
    }
  }, [searchCollection, groupCollection]);

  // ================== FEATURE MANAGEMENT ==================

  const _updateCollectionWithFeatures = useCallback((
    features: FeatureDefinition[],
    _collectionType: 'search' | 'group' = 'search',
    currentCollection: ArticleCollection
  ): ArticleCollection => {
    // Ensure unique IDs
    const newFeatures = features.map(f => ({
      ...f,
      id: f.id || generatePrefixedUUID('feat')
    }));

    // Handle existing features by updating them, and add truly new ones
    const updatedFeatures = [...currentCollection.feature_definitions];
    let featuresChanged = false;

    newFeatures.forEach(newFeature => {
      const existingIndex = updatedFeatures.findIndex(f => f.id === newFeature.id);
      if (existingIndex >= 0) {
        // Update existing feature
        updatedFeatures[existingIndex] = newFeature;
        featuresChanged = true;
      } else {
        // Add new feature
        updatedFeatures.push(newFeature);
        featuresChanged = true;
      }
    });

    if (!featuresChanged) return currentCollection; // No changes to apply

    return {
      ...currentCollection,
      feature_definitions: updatedFeatures,
      is_modified: true,
      updated_at: new Date().toISOString()
    };
  }, []);

  const addFeatureDefinitionsLocal = useCallback((features: FeatureDefinition[], collectionType: 'search' | 'group' = 'search') => {
    const currentCollection = collectionType === 'search' ? searchCollection : groupCollection;
    if (!currentCollection) return;

    const updatedCollection = _updateCollectionWithFeatures(features, collectionType, currentCollection);

    // Only update state if there were changes
    if (updatedCollection !== currentCollection) {
      if (collectionType === 'search') {
        setSearchCollection(updatedCollection);
      } else {
        setGroupCollection(updatedCollection);
      }
    }
  }, [searchCollection, groupCollection, _updateCollectionWithFeatures]);

  const addFeaturesAndExtract = useCallback(async (features: FeatureDefinition[], collectionType: 'search' | 'group' = 'search', targetArticleIds?: string[]) => {
    const currentCollection = collectionType === 'search' ? searchCollection : groupCollection;
    if (!currentCollection) return;

    console.log('WorkbenchContext addFeatureDefinitionsAndExtract received features:', features);

    // Use the shared helper to update the collection with features
    const updatedCollection = _updateCollectionWithFeatures(features, collectionType, currentCollection);

    // Get the processed features with IDs for extraction
    const newFeatures = features.map(f => ({
      ...f,
      id: f.id || generatePrefixedUUID('feat')
    }));

    console.log('WorkbenchContext processed features:', newFeatures);

    // Update state immediately
    if (collectionType === 'search') {
      setSearchCollection(updatedCollection);
    } else {
      setGroupCollection(updatedCollection);
    }

    // Now extract features using the new features directly
    setIsExtracting(true);
    setError(null);

    try {
      // Filter articles based on selection (if provided)
      const articlesToExtract = targetArticleIds && targetArticleIds.length > 0
        ? updatedCollection.articles.filter(a => targetArticleIds.includes(a.article_id))
        : updatedCollection.articles;

      const articlesData = articlesToExtract.map(a => ({
        id: a.article_id,
        title: a.article.title,
        abstract: a.article.abstract || ''
      }));

      console.log('WorkbenchContext about to call API with:', {
        articles: articlesData,
        features: newFeatures
      });

      const extractionResult = await workbenchApi.extractFeatures({
        articles: articlesData,
        features: newFeatures // Use the new features directly
      });

      console.log('Extraction API Response:', extractionResult);
      console.log('Articles data sent:', articlesData);
      console.log('Features sent:', newFeatures);

      // Update article feature_data - only for articles that were extracted
      const extractedArticleIds = new Set(articlesData.map(a => a.id));
      const updatedArticles = updatedCollection.articles.map(article => {
        // Only update articles that were part of the extraction
        if (!extractedArticleIds.has(article.article_id)) {
          return article; // Return unchanged
        }

        const articleFeatures = extractionResult.results[article.article_id] || {};
        console.log(`Article ${article.article_id} features:`, articleFeatures);

        // API should return features with IDs as keys
        console.log(`Processed features for article ${article.article_id}:`, articleFeatures);

        return {
          ...article,
          feature_data: {
            ...article.feature_data,
            ...articleFeatures
          }
        };
      });

      console.log('Updated articles with feature data:', updatedArticles);

      const finalCollection = {
        ...updatedCollection,
        articles: updatedArticles,
        updated_at: new Date().toISOString()
      };

      if (collectionType === 'search') {
        setSearchCollection(finalCollection);
      } else {
        setGroupCollection(finalCollection);

        // For groups, also update fullGroupArticles if they exist
        if (fullGroupArticles) {
          const updatedFullArticles = fullGroupArticles.map(article => {
            if (!extractedArticleIds.has(article.article_id)) {
              return article; // Return unchanged
            }

            const articleFeatures = extractionResult.results[article.article_id] || {};
            return {
              ...article,
              feature_data: {
                ...article.feature_data,
                ...articleFeatures
              }
            };
          });

          setFullGroupArticles(updatedFullArticles);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Feature extraction failed');
      console.error('Feature extraction error:', err);
    } finally {
      setIsExtracting(false);
      setExtractionProgress(undefined);
    }
  }, [searchCollection, groupCollection, _updateCollectionWithFeatures]);

  const removeFeatureDefinition = useCallback((featureId: string, collectionType: 'search' | 'group' = 'search') => {
    const currentCollection = collectionType === 'search' ? searchCollection : groupCollection;
    if (!currentCollection) return;

    // Remove from definitions
    const filteredDefinitions = currentCollection.feature_definitions.filter(
      f => f.id !== featureId
    );

    // Remove from all article feature_data
    const updatedArticles = currentCollection.articles.map(article => {
      const newFeatureData = { ...article.feature_data };
      delete newFeatureData[featureId];
      return { ...article, feature_data: newFeatureData };
    });

    const updatedCollection = {
      ...currentCollection,
      feature_definitions: filteredDefinitions,
      articles: updatedArticles,
      is_modified: true,
      updated_at: new Date().toISOString()
    };

    if (collectionType === 'search') {
      setSearchCollection(updatedCollection);
    } else {
      setGroupCollection(updatedCollection);

      // For groups, also update fullGroupArticles if they exist
      if (fullGroupArticles) {
        const updatedFullArticles = fullGroupArticles.map(article => {
          const newFeatureData = { ...article.feature_data };
          delete newFeatureData[featureId];
          return { ...article, feature_data: newFeatureData };
        });

        setFullGroupArticles(updatedFullArticles);
      }
    }
  }, [searchCollection, groupCollection]);

  const extractFeatureValues = useCallback(async (featureIds?: string[], collectionType: 'search' | 'group' = 'search', targetArticleIds?: string[]) => {
    const currentCollection = collectionType === 'search' ? searchCollection : groupCollection;
    if (!currentCollection) return;

    // RULE 1: Features must exist in collection first
    const featuresToExtract = featureIds
      ? currentCollection.feature_definitions.filter(f => featureIds.includes(f.id))
      : currentCollection.feature_definitions;

    if (featuresToExtract.length === 0) {
      console.warn('No features to extract - collection has no feature definitions');
      return;
    }

    setIsExtracting(true);
    setError(null);

    try {
      // RULE 2: Articles can be subset or all
      const articlesToExtract = targetArticleIds
        ? currentCollection.articles.filter(a => targetArticleIds.includes(a.article_id))
        : currentCollection.articles;

      console.log(`Extracting ${featuresToExtract.length} features for ${articlesToExtract.length} articles`);

      const extractionResult = await workbenchApi.extractFeatures({
        articles: articlesToExtract.map(a => ({
          id: a.article_id,
          title: a.article.title,
          abstract: a.article.abstract || ''
        })),
        features: featuresToExtract
      });

      console.log('Extraction API Response:', extractionResult);

      // RULE 3: Merge results with existing data (overwrite on conflict)
      const updatedArticles = currentCollection.articles.map(article => {
        // Only update if this article was targeted for extraction
        const wasTargeted = !targetArticleIds || targetArticleIds.includes(article.article_id);
        if (!wasTargeted) {
          return article; // Return unchanged
        }

        // Get extraction results for this article (empty object if no results)
        const newFeatureData = extractionResult.results[article.article_id] || {};

        console.log(`Article ${article.article_id}: merging ${Object.keys(newFeatureData).length} new features`);

        // Merge: existing features + new features (new overwrites existing)
        return {
          ...article,
          feature_data: {
            ...article.feature_data,  // Preserve existing features
            ...newFeatureData         // Add/overwrite with new features
          }
        };
      });

      const updatedCollection = {
        ...currentCollection,
        articles: updatedArticles,
        is_modified: true,
        updated_at: new Date().toISOString()
      };

      if (collectionType === 'search') {
        setSearchCollection(updatedCollection);
      } else {
        setGroupCollection(updatedCollection);

        // For groups, also update fullGroupArticles if they exist
        if (fullGroupArticles) {
          const targetedArticleIds = new Set(targetArticleIds || currentCollection.articles.map(a => a.article_id));
          const updatedFullArticles = fullGroupArticles.map(article => {
            // Only update if this article was targeted for extraction
            if (!targetedArticleIds.has(article.article_id)) {
              return article; // Return unchanged
            }

            // Get extraction results for this article (empty object if no results)
            const newFeatureData = extractionResult.results[article.article_id] || {};

            // Merge: existing features + new features (new overwrites existing)
            return {
              ...article,
              feature_data: {
                ...article.feature_data,  // Preserve existing features
                ...newFeatureData         // Add/overwrite with new features
              }
            };
          });

          setFullGroupArticles(updatedFullArticles);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Feature extraction failed');
      console.error('Feature extraction error:', err);
    } finally {
      setIsExtracting(false);
      setExtractionProgress(undefined);
    }
  }, [searchCollection, groupCollection]);

  const updateFeatureValueLocal = useCallback((articleId: string, featureId: string, value: any, collectionType: 'search' | 'group' = 'search') => {
    const currentCollection = collectionType === 'search' ? searchCollection : groupCollection;
    if (!currentCollection) return;

    const updatedArticles = currentCollection.articles.map(article => {
      if (article.article_id === articleId) {
        return {
          ...article,
          feature_data: {
            ...article.feature_data,
            [featureId]: value
          }
        };
      }
      return article;
    });

    const updatedCollection = {
      ...currentCollection,
      articles: updatedArticles,
      is_modified: true,
      updated_at: new Date().toISOString()
    };

    if (collectionType === 'search') {
      setSearchCollection(updatedCollection);
    } else {
      setGroupCollection(updatedCollection);

      // For groups, also update fullGroupArticles if they exist
      if (fullGroupArticles) {
        const updatedFullArticles = fullGroupArticles.map(article => {
          if (article.article_id === articleId) {
            return {
              ...article,
              feature_data: {
                ...article.feature_data,
                [featureId]: value
              }
            };
          }
          return article;
        });

        setFullGroupArticles(updatedFullArticles);
      }
    }
  }, [searchCollection, groupCollection]);

  // ================== SELECTION MANAGEMENT ==================

  const selectArticleDetail = useCallback((articleDetail: ArticleGroupDetail | null) => {
    setSelectedArticleDetail(articleDetail);
  }, []);

  const toggleArticleSelection = useCallback((articleId: string) => {
    setSelectedArticleIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(articleId)) {
        newSet.delete(articleId);
      } else {
        newSet.add(articleId);
      }
      return newSet;
    });
  }, []);

  const selectAllArticlesInView = useCallback(() => {
    // This function should be updated to use context from the calling component
    // For now, we'll leave it as is since it's not used much
    const currentCollection = searchCollection || groupCollection;
    if (!currentCollection) return;

    const allIds = new Set(currentCollection.articles.map(a => a.article.id));
    setSelectedArticleIds(allIds);
  }, [searchCollection, groupCollection]);

  const clearArticleSelection = useCallback(() => {
    setSelectedArticleIds(new Set());
  }, []);

  // ================== UTILITY ACTIONS ==================

  const exportActiveCollection = useCallback(async (format: 'csv' | 'json', collectionType?: 'search' | 'group') => {
    try {
      const collection = getActiveCollection(collectionType === 'group' ? 'groups' : (collectionType || (searchCollection ? 'search' : 'groups')));
      if (!collection || !collection.articles.length) {
        setError('No articles to export');
        return;
      }

      // For groups, use all articles (not just current page)
      const articlesToExport = collectionType === 'group' && fullGroupArticles
        ? fullGroupArticles
        : collection.articles;

      if (articlesToExport.length === 0) {
        setError('No articles to export');
        return;
      }

      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const collectionName = collection.name.replace(/[^a-zA-Z0-9\-_]/g, '_');

      if (format === 'csv') {
        // Prepare features data in the format expected by exportAsCSV
        const featuresForCSV = collection.feature_definitions.map(feature => ({
          name: feature.name,
          data: Object.fromEntries(
            articlesToExport.map(article => [
              article.article.id,
              article.feature_data[feature.id] || ''
            ])
          )
        }));

        const filename = `${collectionName}_${timestamp}.csv`;
        workbenchApi.exportAsCSV(articlesToExport.map(a => a.article), featuresForCSV, filename);
      } else if (format === 'json') {
        const exportData = {
          collection: {
            name: collection.name,
            description: collection.description,
            source: collection.source,
            exported_at: new Date().toISOString(),
            total_articles: articlesToExport.length
          },
          articles: articlesToExport.map(detail => ({
            article: detail.article,
            feature_data: detail.feature_data,
            notes: detail.notes,
            position: detail.position
          })),
          feature_definitions: collection.feature_definitions
        };

        const jsonContent = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${collectionName}_${timestamp}.json`;
        link.click();
        URL.revokeObjectURL(link.href);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  }, [searchCollection, groupCollection, fullGroupArticles, getActiveCollection]);

  const copyCollectionToClipboard = useCallback(async (format: 'csv' | 'json' | 'text', collectionType?: 'search' | 'group') => {
    try {
      const collection = getActiveCollection(collectionType === 'group' ? 'groups' : (collectionType || (searchCollection ? 'search' : 'groups')));
      if (!collection || !collection.articles.length) {
        setError('No articles to copy');
        return;
      }

      // For groups, use all articles (not just current page)
      const articlesToCopy = collectionType === 'group' && fullGroupArticles
        ? fullGroupArticles
        : collection.articles;

      if (articlesToCopy.length === 0) {
        setError('No articles to copy');
        return;
      }

      let content = '';

      if (format === 'text') {
        // Text format with all data including features
        content = articlesToCopy.map((detail, index) => {
          const article = detail.article;
          let articleText = `${index + 1}. ${article.title}\n` +
            `   ID: ${article.id}\n` +
            `   Authors: ${article.authors?.join(', ') || 'N/A'}\n` +
            `   Journal: ${article.journal || 'N/A'} (${article.publication_year || 'N/A'})\n` +
            `   Abstract: ${article.abstract || 'No abstract available'}\n` +
            `   URL: ${article.url || 'N/A'}\n`;

          // Add feature data if available
          if (collection.feature_definitions.length > 0) {
            articleText += `   Features:\n`;
            collection.feature_definitions.forEach(feature => {
              const value = detail.feature_data[feature.id] || 'N/A';
              articleText += `     ${feature.name}: ${value}\n`;
            });
          }

          return articleText;
        }).join('\n' + '-'.repeat(80) + '\n\n');

        content = `Collection: ${collection.name}\n` +
          `Articles: ${articlesToCopy.length}\n` +
          `Exported: ${new Date().toLocaleString()}\n\n` +
          '='.repeat(80) + '\n\n' + content;
      } else if (format === 'csv') {
        // Generate CSV content
        const headers = ['ID', 'Title', 'Authors', 'Journal', 'Year', 'URL'];
        collection.feature_definitions.forEach(feature => headers.push(feature.name));

        const rows = articlesToCopy.map(detail => {
          const article = detail.article;
          const row = [
            article.id || '',
            article.title || '',
            (article.authors || []).join('; '),
            article.journal || '',
            article.publication_year || '',
            article.url || ''
          ];

          // Add feature data
          collection.feature_definitions.forEach(feature => {
            row.push(detail.feature_data[feature.id] || '');
          });

          return row;
        });

        content = [headers, ...rows]
          .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
          .join('\n');
      } else if (format === 'json') {
        // Same as export but as string
        const exportData = {
          collection: {
            name: collection.name,
            description: collection.description,
            source: collection.source,
            exported_at: new Date().toISOString(),
            total_articles: articlesToCopy.length
          },
          articles: articlesToCopy.map(detail => ({
            article: detail.article,
            feature_data: detail.feature_data,
            notes: detail.notes,
            position: detail.position
          })),
          feature_definitions: collection.feature_definitions
        };
        content = JSON.stringify(exportData, null, 2);
      }

      // Try modern Clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(content);

          // Optional: Verify the content was written (may fail due to permissions)
          try {
            const clipboardContent = await navigator.clipboard.readText();
            if (clipboardContent !== content) {
              console.warn('Clipboard verification failed, but write operation appeared successful');
            }
          } catch (readError) {
            // Reading clipboard might fail due to permissions, but writing may have succeeded
            console.warn('Cannot verify clipboard content due to permissions, assuming success');
          }
        } catch (writeError) {
          console.error('Modern clipboard API failed:', writeError);
          throw writeError;
        }
      } else {
        // Fallback to older method
        const textArea = document.createElement('textarea');
        textArea.value = content;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
          const successful = document.execCommand('copy');
          if (!successful) {
            throw new Error('Fallback clipboard method failed');
          }
        } finally {
          document.body.removeChild(textArea);
        }
      }
    } catch (err) {
      console.error('Clipboard copy failed:', err);
      setError(err instanceof Error ? err.message : 'Copy to clipboard failed');
      throw err; // Re-throw to let the ExportMenu handle the error
    }
  }, [searchCollection, groupCollection, fullGroupArticles, getActiveCollection]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const resetAllWorkbenchState = useCallback(() => {
    // Reset collection state
    setSearchCollection(null);
    setGroupCollection(null);
    setSearchPagination(null);
    setGroupPagination(null);
    setSelectedArticleIds(new Set());
    setSelectedArticleDetail(null);
    setIsExtracting(false);
    setExtractionProgress(undefined);
    setError(null);

    // Reset search state
    setSearchQuery('');
    setSelectedProviders(['pubmed']);
    setSearchMode('single');
    setSearchParams({
      pageSize: 20,
      sortBy: 'relevance',
      yearLow: undefined,
      yearHigh: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      dateType: 'publication',
      includeCitations: false,
      includePdfLinks: false
    });
    setGroupParams({
      pageSize: 20
    });
  }, []);

  const clearSearchResults = useCallback(() => {
    // Only reset search-related state
    setSearchCollection(null);
    setSearchPagination(null);
    setSelectedArticleIds(new Set());
    setSelectedArticleDetail(null);
    setError(null);
  }, []);

  // ================== CONTEXT VALUE ==================

  const contextValue: WorkbenchContextType = {
    // State
    searchCollection,
    groupCollection,
    fullGroupArticles,
    collectionLoading,
    groupsList,
    groupsListLoading,
    searchQuery,
    selectedProviders,
    searchMode,
    searchParams,
    groupParams,
    searchPagination,
    groupPagination,
    selectedArticleIds,
    selectedArticleDetail,
    isExtracting,
    extractionProgress,
    error,

    // Actions
    fetchSearchCollection,
    updateSearchQuery,
    updateSearchProviders,
    updateSearchMode,
    updateSearchParams,
    clearSearchResults,

    // Group Loading
    fetchGroupCollection,
    updateGroupPaginationParams,
    setGroupPage,

    // Group Management
    createGroupFromCollection,
    addArticlesToExistingGroup,
    updateGroupMetadata,
    deleteGroupPermanently,
    fetchCachedGroupsList,
    refreshGroupsList,

    // Collection Management
    updateGroupFromCollection,
    deleteCurrentCollection,

    // Collection Management
    getActiveCollection,

    // Article Management
    removeArticlesFromCollection,
    reorderArticleInCollection,

    // Feature Management
    addFeatureDefinitionsLocal,
    addFeaturesAndExtract,
    removeFeatureDefinition,
    extractFeatureValues,
    updateFeatureValueLocal,

    // Article Data Management
    updateArticleNotes,

    // Selection Management
    selectArticleDetail,
    toggleArticleSelection,
    selectAllArticlesInView,
    clearArticleSelection,

    // Utility Actions
    exportActiveCollection,
    copyCollectionToClipboard,
    clearError,
    resetAllWorkbenchState,
  };

  return (
    <WorkbenchContext.Provider value={contextValue}>
      {children}
    </WorkbenchContext.Provider>
  );
}

// ================== HOOK ==================

export function useWorkbench() {
  const context = useContext(WorkbenchContext);
  if (!context) {
    throw new Error('useWorkbench must be used within a WorkbenchProvider');
  }
  return context;
}