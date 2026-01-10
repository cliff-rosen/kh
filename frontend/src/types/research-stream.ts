// Research Stream domain types - Channel-based structure

import { SemanticSpace } from './semantic-space';
import type { ReportArticle } from './report';

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

// Execution status for pipeline runs
export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed';

// Run type for pipeline executions
export type RunType = 'scheduled' | 'manual' | 'test';

/**
 * Pipeline execution record - tracks each run attempt.
 * This is the single source of truth for execution state.
 */
export interface PipelineExecution {
    id: string;                    // UUID
    stream_id: number;
    status: ExecutionStatus;
    run_type: RunType;
    started_at: string | null;
    completed_at: string | null;
    error: string | null;
    report_id: number | null;
    created_at: string;
}

/**
 * Work-in-progress article during pipeline execution.
 * Represents an article before it's finalized into a report.
 */
export interface WipArticle {
    id: number;
    title: string;
    authors: string[];
    journal: string | null;
    year: string | null;
    pmid: string | null;
    abstract: string | null;
    is_duplicate: boolean;
    duplicate_of_id: number | null;
    passed_semantic_filter: boolean | null;
    filter_rejection_reason: string | null;
    included_in_report: boolean;
    presentation_categories: string[];
}

/**
 * Simplified stream option for dropdowns/filters.
 */
export interface StreamOption {
    stream_id: number;
    stream_name: string;
}

/**
 * Category summary with article count (for report views).
 */
export interface CategoryCount {
    id: string;
    name: string;
    article_count: number;
}

/**
 * Last execution summary for scheduler views.
 */
export interface LastExecution {
    id: string;
    stream_id: number;
    status: ExecutionStatus;
    run_type: RunType;
    started_at: string | null;
    completed_at: string | null;
    error: string | null;
    report_id: number | null;
    report_approval_status: string | null;
    article_count: number | null;
}

/**
 * Execution queue item - pipeline execution with associated report info.
 */
export interface ExecutionQueueItem {
    execution_id: string;
    stream_id: number;
    stream_name: string;
    execution_status: ExecutionStatus;
    run_type: RunType;
    started_at: string | null;
    completed_at: string | null;
    error: string | null;
    created_at: string;
    // Report info (only for completed executions)
    report_id: number | null;
    report_name: string | null;
    approval_status: string | null;
    article_count: number | null;
    approved_by: string | null;
    approved_at: string | null;
    rejection_reason: string | null;
}

/**
 * Full execution details for review.
 */
export interface ExecutionDetail {
    execution_id: string;
    stream_id: number;
    stream_name: string;
    execution_status: ExecutionStatus;
    run_type: RunType;
    started_at: string | null;
    completed_at: string | null;
    error: string | null;
    created_at: string;
    wip_articles: WipArticle[];
    // Retrieval configuration
    start_date: string | null;
    end_date: string | null;
    retrieval_config: Record<string, unknown> | null;
    // Report info (only for completed executions)
    report_id: number | null;
    report_name: string | null;
    approval_status: string | null;
    article_count: number;
    executive_summary: string | null;
    categories: CategoryCount[];
    articles: ReportArticle[];
    approved_by: string | null;
    approved_at: string | null;
    rejection_reason: string | null;
}

/**
 * Scheduled stream with configuration and last execution.
 */
export interface ScheduledStream {
    stream_id: number;
    stream_name: string;
    schedule_config: ScheduleConfig;
    next_scheduled_run: string | null;
    last_execution: LastExecution | null;
}

/**
 * Complete scheduling configuration for a research stream.
 * This is the single source of truth for all scheduling settings.
 */
export interface ScheduleConfig {
    enabled: boolean;
    frequency: ReportFrequency;  // How often to run
    anchor_day?: string | null;  // 'monday'-'sunday' for weekly, or '1'-'31' for monthly
    preferred_time: string;  // HH:MM in user's timezone
    timezone: string;  // e.g., 'America/New_York'
    lookback_days?: number | null;  // Days of articles to fetch, derived from frequency if not set
}


// ============================================================================
// Retrieval Configuration - Concept-Based
// ============================================================================


export interface SemanticFilter {
    enabled: boolean;
    criteria: string;  // Text description of what should pass/fail
    threshold: number;  // 0.0 to 1.0 confidence threshold
}

export interface SourceQuery {
    query_expression: string;  // Source-specific query expression
    enabled: boolean;  // Whether this source is active
}

export enum VolumeStatus {
    TOO_BROAD = 'too_broad',      // > 1000 results/week
    APPROPRIATE = 'appropriate',  // 10-1000 results/week
    TOO_NARROW = 'too_narrow',    // < 10 results/week
    UNKNOWN = 'unknown'           // Not yet tested
}

export interface ConceptEntity {
    entity_id: string;  // Unique identifier (e.g., 'c_e1', 'c_e2')
    name: string;  // Entity name
    entity_type: string;  // Type: methodology, biomarker, disease, treatment, etc.
    canonical_forms: string[];  // Search terms for this entity
    rationale: string;  // Why this entity is needed for topic coverage
    semantic_space_ref: string | null;  // Reference to semantic space entity_id if applicable
}

export interface RelationshipEdge {
    from_entity_id: string;  // Source entity_id from entity_pattern
    to_entity_id: string;    // Target entity_id from entity_pattern
    relation_type: string;   // Type of relationship (e.g., 'causes', 'measures', 'detects')
}

export interface Concept {
    concept_id: string;  // Unique identifier for this concept
    name: string;  // Descriptive name for this concept

    // Core pattern (entities and their relationships)
    entity_pattern: string[];  // List of entity_ids from phase1_analysis that form this pattern (1-3 entities)

    // RIGOROUS relationship graph (machine-parseable)
    relationship_edges: RelationshipEdge[];  // Directed edges defining how entities connect

    // HUMAN-READABLE relationship description
    relationship_description: string;  // Natural language description of entity relationships

    // DEPRECATED: Kept for backward compatibility
    relationship_pattern?: string | null;  // Old field - use relationship_edges and relationship_description instead

    // Coverage (many-to-many with topics)
    covered_topics: string[];  // List of topic_ids from semantic space this concept covers

    // Vocabulary expansion (built from phase1 entity definitions)
    vocabulary_terms: Record<string, string[]>;  // Map: entity_id -> list of synonym terms (from ConceptEntity.canonical_forms)

    // Volume tracking and refinement
    expected_volume: number | null;  // Estimated weekly article count
    volume_status: VolumeStatus;  // Assessment of query volume
    last_volume_check: string | null;  // ISO 8601 datetime when volume was last checked

    // Queries per source
    source_queries: Record<string, SourceQuery>;  // Map: source_id -> SourceQuery configuration

    // Semantic filtering (per concept)
    semantic_filter: SemanticFilter;  // Semantic filtering for this concept

    // Exclusions (use sparingly!)
    exclusions: string[];  // Terms to exclude (last resort only)
    exclusion_rationale: string | null;  // Why exclusions are necessary and safe

    // Metadata
    rationale: string;  // Why this concept pattern covers these topics
    human_edited: boolean;  // Whether human has modified LLM-generated concept
}

export interface BroadQuery {
    query_id: string;  // Unique identifier for this query
    search_terms: string[];  // Core search terms (e.g., ['asbestos', 'mesothelioma'])
    query_expression: string;  // Boolean query expression usable as-is for PubMed (e.g., '(asbestos OR mesothelioma)')
    rationale: string;  // Why these terms capture all relevant literature
    covered_topics: string[];  // List of topic_ids this query covers
    estimated_weekly_volume: number | null;  // Estimated number of articles per week

    // Optional semantic filtering
    semantic_filter: SemanticFilter;  // Optional semantic filtering for this broad query
}

export interface BroadSearchStrategy {
    queries: BroadQuery[];  // Usually 1-3 broad queries that together cover all topics
    strategy_rationale: string;  // Overall explanation of why this broad approach covers the domain
    coverage_analysis: Record<string, any>;  // Analysis of how queries cover topics
}

export interface RetrievalConfig {
    concepts?: Concept[] | null;  // Concept-based retrieval (mutually exclusive with broad_search)
    broad_search?: BroadSearchStrategy | null;  // Broad search retrieval (mutually exclusive with concepts)
    article_limit_per_week?: number;  // Maximum articles per week
}

export interface Category {
    id: string; // Unique identifier for this category (e.g., 'medical_health')
    name: string; // Display name for the category
    topics: string[]; // List of topic_ids from semantic space covered by this category
    specific_inclusions: string[]; // Category-specific inclusion criteria
}

export interface PresentationConfig {
    categories: Category[];    // How to organize results in reports
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

    // === CHAT CONFIGURATION ===
    chat_instructions?: string | null;  // Stream-specific instructions for the AI chat assistant

    // === METADATA ===
    is_active: boolean;
    created_at: string;  // ISO 8601 datetime string
    updated_at: string;  // ISO 8601 datetime string

    // === SCOPE & ORGANIZATION ===
    scope?: 'personal' | 'organization' | 'global';  // Stream visibility scope
    org_id?: number | null;  // Organization ID for organization-scoped streams

    // === SCHEDULING ===
    schedule_config?: ScheduleConfig | null;  // Automated scheduling configuration
    next_scheduled_run?: string | null;  // ISO 8601 datetime when this stream will run next (pre-calculated)
    last_execution_id?: string | null;  // UUID of most recent pipeline execution
    last_execution?: PipelineExecution | null;  // Denormalized last execution (when included)

    // === AGGREGATED DATA ===
    report_count?: number;
    latest_report_date?: string | null;  // ISO 8601 date string
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
