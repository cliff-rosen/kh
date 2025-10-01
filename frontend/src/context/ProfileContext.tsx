import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import {
    profileApi,
    UserProfile,
    CompanyProfile,
    ProfileCompletenessStatus,
    UserProfileUpdate,
    CompanyProfileUpdate,
    handleApiError
} from '../lib/api';

interface ProfileContextType {
    // State
    userProfile: UserProfile | null;
    companyProfile: CompanyProfile | null;
    completenessStatus: ProfileCompletenessStatus | null;
    isLoading: boolean;
    error: string | null;

    // Actions
    loadAllProfiles: () => Promise<void>;
    loadUserProfile: () => Promise<void>;
    loadCompanyProfile: () => Promise<void>;
    updateUserProfile: (updates: UserProfileUpdate) => Promise<void>;
    updateCompanyProfile: (updates: CompanyProfileUpdate) => Promise<void>;
    checkCompleteness: () => Promise<void>;
    clearError: () => void;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

interface ProfileProviderProps {
    children: ReactNode;
}

export function ProfileProvider({ children }: ProfileProviderProps) {
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
    const [completenessStatus, setCompletenessStatus] = useState<ProfileCompletenessStatus | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const clearError = useCallback(() => {
        setError(null);
    }, []);

    const loadAllProfiles = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const profiles = await profileApi.getAllProfiles();
            setUserProfile(profiles.user);
            setCompanyProfile(profiles.company);
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsLoading(false);
        }
    }, []);

    const loadUserProfile = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const profile = await profileApi.getUserProfile();
            setUserProfile(profile);
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsLoading(false);
        }
    }, []);

    const loadCompanyProfile = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const profile = await profileApi.getCompanyProfile();
            setCompanyProfile(profile);
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsLoading(false);
        }
    }, []);

    const updateUserProfile = useCallback(async (updates: UserProfileUpdate) => {
        setIsLoading(true);
        setError(null);
        try {
            const updatedProfile = await profileApi.updateUserProfile(updates);
            setUserProfile(updatedProfile);
            // Refresh completeness status after update
            await checkCompleteness();
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsLoading(false);
        }
    }, []);

    const updateCompanyProfile = useCallback(async (updates: CompanyProfileUpdate) => {
        setIsLoading(true);
        setError(null);
        try {
            const updatedProfile = await profileApi.updateCompanyProfile(updates);
            setCompanyProfile(updatedProfile);
            // Refresh completeness status after update
            await checkCompleteness();
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsLoading(false);
        }
    }, []);

    const checkCompleteness = useCallback(async () => {
        setError(null);
        try {
            const status = await profileApi.checkProfileCompleteness();
            setCompletenessStatus(status);
        } catch (err) {
            setError(handleApiError(err));
        }
    }, []);

    const value: ProfileContextType = {
        // State
        userProfile,
        companyProfile,
        completenessStatus,
        isLoading,
        error,

        // Actions
        loadAllProfiles,
        loadUserProfile,
        loadCompanyProfile,
        updateUserProfile,
        updateCompanyProfile,
        checkCompleteness,
        clearError,
    };

    return (
        <ProfileContext.Provider value={value}>
            {children}
        </ProfileContext.Provider>
    );
}

export function useProfile(): ProfileContextType {
    const context = useContext(ProfileContext);
    if (context === undefined) {
        throw new Error('useProfile must be used within a ProfileProvider');
    }
    return context;
}