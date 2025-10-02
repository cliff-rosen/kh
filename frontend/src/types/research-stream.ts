// Research Stream domain types - Phase 1 Enhanced

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

export interface ScoringConfig {
    relevance_weight: number;  // 0-1, default 0.6
    evidence_weight: number;   // 0-1, default 0.4
    inclusion_threshold: number;  // 1-10 scale, default 7.0
    max_items_per_report?: number;  // default 10
}

export interface ResearchStream {
    stream_id: number;
    user_id: number;
    stream_name: string;
    description?: string;
    stream_type: StreamType;
    focus_areas: string[];
    competitors: string[];
    report_frequency: ReportFrequency;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    report_count?: number;
    latest_report_date?: string | null;

    // Phase 1: Purpose and Business Context
    purpose?: string;
    business_goals?: string[];
    expected_outcomes?: string;

    // Phase 1: Search Strategy
    keywords?: string[];

    // Phase 1: Scoring Configuration
    scoring_config?: ScoringConfig;
}