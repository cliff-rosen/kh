// Profile domain types

export interface UserProfile {
    user_id: number;
    email: string;
    full_name?: string;
    job_title?: string;
    preferences?: string;
    created_at: string;
    updated_at: string;
}

export interface CompanyProfile {
    company_id: number;
    user_id: number;
    company_name?: string;
    therapeutic_areas?: string[];
    competitors?: string[];
    pipeline_products?: string;
    created_at: string;
    updated_at: string;
}

export interface ProfileCompletenessStatus {
    user_profile_complete: boolean;
    company_profile_complete: boolean;
    missing_user_fields: string[];
    missing_company_fields: string[];
    can_create_research_stream: boolean;
}