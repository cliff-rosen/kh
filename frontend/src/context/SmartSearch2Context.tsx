/**
 * SmartSearch2Context - Lightweight state management for SmartSearch2
 *
 * Optimized for direct search functionality without the guided workflow complexity.
 * Focuses on: source selection, query input, search execution, and results display.
 */
import React, { createContext, useEffect, useContext, useState, useCallback } from 'react';

import { api } from '@/lib/api';
import { smartSearch2Api } from '@/lib/api/smartSearch2Api';
import { googleScholarApi } from '@/lib/api/googleScholarApi';
import type { FeatureExtractionResponse } from '@/lib/api/smartSearch2Api';
import { _fromCanonicalToSmartArticles } from '@/lib/utils/articleTransform';
import {
    startNewJourney,
    getCurrentJourneyId,
    clearCurrentJourney,
    getCurrentJourneyInfo
} from '@/lib/utils/journeyTracking';

import type { CanonicalFeatureDefinition } from '@/types/canonical_types';
import type { SmartSearchArticle } from '@/types/smart-search';

export const MAX_ARTICLES_TO_FILTER = 500;
const PAGE_SIZE = 50;

// ================== RESULT STATE ENUM ==================

export enum ResultState {
    None = 'none',                           // No results yet
    PartialSearchResult = 'partial_search',  // Search results with more available
    FullSearchResult = 'full_search',        // All search results retrieved (or hit limit)
    FilteredResult = 'filtered',             // Filtered results (no longer a search result)
    FilterPendingApproval = 'filter_pending' // Filter completed, awaiting user approval
}

// ================== STATE INTERFACE ==================

interface SmartSearch2State {
    // SEARCH CONFIGURATION
    selectedSource: 'pubmed' | 'google_scholar';
    searchQuery: string;

    // ARTICLES - Single source of truth
    articles: SmartSearchArticle[];
    pagination: { total_available: number; returned: number; offset: number; has_more: boolean } | null;

    // PROCESSING STATE
    isSearching: boolean;
    isFiltering: boolean;
    isExtracting: boolean;

    // FEATURE EXTRACTION
    appliedFeatures: CanonicalFeatureDefinition[];
    pendingFeatures: CanonicalFeatureDefinition[];

    // FILTERING STATS
    filteringStats: {
        total_processed: number;
        total_accepted: number;
        total_rejected: number;
        average_confidence: number;
        duration_seconds: number;
    } | null;

    // RESEARCH JOURNEY STATE (persistent data)
    researchQuestion: string;
    evidenceSpec: string;
    extractedConcepts: string[];
    expandedExpressions: Array<{ concept: string; expression: string; count: number; selected?: boolean }>;
    generatedKeywords: string;

    // UI STATE
    hasSearched: boolean;
    resultState: ResultState;  // Track the current state of results
    error: string | null;

    // JOURNEY TRACKING
    currentJourneyId: string;
    journeyStartTime: string | null;
}

// ================== ACTIONS INTERFACE ==================

interface SmartSearch2Actions {
    // CONFIGURATION
    updateSelectedSource: (source: 'pubmed' | 'google_scholar') => void;
    updateSearchQuery: (query: string) => void;

    // AI HELPER METHODS
    refineEvidenceSpec: (userDescription: string, conversationHistory?: Array<{ question: string; answer: string }>) => Promise<{
        is_complete: boolean;
        evidence_specification: string | null;
        clarification_questions: string[] | null;
        completeness_score: number;
        missing_elements: string[];
        reasoning?: string;
    }>;
    extractConcepts: (evidenceSpecification: string) => Promise<{ concepts: string[]; evidence_specification: string; }>;
    expandConcepts: (concepts: string[], source: 'pubmed' | 'google_scholar') => Promise<{
        expansions: Array<{ concept: string; expression: string; count: number; }>;
        source: string;
    }>;
    testKeywordCombination: (expressions: string[], source: 'pubmed' | 'google_scholar') => Promise<{
        combined_query: string;
        estimated_results: number;
        source: string;
    }>;

    // RESEARCH JOURNEY MANAGEMENT
    setResearchQuestion: (question: string) => void;
    setEvidenceSpec: (spec: string) => void;
    setExtractedConcepts: (concepts: string[]) => void;
    setExpandedExpressions: (expressions: Array<{ concept: string; expression: string; count: number; selected?: boolean }>) => void;
    setGeneratedKeywords: (keywords: string) => void;
    resetResearchJourney: () => void;

    // SEARCH EXECUTION
    search: () => Promise<void>;
    loadMoreArticles: (count?: number) => Promise<void>;
    resetSearch: () => void;

    // ARTICLE FILTERING
    filterArticles: (filterCondition?: string, strictness?: 'low' | 'medium' | 'high') => Promise<{ autoRetrieved: number; totalAvailable: number; limitApplied: boolean }>;
    acceptFilter: () => void;
    undoFilter: () => void;

    // FEATURE EXTRACTION
    addPendingFeature: (feature: CanonicalFeatureDefinition) => void;
    removePendingFeature: (featureId: string) => void;
    extractFeatures: () => Promise<FeatureExtractionResponse>;

    // ERROR HANDLING
    clearError: () => void;

    // JOURNEY MANAGEMENT
    startJourney: (source?: string, initialQuery?: string) => string;
    clearJourney: () => void;
    getJourneyId: () => string;

    // COVERAGE TESTING
    testCoverage: (query: string, targetPmids: string[]) => Promise<{
        found_articles: Array<{ pmid: string; title: string; }>;
        missing_articles: string[];
        covered_ids: string[];
        coverage_percentage: number;
        coverage_count: number;
        total_target: number;
        total_found: number;
        estimated_count?: number;
    }>;
    fetchArticles: (pmids: string[]) => Promise<Array<{
        id: string;
        title: string;
        abstract?: string;
        authors?: string[];
        journal?: string;
        year?: number;
    }>>;

    // GOOGLE SCHOLAR INTEGRATION
    generateScholarKeywords: () => Promise<string>;
    testScholarKeywords: (keywords: string) => Promise<number>;
    searchScholar: (keywords: string, maxResults?: number) => Promise<SmartSearchArticle[]>;
    searchScholarStream: (
        keywords: string,
        maxResults: number | undefined,
        onBatch?: (batch: SmartSearchArticle[]) => void,
        onProgress?: (info: { start_index?: number; batch_size?: number; returned?: number }) => void,
        options?: { signal?: AbortSignal }
    ) => Promise<SmartSearchArticle[]>;
    detectDuplicates: (scholarArticles: SmartSearchArticle[]) => SmartSearchArticle[];
    addScholarArticles: (scholarArticles: SmartSearchArticle[]) => void;
}

// ================== CONTEXT ==================

interface SmartSearch2ContextType extends SmartSearch2State, SmartSearch2Actions { }

const SmartSearch2Context = createContext<SmartSearch2ContextType | undefined>(undefined);

// ================== PROVIDER COMPONENT ==================

interface SmartSearch2ProviderProps {
    children: React.ReactNode;
}

export function SmartSearch2Provider({ children }: SmartSearch2ProviderProps) {
    // ================== STATE ==================

    const [selectedSource, setSelectedSource] = useState<'pubmed' | 'google_scholar'>('pubmed');
    const [searchQuery, setSearchQuery] = useState('');

    // UNIFIED ARTICLE STATE - Single source of truth
    const [articles, setArticles] = useState<SmartSearchArticle[]>([]);
    const [pagination, setPagination] = useState<{ total_available: number; returned: number; offset: number; has_more: boolean } | null>(null);

    // PROCESSING STATE
    const [isSearching, setIsSearching] = useState(false);
    const [isFiltering, setIsFiltering] = useState(false);
    const [isExtracting, setIsExtracting] = useState(false);

    // UI STATE
    const [hasSearched, setHasSearched] = useState(false);
    const [resultState, setResultState] = useState<ResultState>(ResultState.None);
    const [error, setError] = useState<string | null>(null);

    // FILTERING STATS
    const [filteringStats, setFilteringStats] = useState<{
        total_processed: number;
        total_accepted: number;
        total_rejected: number;
        average_confidence: number;
        duration_seconds: number;
    } | null>(null);

    // FEATURE EXTRACTION STATE
    const [appliedFeatures, setAppliedFeatures] = useState<CanonicalFeatureDefinition[]>([]);
    const [pendingFeatures, setPendingFeatures] = useState<CanonicalFeatureDefinition[]>([]);

    // Research journey state (persistent data)
    const [researchQuestion, setResearchQuestion] = useState('');
    const [evidenceSpec, setEvidenceSpec] = useState('');
    const [extractedConcepts, setExtractedConcepts] = useState<string[]>([]);
    const [expandedExpressions, setExpandedExpressions] = useState<Array<{ concept: string; expression: string; count: number; selected?: boolean }>>([]);
    const [generatedKeywords, setGeneratedKeywords] = useState('');

    // Journey tracking state - initialized from localStorage
    const [currentJourneyId, setCurrentJourneyId] = useState<string>(() => {
        const journeyId = getCurrentJourneyId();
        return journeyId;
    });
    const [journeyStartTime, setJourneyStartTime] = useState<string | null>(() => {
        const info = getCurrentJourneyInfo();
        return info?.startedAt || null;
    });

    // Make the context's getOrCreateJourneyId available globally for API interceptor
    const getOrCreateJourneyId = useCallback((): string => {
        let journeyId = localStorage.getItem('currentJourneyId');

        if (!journeyId) {
            // Create new journey and update context state
            journeyId = startNewJourney('auto', 'Auto-created');
            setCurrentJourneyId(journeyId);
            const info = getCurrentJourneyInfo();
            setJourneyStartTime(info?.startedAt || null);
            console.log('Context created new journey:', journeyId);
        }

        return journeyId;
    }, []);

    // Make this available globally for the API interceptor
    (window as any).__getOrCreateJourneyId = getOrCreateJourneyId;

    // ================== JOURNEY MANAGEMENT ACTIONS ==================


    const startJourney = useCallback((source?: string, initialQuery?: string) => {
        const journeyId = startNewJourney(source || 'smartsearch2', initialQuery || searchQuery || 'New Search');
        setCurrentJourneyId(journeyId);
        setJourneyStartTime(new Date().toISOString());
        return journeyId;
    }, [searchQuery]);


    const clearJourney = useCallback(() => {
        clearCurrentJourney();
        // Start a new journey immediately after clearing
        const newJourneyId = getCurrentJourneyId();
        setCurrentJourneyId(newJourneyId);
        const info = getCurrentJourneyInfo();
        setJourneyStartTime(info?.startedAt || null);
    }, []);

    const getJourneyId = useCallback((): string => {
        return getCurrentJourneyId();
    }, []);

    // ================== ACTIONS ==================

    const updateSelectedSource = useCallback((source: 'pubmed' | 'google_scholar') => {
        setSelectedSource(source);
    }, []);

    const updateSearchQuery = useCallback((query: string) => {
        setSearchQuery(query);
    }, []);

    const search = useCallback(async () => {
        if (!searchQuery.trim()) {
            setError('Please enter a search query');
            return;
        }

        setIsSearching(true);
        setError(null);
        setHasSearched(true);

        // Clear any existing state when starting a new search
        setFilteringStats(null);
        setAppliedFeatures([]);
        setPendingFeatures([]);
        setIsExtracting(false);

        try {
            // Execute direct search using SmartSearch2 API (no session required)
            const results = await smartSearch2Api.search({
                query: searchQuery,
                source: selectedSource,
                max_results: PAGE_SIZE,
                offset: 0
            });

            // Convert to unified article format
            const smartSearchArticles: SmartSearchArticle[] = results.articles.map(article => ({
                ...article,
                filterStatus: null
            }));

            setArticles(smartSearchArticles);
            setPagination(results.pagination);

            // Set result state based on whether all results are retrieved
            if (results.pagination.has_more) {
                setResultState(ResultState.PartialSearchResult);
            } else {
                setResultState(ResultState.FullSearchResult);
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Search failed';
            setError(errorMessage);
            console.error('Search execution failed:', err);
        } finally {
            setIsSearching(false);
        }
    }, [searchQuery, selectedSource]);

    const loadMoreArticles = useCallback(async (count?: number) => {
        if (!pagination || !pagination.has_more) {
            return;
        }

        setIsSearching(true);
        setError(null);

        try {
            const batchSize = count || PAGE_SIZE;
            const offset = articles.length;

            const results = await smartSearch2Api.search({
                query: searchQuery,
                source: selectedSource,
                max_results: batchSize,
                offset: offset
            });

            // Add new articles to existing ones
            const newArticles: SmartSearchArticle[] = results.articles.map(article => ({
                ...article,
                filterStatus: null
            }));

            const combinedArticles = [...articles, ...newArticles];
            setArticles(combinedArticles);

            // Update pagination
            const newPagination = {
                ...results.pagination,
                returned: combinedArticles.length
            };
            setPagination(newPagination);

            // Update result state based on whether all results are now retrieved
            if (newPagination.has_more) {
                setResultState(ResultState.PartialSearchResult);
            } else {
                setResultState(ResultState.FullSearchResult);
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to load more results';
            setError(errorMessage);
            console.error('Load more failed:', err);
        } finally {
            setIsSearching(false);
        }
    }, [pagination, articles, searchQuery, selectedSource]);

    const resetSearch = useCallback(() => {
        // Clear all existing state
        setSearchQuery('');
        setArticles([]);
        setPagination(null);
        setHasSearched(false);
        setResultState(ResultState.None);
        setError(null);
        setAppliedFeatures([]);
        setPendingFeatures([]);
        setIsExtracting(false);
        setFilteringStats(null);
        setIsFiltering(false);
        setResearchQuestion('');
        setEvidenceSpec('');
        setExtractedConcepts([]);
        setExpandedExpressions([]);
        setGeneratedKeywords('');

        // Start fresh journey
        const journeyId = startNewJourney('smartsearch2_reset', 'Reset Search Session');
        setCurrentJourneyId(journeyId);
        setJourneyStartTime(new Date().toISOString());
    }, []);

    const resetResearchJourney = useCallback(() => {
        setResearchQuestion('');
        setEvidenceSpec('');
        setExtractedConcepts([]);
        setExpandedExpressions([]);
        setGeneratedKeywords('');
    }, []);

    const refineEvidenceSpec = useCallback(async (
        userDescription: string,
        conversationHistory?: Array<{ question: string; answer: string }>
    ) => {
        try {
            // Set research question if this is the first call (no conversation history)
            if (!conversationHistory || conversationHistory.length === 0) {
                setResearchQuestion(userDescription);
            }

            const response = await smartSearch2Api.refineEvidenceSpec({
                user_description: userDescription,
                conversation_history: conversationHistory
            });

            // Always set an evidence spec - use API response or fallback to user question
            if (response.evidence_specification) {
                setEvidenceSpec(response.evidence_specification);
            } else {
                // Fallback to user's original question if no evidence spec returned
                setEvidenceSpec(userDescription);
            }

            return response;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to refine evidence specification';
            setError(errorMessage);
            throw err;
        }
    }, []);

    const extractConcepts = useCallback(async (evidenceSpecification: string) => {
        try {
            const response = await smartSearch2Api.extractConcepts({
                evidence_specification: evidenceSpecification
            });

            // Update context state with extracted concepts only
            setExtractedConcepts(response.concepts);

            return response;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to extract concepts';
            setError(errorMessage);
            throw err;
        }
    }, []);

    const expandConcepts = useCallback(async (concepts: string[], source: 'pubmed' | 'google_scholar') => {
        try {
            const response = await smartSearch2Api.expandConcepts({
                concepts,
                source
            });

            // Update context state with expanded expressions (all selected by default)
            const expressionsWithSelection = response.expansions.map(exp => ({
                ...exp,
                selected: true
            }));
            setExpandedExpressions(expressionsWithSelection);

            return response;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to expand concepts';
            setError(errorMessage);
            throw err;
        }
    }, []);

    const testKeywordCombination = useCallback(async (expressions: string[], source: 'pubmed' | 'google_scholar') => {
        try {
            const response = await smartSearch2Api.testKeywordCombination({
                expressions,
                source
            });
            return response;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to test keyword combination';
            setError(errorMessage);
            throw err;
        }
    }, []);

    const addPendingFeature = useCallback((feature: CanonicalFeatureDefinition) => {
        setPendingFeatures(prev => [...prev, feature]);
    }, []);

    const removePendingFeature = useCallback((featureId: string) => {
        setPendingFeatures(prev => prev.filter(f => f.id !== featureId));
    }, []);

    const extractFeatures = useCallback(async (): Promise<FeatureExtractionResponse> => {
        if (!articles.length) {
            throw new Error('No articles available for feature extraction');
        }

        if (pendingFeatures.length === 0) {
            throw new Error('No features selected for extraction');
        }

        setIsExtracting(true);
        try {
            // Extract raw articles for the API call
            const rawArticles = articles.map(article => {
                const { filterStatus, ...rawArticle } = article;
                return rawArticle;
            });

            const response = await smartSearch2Api.extractFeatures({
                articles: rawArticles,
                features: pendingFeatures
            });

            // Move pending features to applied
            setAppliedFeatures(prev => [...prev, ...pendingFeatures]);
            setPendingFeatures([]);

            // Debug: Log the extraction response
            console.log('Feature extraction response:', response);
            console.log('Applied features will be:', [...appliedFeatures, ...pendingFeatures]);

            // Update articles with extracted features
            const updatedArticles = articles.map(article => {
                const extractedForArticle = response.results[article.id];
                console.log(`Article ${article.id} - extracted features:`, extractedForArticle);

                return {
                    ...article,
                    extracted_features: {
                        ...article.extracted_features,
                        ...extractedForArticle
                    }
                };
            });

            console.log('Updated articles with features:', updatedArticles.slice(0, 2)); // Log first 2 articles
            setArticles(updatedArticles);

            return response;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to extract features';
            setError(errorMessage);
            throw err;
        } finally {
            setIsExtracting(false);
        }
    }, [articles, pendingFeatures]);

    const clearError = useCallback(() => {
        setError(null);
    }, []);

    const testCoverage = useCallback(async (query: string, targetPmids: string[]) => {
        try {
            const response = await api.post('/api/pubmed/test-search', {
                search_phrase: query,
                pubmed_ids: targetPmids
            });
            return response.data;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to test coverage';
            setError(errorMessage);
            throw err;
        }
    }, []);

    const fetchArticles = useCallback(async (pmids: string[]) => {
        try {
            const response = await api.post('/api/pubmed/fetch-articles', {
                pubmed_ids: pmids
            });
            return response.data.articles || [];
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to fetch articles';
            setError(errorMessage);
            throw err;
        }
    }, []);

    // ================== GOOGLE SCHOLAR METHODS ==================

    const generateScholarKeywords = useCallback(async (): Promise<string> => {
        try {
            // Strategy: Use the extracted concepts to generate Scholar-optimized keywords
            let generatedKeywords = '';

            if (extractedConcepts && extractedConcepts.length > 0) {
                // If we have extracted concepts from the evidence spec, use those
                const concepts = extractedConcepts.slice(0, 3); // Use top 3 concepts to avoid too complex query

                // For each concept, try to get the expanded expression from context
                const keywordParts = concepts.map(concept => {
                    // Check if we have expanded expressions for this concept
                    const expansion = expandedExpressions.find(exp =>
                        exp.concept.toLowerCase().includes(concept.toLowerCase()) ||
                        concept.toLowerCase().includes(exp.concept.toLowerCase())
                    );

                    if (expansion && expansion.selected) {
                        // Use the expanded expression
                        return `(${expansion.expression})`;
                    } else {
                        // Fall back to the concept itself with quotes for exact phrase matching
                        return `"${concept}"`;
                    }
                });

                generatedKeywords = keywordParts.join(' AND ');
            } else if (searchQuery) {
                // If no extracted concepts but we have a search query, clean it up for Scholar
                // Scholar typically works better with simpler, more natural language queries
                generatedKeywords = searchQuery
                    .replace(/\[MeSH[^[\]]*\]/g, '') // Remove MeSH terms
                    .replace(/\s+/g, ' ') // Clean up whitespace
                    .trim();
            } else {
                // Last resort: generate from evidence spec using concept extraction
                if (evidenceSpec) {
                    try {
                        const conceptResponse = await smartSearch2Api.extractConcepts({
                            evidence_specification: evidenceSpec
                        });

                        const topConcepts = conceptResponse.concepts.slice(0, 3);
                        generatedKeywords = topConcepts.map(concept => `"${concept}"`).join(' AND ');
                    } catch (error) {
                        console.error('Failed to extract concepts:', error);
                        throw new Error('No research context available to generate keywords');
                    }
                } else {
                    throw new Error('No research context available to generate keywords');
                }
            }

            return generatedKeywords;
        } catch (error) {
            console.error('Failed to generate keywords:', error);
            // Re-throw error to let UI handle it appropriately
            throw error;
        }
    }, [extractedConcepts, expandedExpressions, searchQuery, evidenceSpec]);

    const testScholarKeywords = useCallback(async (keywords: string): Promise<number> => {
        try {
            // Use the Google Scholar search endpoint to get result count
            // We'll do a minimal search (1 result) just to get the metadata with total count
            const response = await googleScholarApi.search({
                query: keywords,
                num_results: 1,
                enrich_summaries: false
            });

            // Extract estimated count from metadata
            const estimatedCount = response.metadata?.total_results || response.articles?.length || 0;
            return estimatedCount;
        } catch (error) {
            console.error('Error testing keywords:', error);
            // Return 0 on error instead of fake data
            return 0;
        }
    }, []);

    const detectDuplicates = useCallback((scholarArticles: SmartSearchArticle[]): SmartSearchArticle[] => {
        // Helper function to normalize text for comparison
        const normalizeText = (text: string): string => {
            return text
                .toLowerCase()
                .replace(/[^\w\s]/g, '') // Remove punctuation
                .replace(/\s+/g, ' ') // Normalize whitespace
                .trim();
        };

        // Helper function to extract meaningful words from title
        const extractKeywords = (title: string): string[] => {
            const normalized = normalizeText(title);
            const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
            return normalized
                .split(' ')
                .filter(word => word.length > 2 && !stopWords.has(word))
                .slice(0, 10); // Take first 10 meaningful words
        };

        // Helper function to calculate similarity score between two titles
        const calculateTitleSimilarity = (title1: string, title2: string): number => {
            const keywords1 = new Set(extractKeywords(title1));
            const keywords2 = new Set(extractKeywords(title2));

            const intersection = new Set([...keywords1].filter(x => keywords2.has(x)));
            const union = new Set([...keywords1, ...keywords2]);

            return union.size > 0 ? intersection.size / union.size : 0;
        };

        // Helper function to check author overlap
        const calculateAuthorSimilarity = (authors1: string[], authors2: string[]): number => {
            if (!authors1?.length || !authors2?.length) return 0;

            const normalizeAuthor = (author: string) => normalizeText(author.replace(/[,.]$/, ''));
            const norm1 = authors1.map(normalizeAuthor);
            const norm2 = authors2.map(normalizeAuthor);

            const matches = norm1.filter(a1 =>
                norm2.some(a2 =>
                    a1 === a2 || // Exact match
                    (a1.includes(a2) && a2.length > 4) || // One contains the other
                    (a2.includes(a1) && a1.length > 4)
                )
            ).length;

            return Math.max(norm1.length, norm2.length) > 0 ? matches / Math.max(norm1.length, norm2.length) : 0;
        };

        // Helper function to check year similarity
        const calculateYearSimilarity = (year1?: number, year2?: number): number => {
            if (!year1 || !year2) return 0.5; // Neutral if missing
            const diff = Math.abs(year1 - year2);
            if (diff === 0) return 1;
            if (diff === 1) return 0.8;
            if (diff <= 2) return 0.5;
            return 0;
        };

        // Main deduplication logic
        return scholarArticles.map(scholarArticle => {
            let isDuplicate = false;
            let duplicateReason = '';
            let bestMatch: SmartSearchArticle | null = null;
            let highestScore = 0;

            // Compare with each PubMed article
            for (const pubmedArticle of articles) {
                if (pubmedArticle.source !== 'pubmed') continue;

                const titleSim = calculateTitleSimilarity(scholarArticle.title, pubmedArticle.title);
                const authorSim = calculateAuthorSimilarity(scholarArticle.authors || [], pubmedArticle.authors || []);
                const yearSim = calculateYearSimilarity(scholarArticle.publication_year, pubmedArticle.publication_year);

                // Weighted scoring system
                const overallScore = titleSim * 0.6 + authorSim * 0.3 + yearSim * 0.1;

                if (overallScore > highestScore) {
                    highestScore = overallScore;
                    bestMatch = pubmedArticle;
                }

                // Determine if it's a duplicate based on different criteria
                if (titleSim >= 0.85) {
                    isDuplicate = true;
                    duplicateReason = `Very similar title (${Math.round(titleSim * 100)}% match)`;
                    break;
                } else if (titleSim >= 0.7 && authorSim >= 0.5) {
                    isDuplicate = true;
                    duplicateReason = `Similar title (${Math.round(titleSim * 100)}%) and authors (${Math.round(authorSim * 100)}%)`;
                    break;
                } else if (titleSim >= 0.6 && authorSim >= 0.7 && yearSim >= 0.8) {
                    isDuplicate = true;
                    duplicateReason = `Good match across title, authors, and year`;
                    break;
                }
            }

            // Return article with duplicate detection metadata
            return {
                ...scholarArticle,
                isDuplicate,
                duplicateReason,
                duplicateMatch: bestMatch,
                similarityScore: highestScore
            };
        });
    }, [articles]);

    const searchScholar = useCallback(async (keywords: string, maxResults: number = 100): Promise<SmartSearchArticle[]> => {
        try {
            // Search Google Scholar with the user's keywords
            const response = await googleScholarApi.search({
                query: keywords,
                num_results: maxResults,
                enrich_summaries: true
            });

            // Convert canonical articles to SmartSearchArticle format
            const scholarArticles: SmartSearchArticle[] = _fromCanonicalToSmartArticles(response.articles);

            // Apply duplicate detection against existing PubMed results
            return detectDuplicates(scholarArticles);
        } catch (error) {
            console.error('Error searching Scholar:', error);
            // Return empty array on error
            return [];
        }
    }, [detectDuplicates]);

    const searchScholarStream = useCallback(async (
        keywords: string,
        maxResults: number = 100,
        onBatch?: (batch: SmartSearchArticle[]) => void,
        onProgress?: (info: { start_index?: number; batch_size?: number; returned?: number }) => void,
        options?: { signal?: AbortSignal }
    ): Promise<SmartSearchArticle[]> => {
        const aggregated: SmartSearchArticle[] = [];
        try {
            const stream = googleScholarApi.stream({
                query: keywords,
                num_results: maxResults,
                enrich_summaries: true
            }, { signal: options?.signal });

            for await (const update of stream) {
                console.log('Context received stream update:', update);
                if (update.status === 'progress' && onProgress) {
                    onProgress(update.payload || {});
                }
                if (update.status === 'articles' && update.articles) {
                    const batchCanonical = update.articles;
                    const batchSmart: SmartSearchArticle[] = _fromCanonicalToSmartArticles(batchCanonical);
                    const batchWithDupes = detectDuplicates(batchSmart);
                    aggregated.push(...batchWithDupes);
                    if (onBatch) onBatch(batchWithDupes);
                }
            }
        } catch (error) {
            console.error('Scholar streaming error:', error);
        }
        return aggregated;
    }, [detectDuplicates]);

    const addScholarArticles = useCallback((scholarArticles: SmartSearchArticle[]) => {
        // Add Scholar articles to the existing articles array
        setArticles(prevArticles => {
            // Ensure no duplicates by ID
            const existingIds = new Set(prevArticles.map(a => a.id));
            const newArticles = scholarArticles.filter(article => !existingIds.has(article.id));

            // Combine articles
            const combinedArticles = [...prevArticles, ...newArticles];

            console.log(`Added ${newArticles.length} new Scholar articles (${scholarArticles.length - newArticles.length} duplicates filtered out)`);

            return combinedArticles;
        });

        // Update pagination to reflect the new total
        setPagination(prev => prev ? {
            ...prev,
            returned: prev.returned + scholarArticles.length
        } : null);
    }, []);

    const filterArticles = useCallback(async (
        filterConditionOverride?: string,
        strictness: 'low' | 'medium' | 'high' = 'medium'
    ): Promise<{ autoRetrieved: number; totalAvailable: number; limitApplied: boolean }> => {
        const finalFilterCondition = filterConditionOverride || evidenceSpec;

        if (!finalFilterCondition.trim()) {
            throw new Error('Filter condition is required for filtering');
        }

        if (!articles.length) {
            throw new Error('No articles available to filter');
        }

        setIsFiltering(true);
        setError(null);

        try {
            // Check if we need to retrieve more articles before filtering
            let articlesToFilter = articles;
            let autoRetrievedCount = 0;
            const totalAvailable = pagination?.total_available || articles.length;
            let limitApplied = false;

            // Compute remaining based on authoritative pagination for the current search source,
            // not by counting items in the mixed articles list.
            const totalCurrentCount = articles.length; // may include mixed sources
            const allowableByCap = Math.max(0, MAX_ARTICLES_TO_FILTER - totalCurrentCount);

            const sourceReturned = pagination?.returned ?? 0;
            const sourceTotalAvailable = pagination?.total_available ?? totalCurrentCount;
            const sourceRemainingAvailable = Math.max(0, sourceTotalAvailable - sourceReturned);
            let remainingToFetch = Math.min(allowableByCap, sourceRemainingAvailable);

            // Limit flag: even if we fetch all allowed by cap, we won't reach total available
            limitApplied = (sourceTotalAvailable > (sourceReturned + allowableByCap)) || (allowableByCap === 0);

            console.log(`Filter auto-retrieval check:`, {
                selectedSource,
                sourceReturned,
                sourceTotalAvailable,
                totalCurrentCount,
                allowableByCap,
                sourceRemainingAvailable,
                remainingToFetch,
                limitApplied,
                hasMore: !!pagination?.has_more,
                resultState
            });

            // Only auto-retrieve if we're in a partial search state for the selected source
            if (pagination && pagination.has_more && resultState === ResultState.PartialSearchResult && remainingToFetch > 0) {
                console.log(`Auto-retrieving up to ${remainingToFetch} ${selectedSource} articles before filtering (currently have ${currentSourceCount} from this source, ${totalCurrentCount} total)`);

                // Fetch remaining articles in batches - use max allowed by backend
                const batchSize = selectedSource === 'google_scholar' ? 20 : 100;
                let offset = sourceReturned; // authoritative offset for this source
                const additionalArticles: SmartSearchArticle[] = [];

                while (remainingToFetch > 0) {
                    const resultsToFetch = Math.min(batchSize, remainingToFetch);

                    const batchResults = await smartSearch2Api.search({
                        query: searchQuery,
                        source: selectedSource,
                        max_results: resultsToFetch,
                        offset: offset
                    });

                    const batchArticles: SmartSearchArticle[] = batchResults.articles.map(article => ({
                        ...article,
                        filterStatus: null
                    }));

                    additionalArticles.push(...batchArticles);
                    offset += batchArticles.length;
                    remainingToFetch -= batchArticles.length;
                    autoRetrievedCount = additionalArticles.length;

                    console.log(`Batch retrieval:`, {
                        requestedOffset: offset - batchArticles.length,
                        requestedCount: resultsToFetch,
                        receivedCount: batchArticles.length,
                        totalAdditional: additionalArticles.length,
                        newOffset: offset,
                        remainingToFetch,
                        willContinue: remainingToFetch > 0 && batchArticles.length >= resultsToFetch
                    });

                    // Break if we got zero results (end of dataset)
                    if (batchArticles.length === 0) {
                        console.log(`Breaking loop: no more ${selectedSource} articles available`);
                        break;
                    }
                }

                // Combine all articles (preserve already-added Scholar items)
                articlesToFilter = [...articles, ...additionalArticles];

                console.log(`Auto-retrieval completed:`, {
                    originalTotalCount: articles.length,
                    originalSourceReturned: sourceReturned,
                    additionalRetrieved: additionalArticles.length,
                    newSourceReturned: sourceReturned + additionalArticles.length,
                    newTotalCount: articlesToFilter.length
                });

                // Update the articles state with all retrieved articles
                setArticles(articlesToFilter);

                // Update pagination for the selected source only
                setPagination(prev => prev ? {
                    ...prev,
                    returned: prev.returned + additionalArticles.length,
                    has_more: prev.total_available > (prev.returned + additionalArticles.length)
                } : null);
            }

            // Extract raw articles for the API call
            const rawArticles = articlesToFilter.map(article => {
                const { filterStatus, ...rawArticle } = article;
                return rawArticle;
            });
            console.log('Raw article count:', rawArticles.length);

            const response = await smartSearch2Api.filterArticles({
                filter_condition: finalFilterCondition,
                articles: rawArticles,
                strictness: strictness
            });

            // Update articles in place with filter results
            const updatedArticles = articlesToFilter.map(article => {
                const filterResult = response.filtered_articles.find(fa =>
                    fa.article.url === article.url || fa.article.title === article.title
                );

                return {
                    ...article,
                    filterStatus: filterResult ? {
                        passed: filterResult.passed,
                        confidence: filterResult.confidence,
                        reasoning: filterResult.reasoning
                    } : null
                };
            });

            setArticles(updatedArticles);
            setFilteringStats({
                total_processed: response.total_processed,
                total_accepted: response.total_accepted,
                total_rejected: response.total_rejected,
                average_confidence: response.average_confidence,
                duration_seconds: response.duration_seconds
            });
            setResultState(ResultState.FilterPendingApproval);  // Mark as pending approval

            return {
                autoRetrieved: autoRetrievedCount,
                totalAvailable: totalAvailable,
                limitApplied: limitApplied
            };
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to filter articles';
            setError(errorMessage);
            throw err;
        } finally {
            setIsFiltering(false);
        }
    }, [evidenceSpec, articles, pagination, resultState, selectedSource, searchQuery]);

    const acceptFilter = useCallback(() => {
        // Remove rejected articles and clear filter status from accepted ones
        const acceptedArticles = articles
            .filter(article => article.filterStatus?.passed !== false)
            .map(article => ({
                ...article,
                filterStatus: null  // Hide filter status after acceptance
            }));
        setArticles(acceptedArticles);
        setFilteringStats(null);

        // Update pagination to reflect new article count (no longer a search result)
        setPagination({
            total_available: acceptedArticles.length,
            returned: acceptedArticles.length,
            offset: 0,
            has_more: false
        });

        setResultState(ResultState.FilteredResult);  // Final filtered state
    }, [articles]);

    const undoFilter = useCallback(() => {
        // Clear filter status from all articles (keep all articles)
        const clearedArticles = articles.map(article => ({
            ...article,
            filterStatus: null
        }));
        setArticles(clearedArticles);
        setFilteringStats(null);

        // Reset to appropriate search state based on pagination
        if (pagination) {
            if (pagination.has_more) {
                setResultState(ResultState.PartialSearchResult);
            } else {
                setResultState(ResultState.FullSearchResult);
            }
        } else {
            setResultState(ResultState.None);
        }
    }, [articles, pagination]);

    // ================== CONTEXT VALUE ==================

    const contextValue: SmartSearch2ContextType = {
        // State
        selectedSource,
        searchQuery,
        articles,
        pagination,
        isSearching,
        isFiltering,
        isExtracting,
        hasSearched,
        resultState,
        error,
        appliedFeatures,
        pendingFeatures,
        filteringStats,

        // Research journey state
        researchQuestion,
        evidenceSpec,
        extractedConcepts,
        expandedExpressions,
        generatedKeywords,

        // Journey tracking state
        currentJourneyId,
        journeyStartTime,

        // Actions
        updateSelectedSource,
        updateSearchQuery,
        refineEvidenceSpec,
        extractConcepts,
        expandConcepts,
        testKeywordCombination,
        search,
        loadMoreArticles,
        resetSearch,
        filterArticles,
        acceptFilter,
        undoFilter,
        addPendingFeature,
        removePendingFeature,
        extractFeatures,
        clearError,
        testCoverage,
        fetchArticles,

        // Google Scholar actions
        generateScholarKeywords,
        testScholarKeywords,
        searchScholar,
        searchScholarStream,
        detectDuplicates,
        addScholarArticles,

        // Research journey actions
        setResearchQuestion,
        setEvidenceSpec,
        setExtractedConcepts,
        setExpandedExpressions,
        setGeneratedKeywords,
        resetResearchJourney,

        // Journey management actions
        startJourney,
        clearJourney,
        getJourneyId,
    };

    return (
        <SmartSearch2Context.Provider value={contextValue}>
            {children}
        </SmartSearch2Context.Provider>
    );
}

// ================== HOOK ==================

export function useSmartSearch2() {
    const context = useContext(SmartSearch2Context);
    if (!context) {
        throw new Error('useSmartSearch2 must be used within a SmartSearch2Provider');
    }
    return context;
}
