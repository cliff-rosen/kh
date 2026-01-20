/**
 * Canonical Types for Frontend
 *
 * This file contains all canonical type definitions and support methods.
 *
 * Organized to mirror backend schemas/canonical_types.py for easy cross-reference.
 * Section order:
 *   1. Feature Definitions
 *   2. Canonical Type Interfaces
 *   3. Clinical Trial Types
 *   4. Type Registry
 *   5. Utility Functions
 */

import { ArticleEnrichments } from './report';

// ============================================================================
// FEATURE DEFINITIONS
// ============================================================================

export interface CanonicalFeatureDefinition {
    id: string;
    name: string;
    description: string;
    type: 'boolean' | 'text' | 'score' | 'number';
    options?: Record<string, any>;
}

// Type for extracted feature values - aligned with CanonicalFeatureDefinition.type
export type CanonicalFeatureValue = boolean | string | number;
// - boolean: for 'boolean' type features
// - string: for 'text' type features
// - number: for 'score' and 'number' type features

// ============================================================================
// CANONICAL TYPE INTERFACES
// ============================================================================

export interface CanonicalResearchArticle {
    // Core identification
    id: string;
    source: 'pubmed' | 'scholar';
    pmid?: string; // PubMed ID (for PubMed articles)

    // Core metadata
    title: string;
    authors: string[];
    abstract?: string;
    snippet?: string;

    // Publication details
    journal?: string;
    publication_date?: string;
    publication_year?: number;

    // PubMed-specific date fields (always populated for PubMed articles)
    date_completed?: string;     // Date record was completed (YYYY-MM-DD)
    date_revised?: string;       // Date record was last revised (YYYY-MM-DD)
    date_entered?: string;       // Date entered into PubMed (YYYY-MM-DD)
    date_published?: string;     // Publication date with full precision (YYYY-MM-DD)

    // Identifiers and links
    doi?: string;
    url?: string;
    pdf_url?: string;

    // Classification and keywords
    keywords: string[];
    mesh_terms: string[];
    categories: string[];

    // Citation and related content
    citation_count?: number;
    cited_by_url?: string;
    related_articles_url?: string;
    versions_url?: string;

    // Search context
    search_position?: number;
    relevance_score?: number;

    // Research analysis results
    extracted_features?: Record<string, CanonicalFeatureValue>;
    quality_scores?: Record<string, number>;

    // Source preservation
    source_metadata?: Record<string, any>;

    // Enrichment metadata (e.g., abstract source tracking)
    metadata?: Record<string, any>;

    // System metadata
    indexed_at?: string;
    retrieved_at?: string;

    // Report-specific metadata (when article is from a report)
    notes?: string;
    ai_enrichments?: ArticleEnrichments | null;
}

export interface CanonicalEmail {
    id: string;
    subject: string;
    body: string;
    sender: string;
    timestamp: string;
    labels: string[];
    metadata: Record<string, any>;
}

export interface CanonicalSearchResult {
    title: string;
    url: string;
    snippet: string;
    published_date?: string;
    source: string;
    rank: number;
    relevance_score?: number;
    metadata?: Record<string, any>;
}

export interface CanonicalWebpage {
    url: string;
    title: string;
    content: string;
    metadata: {
        description?: string;
        author?: string;
        published_date?: string;
        word_count?: number;
        language?: string;
    };
    extracted_at: string;
}

export interface CanonicalPubMedArticle {
    pmid: string;
    title: string;
    authors: string[];
    journal: string;
    publication_date: string;
    doi?: string;
    abstract?: string;
    keywords: string[];
    mesh_terms: string[];
    url: string;
}

export interface CanonicalNewsletter {
    id: string;
    title: string;
    content: string;
    sender: string;
    received_date: string;
    categories: string[];
    metadata: {
        word_count?: number;
        read_time_minutes?: number;
        sentiment_score?: number;
    };
}

export interface CanonicalDailyNewsletterRecap {
    date: string;
    newsletter_count: number;
    total_word_count: number;
    average_sentiment: number;
    top_categories: string[];
    key_topics: string[];
    summary: string;
    newsletters: CanonicalNewsletter[];
}

export interface CanonicalScholarArticle {
    title: string;
    link?: string;
    authors: string[];
    publication_info?: string;
    snippet?: string;
    cited_by_count?: number;
    cited_by_link?: string;
    related_pages_link?: string;
    versions_link?: string;
    pdf_link?: string;
    year?: number;
    position: number;
    metadata?: Record<string, any>;
}

// ============================================================================
// CLINICAL TRIAL TYPES
// ============================================================================

export interface CanonicalTrialIntervention {
    type: string;           // DRUG, BIOLOGICAL, DEVICE, PROCEDURE, etc.
    name: string;
    description?: string;
}

export interface CanonicalTrialOutcome {
    measure: string;
    time_frame?: string;
}

export interface CanonicalTrialSponsor {
    name: string;
    type?: string;          // INDUSTRY, NIH, ACADEMIC, etc.
}

export interface CanonicalTrialLocation {
    facility?: string;
    city?: string;
    state?: string;
    country: string;
}

export interface CanonicalClinicalTrial {
    // Identifiers
    nct_id: string;
    org_study_id?: string;

    // Basic Info
    title: string;
    brief_title?: string;
    brief_summary?: string;
    detailed_description?: string;

    // Status
    status: string;         // RECRUITING, COMPLETED, TERMINATED, etc.
    status_verified_date?: string;
    start_date?: string;
    completion_date?: string;
    last_update_date?: string;

    // Study Design
    study_type: string;     // INTERVENTIONAL, OBSERVATIONAL
    phase?: string;         // PHASE1, PHASE2, PHASE3, PHASE4, NA
    allocation?: string;    // RANDOMIZED, NON_RANDOMIZED
    intervention_model?: string; // PARALLEL, CROSSOVER, SINGLE_GROUP
    masking?: string;       // NONE, SINGLE, DOUBLE, TRIPLE, QUADRUPLE
    primary_purpose?: string; // TREATMENT, PREVENTION, DIAGNOSTIC

    // Interventions
    interventions: CanonicalTrialIntervention[];

    // Conditions
    conditions: string[];

    // Eligibility
    eligibility_criteria?: string;
    sex?: string;           // ALL, MALE, FEMALE
    min_age?: string;
    max_age?: string;
    healthy_volunteers?: boolean;
    enrollment_count?: number;
    enrollment_type?: string; // ESTIMATED, ACTUAL

    // Outcomes
    primary_outcomes: CanonicalTrialOutcome[];
    secondary_outcomes?: CanonicalTrialOutcome[];

    // Sponsors
    lead_sponsor?: CanonicalTrialSponsor;
    collaborators?: CanonicalTrialSponsor[];

    // Locations
    locations: CanonicalTrialLocation[];
    location_countries: string[];

    // Links
    url: string;

    // Keywords
    keywords: string[];

    // Source metadata
    source_metadata?: Record<string, any>;

    // Extraction and analysis results (for AI columns)
    extracted_features?: Record<string, any>;

    // Timestamps
    retrieved_at?: string;
}

// ============================================================================
// TYPE REGISTRY
// ============================================================================

export type CanonicalType =
    | 'email'
    | 'search_result'
    | 'webpage'
    | 'pubmed_article'
    | 'newsletter'
    | 'daily_newsletter_recap'
    | 'scholar_article';

export const CANONICAL_TYPES: Record<CanonicalType, string> = {
    email: 'Email',
    search_result: 'Search Result',
    webpage: 'Webpage',
    pubmed_article: 'PubMed Article',
    newsletter: 'Newsletter',
    daily_newsletter_recap: 'Daily Newsletter Recap',
    scholar_article: 'Google Scholar Article'
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if a type is a canonical type
 */
export function isCanonicalType(type: string): type is CanonicalType {
    return type in CANONICAL_TYPES;
}

/**
 * Get the human-readable name for a canonical type
 */
export function getCanonicalTypeName(type: CanonicalType): string {
    return CANONICAL_TYPES[type];
}

/**
 * Get all canonical types
 */
export function getAllCanonicalTypes(): CanonicalType[] {
    return Object.keys(CANONICAL_TYPES) as CanonicalType[];
}
