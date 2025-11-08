// Research Stream domain types - Channel-based structure

import { SemanticSpace } from './semantic-space';

export enum StreamType {
    COMPETITIVE = 'competitive',
    REGULATORY = 'regulatory',
    CLINICAL = 'clinical',
    MARKET = 'market',
    SCIENTIFIC = 'scientific',
    MIXED = 'mixed'
}

export enum ReportFrequency {
    DAILY = 'daily',
    WEEKLY = 'weekly',
    BIWEEKLY = 'biweekly',
    MONTHLY = 'monthly'
}

export interface Category {
    id: string; // Unique identifier for this category (e.g., 'medical_health')
    name: string; // Display name for the category
    topics: string[]; // List of topic_ids from semantic space covered by this category
    specific_inclusions: string[]; // Category-specific inclusion criteria
}

// ============================================================================
// Retrieval Configuration - Group-Based
// ============================================================================

export interface SourceQuery {
    query_expression: string;  // Source-specific query expression
    enabled: boolean;  // Whether this source is active
}

export interface SemanticFilter {
    enabled: boolean;
    criteria: string;  // Text description of what should pass/fail
    threshold: number;  // 0.0 to 1.0 confidence threshold
}

export interface GenerationMetadata {
    generated_at: string;  // ISO 8601 datetime
    generated_by: string;  // Who/what generated this (e.g., 'llm:gpt-4', 'user:manual')
    reasoning: string;  // Explanation of why this was generated
    confidence?: number;  // 0-1 confidence score
    inputs_considered: string[];  // topic_ids, entity_ids considered
    human_edited: boolean;  // Has a human edited this
}

export interface RetrievalGroup {
    group_id: string;  // Unique identifier for this retrieval group
    name: string;  // Display name for the group
    covered_topics: string[];  // List of topic_ids from semantic space covered by this group
    rationale: string;  // Why these topics are grouped together for retrieval

    // Retrieval configuration embedded directly
    source_queries: Record<string, SourceQuery | null>;  // Map: source_id -> SourceQuery
    semantic_filter: SemanticFilter;  // Semantic filtering for this group

    // Metadata for auditability
    metadata?: GenerationMetadata;
}

export interface RetrievalConfig {
    retrieval_groups: RetrievalGroup[];  // Retrieval groups organizing topics for efficient search
    article_limit_per_week?: number;  // Maximum articles per week
}

export interface PresentationConfig {
    categories: Category[];    // How to organize results in reports
}

// ============================================================================
// Information Sources
// ============================================================================

export enum SourceType {
    ACADEMIC_DATABASE = 'academic_database',
    SEARCH_ENGINE = 'search_engine',
    PREPRINT_SERVER = 'preprint_server',
    CLINICAL_TRIALS = 'clinical_trials',
    PATENT_DATABASE = 'patent_database',
    REGULATORY_DATABASE = 'regulatory_database'
}

export interface InformationSource {
    source_id: string;
    name: string;
    source_type: SourceType;
    description: string;
    query_syntax: string;
    url: string;
}

export interface ResearchStream {
    // === CORE IDENTITY ===
    stream_id: number;
    user_id: number;
    stream_name: string;
    purpose: string;  // High-level "why this stream exists"

    // === THREE-LAYER ARCHITECTURE ===

    // Layer 1: SEMANTIC SPACE - What information matters (source-agnostic ground truth)
    semantic_space: SemanticSpace;

    // Layer 2: RETRIEVAL CONFIG - How to find & filter content
    retrieval_config: RetrievalConfig;

    // Layer 3: PRESENTATION CONFIG - How to organize results for users
    presentation_config: PresentationConfig;

    // === METADATA ===
    report_frequency: ReportFrequency;
    is_active: boolean;
    created_at: string;  // ISO 8601 datetime string
    updated_at: string;  // ISO 8601 datetime string

    // === AGGREGATED DATA ===
    report_count?: number;
    latest_report_date?: string | null;  // ISO 8601 date string
}