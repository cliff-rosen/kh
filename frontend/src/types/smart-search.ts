/**
 * Smart Search Domain Models
 * 
 * Core business objects for the Smart Search feature.
 * These are shared data structures used across multiple components.
 * API-specific request/response models are defined in @/lib/api/smartSearchApi.
 */

import { CanonicalResearchArticle } from './canonical_types';

// Re-export the canonical type for convenience
export type { CanonicalResearchArticle } from './canonical_types';

// Legacy alias for backward compatibility during migration  
export type SearchArticle = CanonicalResearchArticle;

export interface SearchPaginationInfo {
  total_available: number;
  returned: number;
  offset: number;
  has_more: boolean;
}

// Legacy type for backward compatibility
export interface FilteredArticle {
  article: CanonicalResearchArticle;
  passed: boolean;
  confidence: number;
  reasoning: string;
}

// Unified article type that holds everything
export interface SmartSearchArticle extends CanonicalResearchArticle {
  // Filter status (null when not filtered)
  filterStatus?: {
    passed: boolean;
    confidence: number;
    reasoning: string;
  } | null;

  // Duplicate detection (for Scholar results compared against PubMed)
  isDuplicate?: boolean;
  duplicateReason?: string;
  duplicateMatch?: SmartSearchArticle | null;
  similarityScore?: number;

  // Note: extracted_features is already defined in CanonicalResearchArticle
}

export interface FilteringProgress {
  total: number;
  processed: number;
  accepted: number;
  rejected: number;
  current_article?: string;
}


// ============================================================================
// Search Keyword History
// ============================================================================

export interface SearchKeywordHistoryItem {
  query: string;
  count: number;
  changeType: 'system_generated' | 'ai_optimized' | 'user_edited';
  refinementDetails?: string;
  timestamp: Date;  // Date object in frontend, converted to ISO string for backend
}

// ============================================================================
// Step Definitions - Single Source of Truth with Numeric Ordering
// ============================================================================

// Step definition with numeric ordering
export const SMART_SEARCH_STEP_DEFINITIONS = {
  'query': { order: 1, backend: 'question_input' },
  'refinement': { order: 2, backend: 'question_refinement' }, 
  'search-query': { order: 3, backend: 'search_query_generation' },
  'searching': { order: 4, backend: 'search_execution' },  // transient state
  'search-results': { order: 5, backend: 'search_execution' },
  'discriminator': { order: 6, backend: 'discriminator_generation' },
  'filtering': { order: 7, backend: 'filtering' },  // transient state
  'results': { order: 8, backend: 'filtering' }  // completed filtering
} as const;

export type SmartSearchStep = keyof typeof SMART_SEARCH_STEP_DEFINITIONS;
export type BackendStepName = typeof SMART_SEARCH_STEP_DEFINITIONS[SmartSearchStep]['backend'];

// Legacy compatibility - step mapping
export const SMART_SEARCH_STEPS = Object.fromEntries(
  Object.entries(SMART_SEARCH_STEP_DEFINITIONS).map(([step, def]) => [step, def.backend])
) as Record<SmartSearchStep, BackendStepName>;

// Step order array (derived from numeric ordering)
export const STEP_ORDER: SmartSearchStep[] = Object.entries(SMART_SEARCH_STEP_DEFINITIONS)
  .sort(([, a], [, b]) => a.order - b.order)
  .map(([step]) => step as SmartSearchStep);

// Helper functions using numeric ordering system
export function mapFrontendToBackend(frontendStep: SmartSearchStep): BackendStepName {
  return SMART_SEARCH_STEP_DEFINITIONS[frontendStep].backend;
}

export function mapBackendToFrontend(backendStep: string): SmartSearchStep {
  // Find all frontend steps that map to this backend step
  const matchingSteps = Object.entries(SMART_SEARCH_STEP_DEFINITIONS)
    .filter(([, def]) => def.backend === backendStep)
    .map(([frontend, def]) => ({ frontend: frontend as SmartSearchStep, order: def.order }));
  
  if (matchingSteps.length === 0) {
    // If no match found, return the first step (query) as fallback
    return 'query';
  }
  
  if (matchingSteps.length === 1) {
    // Single match, return it
    return matchingSteps[0].frontend;
  }
  
  // Multiple matches - return the one with the highest order number (most "completed" state)
  // This handles cases like search_execution -> search-results (not searching)
  // and filtering -> results (not filtering)
  return matchingSteps.reduce((prev, curr) => 
    curr.order > prev.order ? curr : prev
  ).frontend;
}

// Numeric ordering utilities
export function getStepOrder(step: SmartSearchStep): number {
  return SMART_SEARCH_STEP_DEFINITIONS[step].order;
}

export function isStepBefore(step1: SmartSearchStep, step2: SmartSearchStep): boolean {
  return getStepOrder(step1) < getStepOrder(step2);
}

export function isStepAfter(step1: SmartSearchStep, step2: SmartSearchStep): boolean {
  return getStepOrder(step1) > getStepOrder(step2);
}

export function isStepAtOrAfter(step1: SmartSearchStep, step2: SmartSearchStep): boolean {
  return getStepOrder(step1) >= getStepOrder(step2);
}

export function isStepAtOrBefore(step1: SmartSearchStep, step2: SmartSearchStep): boolean {
  return getStepOrder(step1) <= getStepOrder(step2);
}

export function compareSteps(step1: SmartSearchStep, step2: SmartSearchStep): number {
  return getStepOrder(step1) - getStepOrder(step2);
}

export function getStepsBetween(startStep: SmartSearchStep, endStep: SmartSearchStep, inclusive = false): SmartSearchStep[] {
  const startOrder = getStepOrder(startStep);
  const endOrder = getStepOrder(endStep);
  
  const minOrder = Math.min(startOrder, endOrder);
  const maxOrder = Math.max(startOrder, endOrder);
  
  return STEP_ORDER.filter(step => {
    const order = getStepOrder(step);
    return inclusive 
      ? order >= minOrder && order <= maxOrder
      : order > minOrder && order < maxOrder;
  });
}

// Helper function to check if a backend step is at or after a frontend step
export function isBackendStepAtOrAfter(backendStep: string, frontendStep: SmartSearchStep): boolean {
  const backendAsFrontend = mapBackendToFrontend(backendStep);
  return isStepAtOrAfter(backendAsFrontend, frontendStep);
}

// ============================================================================
// Session Management Types (matching backend schemas)
// ============================================================================

export interface SmartSearchSession {
  id: string;
  user_id: string;
  created_at: string | null;
  updated_at: string | null;
  original_question: string;
  generated_evidence_spec: string | null;
  submitted_evidence_spec: string | null;
  generated_search_keywords: string | null;
  submitted_search_keywords: string | null;
  search_metadata: {
    total_available?: number;
    total_retrieved?: number;
    sources_searched?: string[];
    [key: string]: any;
  } | null;
  articles_retrieved_count: number;
  articles_selected_count: number;
  generated_discriminator: string | null;
  submitted_discriminator: string | null;
  filter_strictness: 'low' | 'medium' | 'high' | null;
  filtering_metadata: {
    accepted?: number;
    rejected?: number;
    total_processed?: number;
    custom_columns?: any[];
    [key: string]: any;
  } | null;
  filtered_articles: FilteredArticle[] | null;
  status: string;
  last_step_completed: string | null;
  session_duration_seconds: number | null;
  total_api_calls: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
}

export interface SessionListResponse {
  sessions: SmartSearchSession[];
  total: number;
}

export interface SessionResetResponse {
  message: string;
  session: SmartSearchSession;
}