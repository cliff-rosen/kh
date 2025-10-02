import { api } from './index';
import { UserProfile, CompanyProfile, ProfileCompletenessStatus } from '../../types';

// Request types that match backend schemas
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

// Response type for /api/profiles/all endpoint
export interface AllProfilesResponse {
    user: UserProfile;
    company: CompanyProfile;
}

export const profileApi = {
    /**
     * Get current user's profile
     */
    async getUserProfile(): Promise<UserProfile> {
        const response = await api.get('/api/profiles/user');
        return response.data;
    },

    /**
     * Update user profile
     */
    async updateUserProfile(updates: UserProfileUpdateRequest): Promise<UserProfile> {
        const response = await api.put('/api/profiles/user', updates);
        return response.data;
    },

    /**
     * Get current user's company profile
     */
    async getCompanyProfile(): Promise<CompanyProfile> {
        const response = await api.get('/api/profiles/company');
        return response.data;
    },

    /**
     * Update company profile
     */
    async updateCompanyProfile(updates: CompanyProfileUpdateRequest): Promise<CompanyProfile> {
        const response = await api.put('/api/profiles/company', updates);
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
    async getAllProfiles(): Promise<AllProfilesResponse> {
        const response = await api.get<AllProfilesResponse>('/api/profiles/all');
        return response.data;
    }
};