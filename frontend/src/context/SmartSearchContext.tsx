/**
 * SmartSearchContext - Unified state management for Smart Search Lab
 * 
 * Follows the WorkbenchContext pattern where business logic is centralized
 * in the context while UI handlers remain in the page components.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

import type {
  FilteredArticle,
  SmartSearchStep,
  SearchKeywordHistoryItem
} from '@/types/smart-search';
import type { FeatureDefinition } from '@/types/workbench';
import {
  mapBackendToFrontend,
  isStepBefore,
  isBackendStepAtOrAfter
} from '@/types/smart-search';
import type {
  EvidenceSpecificationResponse,
  SearchKeywordsResponse,
  SearchKeywordsWithCountResponse,
  SearchExecutionResponse,
  DiscriminatorGenerationResponse,
  FeatureExtractionResponse
} from '@/lib/api/smartSearchApi';


import { smartSearchApi } from '@/lib/api/smartSearchApi';

// ================== STATE INTERFACE ==================

// SmartSearchStep is now imported from types/smart-search.ts

interface SmartSearchState {
  // WORKFLOW STATE
  step: SmartSearchStep;
  sessionId: string | null;

  // USER INPUT
  originalQuestion: string;                                      // User's original research question

  // AI-GENERATED VERSIONS
  generatedEvidenceSpec: string;                                // AI-generated evidence specification
  generatedSearchKeywords: string;                              // AI-generated boolean search query
  generatedDiscriminator: string;                               // AI-generated semantic filter criteria

  // USER-SUBMITTED VERSIONS
  submittedEvidenceSpec: string;                                // User's final evidence specification
  submittedSearchKeywords: string;                              // User's final search keywords
  submittedDiscriminator: string;                               // User's final discriminator

  // CONFIGURATION
  strictness: 'low' | 'medium' | 'high';
  selectedSource: string;

  // API RESPONSE OBJECTS
  evidenceSpecResponse: EvidenceSpecificationResponse | null;    // Full AI response for evidence spec
  searchKeywordsResponse: SearchKeywordsResponse | null;         // Full AI response for keywords
  discriminatorResponse: DiscriminatorGenerationResponse | null; // Full AI response for discriminator
  keywordsCountResult: { total_count: number; sources_searched: string[] } | null;
  searchResults: SearchExecutionResponse | null;

  // RESULTS DATA
  filteredArticles: FilteredArticle[];
  filteringInProgress: boolean;
  searchLimitationNote: string | null;
  totalRetrieved: number | null;
  savedCustomColumns: any[];

  // SEARCH KEYWORD HISTORY (for SearchQueryStep)
  searchKeywordHistory: SearchKeywordHistoryItem[];

  // FEATURE EXTRACTION
  appliedFeatures: FeatureDefinition[];
  pendingFeatures: FeatureDefinition[];
  extractedData: Record<string, Record<string, any>>; // article_id -> feature_id -> value
  isExtracting: boolean;

  // LOADING STATES
  evidenceSpecLoading: boolean;             // Loading AI evidence specification
  searchKeywordsLoading: boolean;           // Loading AI search keywords
  searchExecutionLoading: boolean;          // Loading search results
  discriminatorLoading: boolean;            // Loading AI discriminator

  // ERROR STATE
  error: string | null;
}

// ================== ACTIONS INTERFACE ==================

interface SmartSearchActions {
  // STEP WORKFLOW
  updateStep: (step: SmartSearchStep) => void;
  canNavigateToStep: (targetStep: SmartSearchStep) => boolean;
  resetToStep: (sessionId: string, step: string) => Promise<void>;
  resetAllState: () => void;

  // STEP 1: Evidence Specification
  generateEvidenceSpecification: () => Promise<EvidenceSpecificationResponse>;
  updateOriginalQuestion: (question: string) => void;
  updateSubmittedEvidenceSpec: (spec: string) => void;

  // STEP 2: Search Keyword Generation  
  generateKeywords: (source?: string) => Promise<SearchKeywordsWithCountResponse>;
  updateSubmittedSearchKeywords: (keywords: string) => void;
  updateSelectedSource: (source: string) => void;

  // STEP 3: Query Testing and Optimization
  testKeywordsCount: (keywordsOverride?: string) => Promise<{ total_count: number; sources_searched: string[] }>;
  testAndAddToHistory: (query: string) => Promise<{ total_count: number; sources_searched: string[] }>;
  generateOptimizedKeywords: (evidenceSpecOverride?: string) => Promise<any>;
  optimizeAndAddToHistory: () => Promise<void>;
  updateSearchKeywordHistory: (history: SearchKeywordHistoryItem[]) => void;

  // STEP 4: Search Execution
  search: (offset?: number, maxResults?: number) => Promise<SearchExecutionResponse>;

  // STEP 5: Discriminator Generation
  generateDiscriminator: () => Promise<DiscriminatorGenerationResponse>;
  updateSubmittedDiscriminator: (discriminator: string) => void;
  updateStrictness: (strictness: 'low' | 'medium' | 'high') => void;

  // STEP 6: Filtering
  filterArticles: () => Promise<any>;

  // STEP 7: Feature Extraction
  addPendingFeature: (feature: FeatureDefinition) => void;
  removePendingFeature: (featureId: string) => void;
  removeAppliedFeature: (featureId: string) => void;
  extractFeatures: () => Promise<FeatureExtractionResponse>;
  updateSavedCustomColumns: (columns: any[]) => void;

  // UTILITY
  clearError: () => void;
}

// ================== CONTEXT ==================

interface SmartSearchContextType extends SmartSearchState, SmartSearchActions { }

const SmartSearchContext = createContext<SmartSearchContextType | undefined>(undefined);

// ================== PROVIDER COMPONENT ==================

interface SmartSearchProviderProps {
  children: React.ReactNode;
}

export function SmartSearchProvider({ children }: SmartSearchProviderProps) {
  const [searchParams] = useSearchParams();
  const resumeSessionId = searchParams.get('session');

  // ================== STATE ==================

  // Workflow state
  const [step, setStep] = useState<SmartSearchStep>('query');
  const [sessionId, setSessionId] = useState<string | null>(null);

  // User input
  const [originalQuestion, setOriginalQuestion] = useState('');

  // AI-generated versions
  const [generatedEvidenceSpec, setGeneratedEvidenceSpec] = useState('');
  const [generatedSearchKeywords, setGeneratedSearchKeywords] = useState('');
  const [generatedDiscriminator, setGeneratedDiscriminator] = useState('');

  // User-submitted versions
  const [submittedEvidenceSpec, setSubmittedEvidenceSpec] = useState('');
  const [submittedSearchKeywords, setSubmittedSearchKeywords] = useState('');
  const [submittedDiscriminator, setSubmittedDiscriminator] = useState('');

  // Configuration
  const [strictness, setStrictness] = useState<'low' | 'medium' | 'high'>('medium');
  const [selectedSource, setSelectedSource] = useState<string>(() => {
    return localStorage.getItem('smartSearchSelectedSource') || 'pubmed';
  });

  // API response objects
  const [evidenceSpecResponse, setEvidenceSpecResponse] = useState<EvidenceSpecificationResponse | null>(null);
  const [searchKeywordsResponse, setSearchKeywordsResponse] = useState<SearchKeywordsResponse | null>(null);
  const [discriminatorResponse, setDiscriminatorResponse] = useState<DiscriminatorGenerationResponse | null>(null);
  const [keywordsCountResult, setKeywordsCountResult] = useState<{ total_count: number; sources_searched: string[] } | null>(null);
  const [searchResults, setSearchResults] = useState<SearchExecutionResponse | null>(null);

  // Results data
  const [filteredArticles, setFilteredArticles] = useState<FilteredArticle[]>([]);
  const [searchLimitationNote, setSearchLimitationNote] = useState<string | null>(null);
  const [totalRetrieved, setTotalRetrieved] = useState<number | null>(null);
  const [savedCustomColumns, setSavedCustomColumns] = useState<any[]>([]);

  // Feature extraction state
  const [appliedFeatures, setAppliedFeatures] = useState<FeatureDefinition[]>([]);
  const [pendingFeatures, setPendingFeatures] = useState<FeatureDefinition[]>([]);
  const [extractedData, setExtractedData] = useState<Record<string, Record<string, any>>>({});
  const [isExtracting, setIsExtracting] = useState(false);

  // Search keyword history for SearchQueryStep
  const [searchKeywordHistory, setSearchKeywordHistory] = useState<SearchKeywordHistoryItem[]>([]);

  // Loading states
  const [evidenceSpecLoading, setEvidenceSpecLoading] = useState(false);
  const [searchKeywordsLoading, setSearchKeywordsLoading] = useState(false);
  const [searchExecutionLoading, setSearchExecutionLoading] = useState(false);
  const [discriminatorLoading, setDiscriminatorLoading] = useState(false);
  const [filteringInProgress, setFilteringInProgress] = useState(false);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // ================== EFFECTS ==================

  // Sync appliedFeatures with savedCustomColumns when they change
  useEffect(() => {
    if (savedCustomColumns && savedCustomColumns.length > 0) {
      setAppliedFeatures(savedCustomColumns);
    }
  }, [savedCustomColumns]);

  // Save selected source to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('smartSearchSelectedSource', selectedSource);
  }, [selectedSource]);


  // Load existing session if session ID is provided in URL
  useEffect(() => {
    if (!resumeSessionId) return;

    const loadSession = async () => {
      try {
        const session = await smartSearchApi.getSession(resumeSessionId);

        // Restore session state
        setSessionId(session.id);
        setOriginalQuestion(session.original_question || '');

        // Restore AI-generated versions
        setGeneratedEvidenceSpec(session.generated_evidence_spec || '');
        setGeneratedSearchKeywords(session.generated_search_keywords || '');
        setGeneratedDiscriminator(session.generated_discriminator || '');

        // Restore user-submitted versions
        setSubmittedEvidenceSpec(session.submitted_evidence_spec || session.generated_evidence_spec || '');
        setSubmittedSearchKeywords(session.submitted_search_keywords || session.generated_search_keywords || '');
        setSubmittedDiscriminator(session.submitted_discriminator || session.generated_discriminator || '');

        // Restore additional component state based on available data
        const lastStep = session.last_step_completed;

        // Always create evidence spec response object if we're at or past refinement step
        if (lastStep && isBackendStepAtOrAfter(lastStep, 'refinement')) {
          setEvidenceSpecResponse({
            original_query: session.original_question,
            evidence_specification: session.generated_evidence_spec || '',
            session_id: session.id
          });
        }

        // Always create search keywords response object if we're at or past search query step
        if (lastStep && isBackendStepAtOrAfter(lastStep, 'search-query')) {
          const keywords = session.submitted_search_keywords || session.generated_search_keywords || '';
          setSearchKeywordsResponse({
            search_keywords: keywords,
            evidence_specification: session.submitted_evidence_spec || session.generated_evidence_spec || '',
            session_id: session.id
          });
          // IMPORTANT: Also set the submitted keywords so SearchQueryStep doesn't crash
          setSubmittedSearchKeywords(keywords);
        }

        if (session.search_metadata) {
          setKeywordsCountResult({
            total_count: session.search_metadata.total_available || 0,
            sources_searched: session.search_metadata.sources_searched || []
          });

          // Reconstruct searchResults state for proper display of article counts
          if (lastStep && isBackendStepAtOrAfter(lastStep, 'search-results')) {
            setSearchResults({
              articles: [], // We don't store the actual articles in session, only metadata
              pagination: {
                total_available: session.search_metadata.total_available || 0,
                returned: session.search_metadata.total_retrieved || 0,
                offset: 0,
                has_more: (session.search_metadata.total_retrieved || 0) < (session.search_metadata.total_available || 0)
              },
              sources_searched: session.search_metadata.sources_searched || [],
              session_id: session.id
            });
          }
        }

        // Always create discriminator response if we're at discriminator step or later
        if (lastStep && isBackendStepAtOrAfter(lastStep, 'discriminator')) {
          setDiscriminatorResponse({
            discriminator_prompt: session.generated_discriminator || '',
            evidence_specification: session.submitted_evidence_spec || session.generated_evidence_spec || '',
            search_keywords: session.submitted_search_keywords || session.generated_search_keywords || '',
            strictness: session.filter_strictness || 'medium',
            session_id: session.id
          });
        }

        if (session.filter_strictness) {
          setStrictness(session.filter_strictness as 'low' | 'medium' | 'high');
        }

        // Restore filtered articles if they exist
        if (session.filtered_articles && Array.isArray(session.filtered_articles)) {
          setFilteredArticles(session.filtered_articles);
        }

        // Restore custom columns if they exist
        if (session.filtering_metadata?.custom_columns) {
          setSavedCustomColumns(session.filtering_metadata.custom_columns);
        }

        // Determine which step to show based on session progress  
        let frontendStep = mapBackendToFrontend(lastStep || 'question_input');

        // Handle special cases that need session context
        if (lastStep === 'search_execution') {
          // Only show search-results if we have metadata, otherwise fall back
          frontendStep = session.search_metadata?.total_available ? 'search-results' : 'search-query';
        } else if (lastStep === 'filtering') {
          // If filtering is complete (has results), show results step
          frontendStep = session.filtering_metadata?.accepted !== undefined ? 'results' : 'filtering';
        }

        // Restore search keyword history from session data if we're at or past search-query step
        if (isBackendStepAtOrAfter(lastStep || 'question_input', 'search-query')) {
          // Extract search keyword history directly from backend
          if (session.search_metadata?.search_keyword_history) {
            const history = session.search_metadata.search_keyword_history.map((item: any) => ({
              ...item,
              timestamp: new Date(item.timestamp)
            }));
            setSearchKeywordHistory(history);
          } else {
            setSearchKeywordHistory([]);
          }
        }

        setStep(frontendStep);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load session';
        setError(errorMessage);
        console.error('Failed to load session from URL:', err);
      }
    };

    loadSession();
  }, [resumeSessionId]);

  // ================== WORKFLOW MANAGEMENT ==================

  const updateStep = useCallback((newStep: SmartSearchStep) => {
    setStep(newStep);
  }, []);

  const canNavigateToStep = useCallback((targetStep: SmartSearchStep): boolean => {
    // Can't go back to current or future steps, and can't go back if no session exists yet
    return isStepBefore(targetStep, step) && sessionId !== null;
  }, [step, sessionId]);

  const resetToStep = useCallback(async (sessionId: string, targetStep: string) => {
    try {
      const resetResponse = await smartSearchApi.resetSessionToStep(sessionId, targetStep);

      // Use the session from the reset response instead of making another API call
      const session = resetResponse.session;

      // Restore session state
      setSessionId(session.id);
      setOriginalQuestion(session.original_question || '');

      // Restore AI-generated versions
      setGeneratedEvidenceSpec(session.generated_evidence_spec || '');
      setGeneratedSearchKeywords(session.generated_search_keywords || '');
      setGeneratedDiscriminator(session.generated_discriminator || '');

      // Restore user-submitted versions
      setSubmittedEvidenceSpec(session.submitted_evidence_spec || session.generated_evidence_spec || '');
      setSubmittedSearchKeywords(session.submitted_search_keywords || session.generated_search_keywords || '');
      setSubmittedDiscriminator(session.submitted_discriminator || session.generated_discriminator || '');

      // Clear frontend state for steps forward of target
      const frontendStep = mapBackendToFrontend(targetStep);

      // Restore response objects based on what step we're at
      const lastStep = session.last_step_completed;

      if (lastStep && isBackendStepAtOrAfter(lastStep, 'refinement')) {
        setEvidenceSpecResponse({
          original_query: session.original_question,
          evidence_specification: session.generated_evidence_spec || '',
          session_id: session.id
        });
      } else {
        setEvidenceSpecResponse(null);
      }

      // Check if we should restore search keywords response (if user has progressed past keyword generation)
      if (lastStep && isBackendStepAtOrAfter(lastStep, 'search-query')) {
        const keywords = session.submitted_search_keywords || session.generated_search_keywords || '';
        setSearchKeywordsResponse({
          evidence_specification: session.submitted_evidence_spec || '',
          search_keywords: keywords,
          session_id: session.id
        });
        // IMPORTANT: Also set the submitted keywords so SearchQueryStep doesn't crash
        setSubmittedSearchKeywords(keywords);

        // Restore keywordsCountResult from search_metadata if available
        if (session.search_metadata) {
          setKeywordsCountResult({
            total_count: session.search_metadata.total_available || 0,
            sources_searched: session.search_metadata.sources_searched || []
          });
        }
      } else {
        setSearchKeywordsResponse(null);
        setKeywordsCountResult(null);
      }

      if (lastStep && isBackendStepAtOrAfter(lastStep, 'discriminator')) {
        setDiscriminatorResponse({
          evidence_specification: session.submitted_evidence_spec || '',
          search_keywords: session.submitted_search_keywords || session.generated_search_keywords || '',
          strictness: session.filter_strictness || 'medium',
          discriminator_prompt: session.generated_discriminator || '',
          session_id: session.id
        });
      } else {
        setDiscriminatorResponse(null);
      }

      // Clear data for steps beyond the reset point
      // Handle search keyword history based on where we're stepping back to
      if (isStepBefore(frontendStep, 'search-query')) {
        // Stepping back before search-query step - clear all search keyword history
        setSearchKeywordHistory([]);
      } else if (frontendStep === 'search-query' || isBackendStepAtOrAfter(lastStep || 'question_input', 'search-query')) {
        // Restore search keyword history directly from backend (it's preserved now)
        if (session.search_metadata?.search_keyword_history) {
          const history = session.search_metadata.search_keyword_history.map((item: any) => ({
            ...item,
            timestamp: new Date(item.timestamp)
          }));
          setSearchKeywordHistory(history);
        } else {
          setSearchKeywordHistory([]);
        }
      }

      if (isStepBefore(frontendStep, 'search-results')) {
        setSearchResults(null);
      } else if (targetStep === 'search_execution') {
        // Need to restore search results when going back to search-results step
        if (session.submitted_search_keywords || session.generated_search_keywords) {
          try {
            const searchResponse = await smartSearchApi.search({
              search_keywords: session.submitted_search_keywords || session.generated_search_keywords || '',
              max_results: 50,
              offset: 0,
              session_id: session.id,
              selected_sources: session.search_metadata?.sources_searched || ['pubmed']
            });
            setSearchResults(searchResponse);
          } catch (error) {
            console.error('Failed to restore search results:', error);
            setSearchResults(null);
          }
        }
      }

      if (isStepBefore(frontendStep, 'filtering')) {
        setFilteredArticles([]);
        setFilteringInProgress(false);
      }

      // Update the current step to match the target
      setStep(frontendStep);

      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to reset session';
      setError(errorMessage);
      throw err;
    }
  }, []);

  const resetAllState = useCallback(() => {
    setStep('query');
    setSessionId(null);
    setOriginalQuestion('');
    setGeneratedEvidenceSpec('');
    setGeneratedSearchKeywords('');
    setGeneratedDiscriminator('');
    setSubmittedEvidenceSpec('');
    setSubmittedSearchKeywords('');
    setSubmittedDiscriminator('');
    setEvidenceSpecResponse(null);
    setSearchKeywordsResponse(null);
    setDiscriminatorResponse(null);
    setKeywordsCountResult(null);
    setSearchResults(null);
    setFilteredArticles([]);
    setFilteringInProgress(false);
    setSearchKeywordHistory([]);
    setError(null);
  }, []);



  // ================== STEP BUSINESS METHODS ==================

  // Step 1: Evidence Specification
  const updateOriginalQuestion = useCallback((question: string) => {
    setOriginalQuestion(question);
  }, []);

  const generateEvidenceSpecification = useCallback(async (): Promise<EvidenceSpecificationResponse> => {
    if (!originalQuestion.trim()) {
      throw new Error('Please enter your research question');
    }

    setEvidenceSpecLoading(true);
    setError(null);

    try {
      const response = await smartSearchApi.createEvidenceSpec({
        query: originalQuestion,
        session_id: sessionId || undefined
      });

      setEvidenceSpecResponse(response);
      setGeneratedEvidenceSpec(response.evidence_specification);
      setSubmittedEvidenceSpec(response.evidence_specification); // Initially same as generated
      setSessionId(response.session_id);

      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Evidence specification failed';
      setError(errorMessage);
      throw err;
    } finally {
      setEvidenceSpecLoading(false);
    }
  }, [originalQuestion, sessionId]);

  const updateSubmittedEvidenceSpec = useCallback((spec: string) => {
    setSubmittedEvidenceSpec(spec);
  }, []);

  // Step 2: Search Keyword Generation with automatic count testing
  const generateKeywords = useCallback(async (source?: string): Promise<SearchKeywordsWithCountResponse> => {
    if (!submittedEvidenceSpec.trim()) {
      throw new Error('Please provide an evidence specification');
    }
    if (!sessionId) {
      throw new Error('Session not found. Please start over.');
    }

    // Update source if provided
    if (source) {
      setSelectedSource(source);
    }

    setSearchKeywordsLoading(true);
    setError(null);

    try {
      const response = await smartSearchApi.generateKeywords({
        evidence_specification: submittedEvidenceSpec,
        session_id: sessionId,
        selected_sources: [source || selectedSource]
      });

      setSearchKeywordsResponse(response);
      setGeneratedSearchKeywords(response.search_keywords);
      setSubmittedSearchKeywords(response.search_keywords); // Initially same as generated

      // Automatically test the generated keywords count
      try {
        const countResponse = await smartSearchApi.testKeywordsCount({
          search_keywords: response.search_keywords,
          session_id: sessionId,
          selected_sources: [source || selectedSource]
        });

        const countResult = {
          total_count: countResponse.total_count,
          sources_searched: countResponse.sources_searched
        };

        setKeywordsCountResult(countResult);

        // Automatically add generated query to search history
        const newHistoryItem: SearchKeywordHistoryItem = {
          query: response.search_keywords.trim(),
          count: countResponse.total_count,
          changeType: "system_generated",
          timestamp: new Date()
        };
        
        setSearchKeywordHistory([newHistoryItem]);

        return {
          ...response,
          count_result: countResult
        };
      } catch (countErr) {
        // If count test fails, still return the successful keyword generation
        console.warn('Count test failed after keyword generation:', countErr);
        return response;
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Keyword generation failed';
      setError(errorMessage);
      throw err;
    } finally {
      setSearchKeywordsLoading(false);
    }
  }, [submittedEvidenceSpec, sessionId, selectedSource]);

  const updateSubmittedSearchKeywords = useCallback((keywords: string) => {
    setSubmittedSearchKeywords(keywords);
  }, []);

  const updateSelectedSource = useCallback((source: string) => {
    setSelectedSource(source);
  }, []);

  // Step 3: Keywords Testing and Optimization
  const testKeywordsCount = useCallback(async (keywordsOverride?: string): Promise<{ total_count: number; sources_searched: string[] }> => {
    const keywordsToTest = keywordsOverride || submittedSearchKeywords;
    if (!keywordsToTest.trim()) {
      throw new Error('Search keywords are required');
    }
    if (!sessionId) {
      throw new Error('Session not found. Please start over.');
    }

    try {
      const response = await smartSearchApi.testKeywordsCount({
        search_keywords: keywordsToTest,
        session_id: sessionId,
        selected_sources: [selectedSource]
      });

      const result = {
        total_count: response.total_count,
        sources_searched: response.sources_searched
      };

      setKeywordsCountResult(result);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Keywords count test failed';
      setError(errorMessage);
      throw err;
    }
  }, [submittedSearchKeywords, sessionId, selectedSource]);

  const generateOptimizedKeywords = useCallback(async (evidenceSpecOverride?: string) => {
    const specToUse = evidenceSpecOverride || submittedEvidenceSpec;
    if (!submittedSearchKeywords.trim()) {
      throw new Error('Search keywords are required');
    }
    if (!specToUse.trim()) {
      throw new Error('Evidence specification is required');
    }
    if (!sessionId) {
      throw new Error('Session not found. Please start over.');
    }

    try {
      const response = await smartSearchApi.generateOptimizedKeywords({
        current_keywords: submittedSearchKeywords,
        evidence_specification: specToUse,
        target_max_results: 250,
        session_id: sessionId,
        selected_sources: [selectedSource]
      });

      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Keywords optimization failed';
      setError(errorMessage);
      throw err;
    }
  }, [submittedSearchKeywords, submittedEvidenceSpec, sessionId, selectedSource]);

  const updateSearchKeywordHistory = useCallback((history: SearchKeywordHistoryItem[]) => {
    setSearchKeywordHistory(history);
  }, []);

  const testAndAddToHistory = useCallback(async (query: string): Promise<{ total_count: number; sources_searched: string[] }> => {
    if (!query.trim()) {
      throw new Error('Query is required');
    }

    // Check if query is already in history
    const isQueryInHistory = searchKeywordHistory.some(item => item.query === query.trim());
    if (isQueryInHistory) {
      throw new Error('Query is already in history');
    }

    try {
      const result = await testKeywordsCount(query);
      
      // Add to history
      const newHistoryItem: SearchKeywordHistoryItem = {
        query: query.trim(),
        count: result.total_count,
        changeType: "user_edited",
        timestamp: new Date()
      };
      
      setSearchKeywordHistory([...searchKeywordHistory, newHistoryItem]);
      return result;
    } catch (err) {
      throw err;
    }
  }, [searchKeywordHistory, testKeywordsCount]);

  const optimizeAndAddToHistory = useCallback(async (): Promise<void> => {
    if (!submittedSearchKeywords?.trim()) {
      throw new Error('Current search keywords are required');
    }

    try {
      const result = await generateOptimizedKeywords(submittedEvidenceSpec);

      // Check if we got a valid result
      if (!result || !result.final_keywords) {
        throw new Error('Invalid optimization result received');
      }

      // Update the submitted keywords with optimized version
      setSubmittedSearchKeywords(result.final_keywords);

      // Add optimization to history
      const newHistoryItem: SearchKeywordHistoryItem = {
        query: result.final_keywords.trim(),
        count: result.final_count || 0,
        changeType: "ai_optimized",
        refinementDetails: result.refinement_applied || 'Query optimized',
        timestamp: new Date()
      };
      
      setSearchKeywordHistory([...searchKeywordHistory, newHistoryItem]);
    } catch (err) {
      throw err;
    }
  }, [submittedSearchKeywords, submittedEvidenceSpec, generateOptimizedKeywords, searchKeywordHistory]);

  // Step 4: Search Execution
  const search = useCallback(async (offset = 0, maxResults?: number): Promise<SearchExecutionResponse> => {
    if (!submittedSearchKeywords.trim()) {
      throw new Error('Please provide search keywords');
    }
    if (!sessionId) {
      throw new Error('Session not found. Please start over.');
    }

    setSearchExecutionLoading(true);
    setError(null);

    try {
      // Sync search keyword history to backend before executing search (only for initial search)
      if (offset === 0 && searchKeywordHistory.length > 0) {
        try {
          // Convert Date to ISO string and changeType to snake_case for backend
          const historyForBackend = searchKeywordHistory.map(item => ({
            query: item.query,
            count: item.count,
            change_type: item.changeType,  // Convert to snake_case for backend
            refinement_details: item.refinementDetails,
            timestamp: item.timestamp.toISOString()
          }));
          await smartSearchApi.updateSearchKeywordHistory(sessionId, historyForBackend);
        } catch (historyError) {
          // Log error but don't fail the search
          console.error('Failed to sync query history:', historyError);
        }
      }

      const batchSize = maxResults || (selectedSource === 'google_scholar' ? 20 : 50);
      const results = await smartSearchApi.search({
        search_keywords: submittedSearchKeywords,
        max_results: batchSize,
        offset: offset,
        session_id: sessionId,
        selected_sources: [selectedSource]
      });

      if (offset === 0) {
        // Initial search
        setSearchResults(results);
      } else {
        // Load more - combine with existing results
        setSearchResults(prevResults => {
          if (!prevResults) return results;

          return {
            ...results,
            articles: [...prevResults.articles, ...results.articles],
            pagination: {
              ...results.pagination,
              returned: prevResults.articles.length + results.articles.length
            }
          };
        });
      }

      return results;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Search execution failed';
      setError(errorMessage);
      throw err;
    } finally {
      setSearchExecutionLoading(false);
    }
  }, [submittedSearchKeywords, sessionId, selectedSource, searchKeywordHistory]);


  // Step 5: Discriminator Generation
  const generateDiscriminator = useCallback(async (): Promise<DiscriminatorGenerationResponse> => {
    if (!submittedEvidenceSpec.trim()) {
      throw new Error('Evidence specification is missing. Please go back and complete the previous steps.');
    }
    if (!submittedSearchKeywords.trim()) {
      throw new Error('Search keywords are missing. Please go back and complete the previous steps.');
    }
    if (!sessionId) {
      throw new Error('Session not found. Please start over.');
    }

    setDiscriminatorLoading(true);
    setError(null);

    try {
      const response = await smartSearchApi.generateDiscriminator({
        evidence_specification: submittedEvidenceSpec,
        search_keywords: submittedSearchKeywords,
        strictness: strictness,
        session_id: sessionId
      });

      setDiscriminatorResponse(response);
      setGeneratedDiscriminator(response.discriminator_prompt);
      setSubmittedDiscriminator(response.discriminator_prompt); // Initially same as generated

      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Discriminator generation failed';
      setError(errorMessage);
      throw err;
    } finally {
      setDiscriminatorLoading(false);
    }
  }, [submittedEvidenceSpec, submittedSearchKeywords, strictness, sessionId]);

  const updateSubmittedDiscriminator = useCallback((discriminator: string) => {
    setSubmittedDiscriminator(discriminator);
  }, []);

  const updateStrictness = useCallback((newStrictness: 'low' | 'medium' | 'high') => {
    setStrictness(newStrictness);
  }, []);

  // Step 6: Filtering
  const filterArticles = useCallback(async () => {
    if (!submittedEvidenceSpec.trim()) {
      throw new Error('Evidence specification is missing');
    }
    if (!submittedSearchKeywords.trim()) {
      throw new Error('Search keywords are missing');
    }
    if (!submittedDiscriminator.trim()) {
      throw new Error('Discriminator is missing');
    }
    if (!sessionId) {
      throw new Error('Session not found');
    }
    if (!searchResults) {
      throw new Error('No search results to filter');
    }

    setError(null);
    setFilteringInProgress(true);

    try {
      const totalAvailable = searchResults.pagination.total_available;
      const articlesToProcess = totalAvailable; // Backend will cap this at configured limit

      const request = {
        evidence_specification: submittedEvidenceSpec,
        search_keywords: submittedSearchKeywords,
        strictness: strictness,
        discriminator_prompt: submittedDiscriminator,
        session_id: sessionId,
        selected_sources: [selectedSource],
        max_results: articlesToProcess
      };

      const response = await smartSearchApi.filterArticles(request);
      setFilteredArticles(response.filtered_articles);

      // Store the retrieved count
      setTotalRetrieved(response.total_retrieved);

      // Store the limitation note if present
      if (response.search_limitation_note) {
        setSearchLimitationNote(response.search_limitation_note);
      }

      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Article filtering failed';
      setError(errorMessage);
      throw err;
    } finally {
      setFilteringInProgress(false);
    }
  }, [submittedEvidenceSpec, submittedSearchKeywords, submittedDiscriminator, strictness, sessionId, selectedSource, searchResults]);


  // Step 7: Feature Extraction
  const addPendingFeature = useCallback((feature: FeatureDefinition) => {
    setPendingFeatures(prev => [...prev, feature]);
  }, []);

  const removePendingFeature = useCallback((featureId: string) => {
    setPendingFeatures(prev => prev.filter(f => f.id !== featureId));
  }, []);

  const removeAppliedFeature = useCallback((featureId: string) => {
    setAppliedFeatures(prev => prev.filter(f => f.id !== featureId));
    // Remove from extracted data
    setExtractedData(prev => {
      const newData = { ...prev };
      Object.keys(newData).forEach(articleId => {
        if (newData[articleId][featureId]) {
          delete newData[articleId][featureId];
        }
      });
      return newData;
    });
    // Remove from filtered articles' extracted_features
    setFilteredArticles(prev => prev.map(item => ({
      ...item,
      article: {
        ...item.article,
        extracted_features: item.article.extracted_features 
          ? Object.fromEntries(
              Object.entries(item.article.extracted_features).filter(([key]) => key !== featureId)
            )
          : undefined
      }
    })));
  }, []);

  const extractFeatures = useCallback(async (): Promise<FeatureExtractionResponse> => {
    if (!sessionId) {
      throw new Error('No session ID available');
    }

    if (pendingFeatures.length === 0) {
      throw new Error('No features selected for extraction');
    }

    setError(null);
    setIsExtracting(true);

    try {
      const response = await smartSearchApi.extractFeatures({
        session_id: sessionId,
        features: pendingFeatures
      });

      // Move pending features to applied
      setAppliedFeatures(prev => [...prev, ...pendingFeatures]);
      setPendingFeatures([]);
      
      // Store extracted data
      setExtractedData(response.results);
      
      // Update filtered articles with extracted features
      setFilteredArticles(prev => prev.map(item => {
        const articleFeatures = response.results[item.article.id];
        if (articleFeatures) {
          return {
            ...item,
            article: {
              ...item.article,
              extracted_features: {
                ...(item.article.extracted_features || {}),
                ...articleFeatures
              }
            }
          };
        }
        return item;
      }));

      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Feature extraction failed';
      setError(errorMessage);
      throw err;
    } finally {
      setIsExtracting(false);
    }
  }, [sessionId, pendingFeatures]);

  const updateSavedCustomColumns = useCallback((columns: any[]) => {
    setSavedCustomColumns(columns);
  }, []);

  // ================== UTILITY ==================

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // ================== CONTEXT VALUE ==================

  const contextValue: SmartSearchContextType = {
    // State
    step,
    sessionId,
    originalQuestion,
    generatedEvidenceSpec,
    generatedSearchKeywords,
    generatedDiscriminator,
    submittedEvidenceSpec,
    submittedSearchKeywords,
    submittedDiscriminator,
    strictness,
    selectedSource,
    evidenceSpecResponse,
    searchKeywordsResponse,
    discriminatorResponse,
    keywordsCountResult,
    searchResults,
    filteredArticles,
    filteringInProgress,
    searchLimitationNote,
    totalRetrieved,
    savedCustomColumns,
    searchKeywordHistory,
    appliedFeatures,
    pendingFeatures,
    extractedData,
    isExtracting,
    evidenceSpecLoading,
    searchKeywordsLoading,
    searchExecutionLoading,
    discriminatorLoading,
    error,

    // Actions
    updateStep,
    canNavigateToStep,
    resetToStep,
    resetAllState,
    generateEvidenceSpecification,
    updateOriginalQuestion,
    updateSubmittedEvidenceSpec,
    generateKeywords,
    updateSubmittedSearchKeywords,
    updateSelectedSource,
    testKeywordsCount,
    testAndAddToHistory,
    generateOptimizedKeywords,
    optimizeAndAddToHistory,
    updateSearchKeywordHistory,
    search,
    generateDiscriminator,
    updateSubmittedDiscriminator,
    updateStrictness,
    filterArticles,
    addPendingFeature,
    removePendingFeature,
    removeAppliedFeature,
    extractFeatures,
    updateSavedCustomColumns,
    clearError,
  };

  return (
    <SmartSearchContext.Provider value={contextValue}>
      {children}
    </SmartSearchContext.Provider>
  );
}

// ================== HOOK ==================

export function useSmartSearch() {
  const context = useContext(SmartSearchContext);
  if (!context) {
    throw new Error('useSmartSearch must be used within a SmartSearchProvider');
  }
  return context;
}