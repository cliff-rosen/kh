export interface Report {
    report_id: number;
    user_id: number;
    research_stream_id: number | null;
    report_date: string;
    executive_summary: string;
    key_highlights: string[];
    thematic_analysis: string;
    coverage_stats: Record<string, any>;
    is_read: boolean;
    read_at: string | null;
    created_at: string;
    article_count?: number;
}
