import { api } from './index';
import { UserProfile, CompanyProfile, ProfileCompletenessStatus } from '../../types';

// Request/Response wrapper types
export interface UserProfileUpdateRequest {
    full_name?: string;
    job_title?: string;
    preferences?: string;
}

export interface CompanyProfileUpdateRequest {
    company_name?: string;
    therapeutic_areas?: string[];
    competitors?: string[];
    pipeline_products?: string;
}

export interface UserProfileResponse {
    data: UserProfile;
    message?: string;
}

export interface CompanyProfileResponse {
    data: CompanyProfile;
    message?: string;
}

export interface AllProfilesResponse {
    data: {
        user: UserProfile;
        company: CompanyProfile;
    };
    message?: string;
}

export interface ProfileCompletenessResponse {
    data: ProfileCompletenessStatus;
    message?: string;
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
    async updateUserProfile(updates: UserProfileUpdateRequest): Promise<UserProfile> {
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
    async updateCompanyProfile(updates: CompanyProfileUpdateRequest): Promise<CompanyProfile> {
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