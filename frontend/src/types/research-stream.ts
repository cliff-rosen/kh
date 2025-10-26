// Research Stream domain types - Channel-based structure

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
    topics: string[]; // List of topics covered by this category
    specific_inclusions: string[]; // Category-specific inclusion criteria
}

export interface ScoringConfig {
    relevance_weight: number;  // 0-1, default 0.6
    evidence_weight: number;   // 0-1, default 0.4
    inclusion_threshold: number;  // 1-10 scale, default 7.0
    max_items_per_report?: number;  // default 10
}

// ============================================================================
// Channel-Centric Workflow Configuration
// ============================================================================

export interface SourceQuery {
    query_expression: string;  // Source-specific query expression
    enabled: boolean;  // Whether this source is active for this channel
}

export interface SemanticFilter {
    enabled: boolean;
    criteria: string;  // Text description of what should pass/fail
    threshold: number;  // 0.0 to 1.0 confidence threshold
}

export interface CategoryWorkflowConfig {
    source_queries: Record<string, SourceQuery | null>;  // Map: source_id -> SourceQuery (null = selected but not configured yet)
    semantic_filter: SemanticFilter;  // Semantic filtering for this category
}

export interface WorkflowConfig {
    category_configs: Record<string, CategoryWorkflowConfig>;  // Map: category_id -> CategoryWorkflowConfig
    article_limit_per_week?: number;
}

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
    stream_id: number;
    user_id: number;
    stream_name: string;
    purpose: string;

    // Scope definition
    audience: string[];
    intended_guidance: string[];
    global_inclusion: string[];
    global_exclusion: string[];
    categories: Category[];

    report_frequency: ReportFrequency;
    is_active: boolean;
    created_at: string;
    updated_at: string;

    // Configuration
    workflow_config?: WorkflowConfig;
    scoring_config?: ScoringConfig;

    // Aggregated data
    report_count?: number;
    latest_report_date?: string | null;
}