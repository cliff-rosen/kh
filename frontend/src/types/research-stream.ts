// Research Stream domain types

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
}