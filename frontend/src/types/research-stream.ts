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

export interface SemanticFilter {
    enabled: boolean;
    criteria: string | null;
    threshold: number | null;
}

export interface Channel {
    name: string;
    focus: string;
    type: StreamType;
    keywords: string[];
    semantic_filter?: SemanticFilter;
}

export interface ScoringConfig {
    relevance_weight: number;  // 0-1, default 0.6
    evidence_weight: number;   // 0-1, default 0.4
    inclusion_threshold: number;  // 1-10 scale, default 7.0
    max_items_per_report?: number;  // default 10
}

export interface ChannelSourceQuery {
    channel_name: string;  // Which channel this query is for
    query_expression: string;  // Customized query for this source/channel combination
}

export interface WorkflowSource {
    source_id: string;  // Reference to authoritative source (e.g., "pubmed", "google_scholar")
    enabled: boolean;
    channel_queries: ChannelSourceQuery[];  // Query expressions for each channel
}

export interface WorkflowConfig {
    sources?: WorkflowSource[];
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
    channels: Channel[];
    report_frequency: ReportFrequency;
    is_active: boolean;
    created_at: string;
    updated_at: string;

    // Computed from channels
    stream_type: StreamType;

    // Configuration
    workflow_config?: WorkflowConfig;
    scoring_config?: ScoringConfig;

    // Aggregated data
    report_count?: number;
    latest_report_date?: string | null;
}