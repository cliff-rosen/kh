/**
 * Unified Search Core Types
 * 
 * Core domain types for the unified search system.
 * API request/response types are defined inline in unifiedSearchApi.ts
 */

export type SearchProvider = "pubmed" | "scholar";

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


export interface ExtractedFeatures {
  // Common features across providers
  relevance_score?: number;
  confidence_score?: number;

  // PubMed-specific features
  clinical_relevance?: "high" | "medium" | "low" | "none";
  study_design?: string;
  evidence_level?: string;
  population_size?: string;
  key_findings?: string;
  methodology_quality?: "excellent" | "good" | "fair" | "poor";
  statistical_significance?: "yes" | "no" | "not reported";
  therapeutic_area?: string;
  intervention_type?: string;
  primary_outcome?: string;
  extraction_notes?: string;

  // Scholar-specific features  
  poi_relevance?: "yes" | "no";
  doi_relevance?: "yes" | "no";
  is_systematic?: "yes" | "no";
  study_type?: "human RCT" | "human non-RCT" | "non-human life science" | "non life science" | "not a study";
  study_outcome?: "effectiveness" | "safety" | "diagnostics" | "biomarker" | "other";
}
