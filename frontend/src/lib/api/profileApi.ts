import { api } from './index';

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

export interface UserProfileUpdate {
    full_name?: string;
    job_title?: string;
    preferences?: string;
}

export interface CompanyProfileUpdate {
    company_name?: string;
    therapeutic_areas?: string[];
    competitors?: string[];
    pipeline_products?: string;
}

export const profileApi = {
    /**
     * Get current user's profile
     */
    async getUserProfile(): Promise<UserProfile> {
        const response = await api.get('/api/auth/me');
        return response.data;
    },

    /**
     * Update user profile
     */
    async updateUserProfile(updates: UserProfileUpdate): Promise<UserProfile> {
        const response = await api.put('/api/users/profile', updates);
        return response.data;
    },

    /**
     * Get current user's company profile
     */
    async getCompanyProfile(): Promise<CompanyProfile> {
        const response = await api.get('/api/companies/profile');
        return response.data;
    },

    /**
     * Update company profile
     */
    async updateCompanyProfile(updates: CompanyProfileUpdate): Promise<CompanyProfile> {
        const response = await api.put('/api/companies/profile', updates);
        return response.data;
    },

    /**
     * Check if user and company profiles are complete enough to create research streams
     */
    async checkProfileCompleteness(): Promise<ProfileCompletenessStatus> {
        const response = await api.get('/api/profiles/completeness');
        return response.data;
    },

    /**
     * Get both user and company profiles in one call
     */
    async getAllProfiles(): Promise<{ user: UserProfile; company: CompanyProfile }> {
        const response = await api.get('/api/profiles/all');
        return response.data;
    }
};