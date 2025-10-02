import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import {
    profileApi,
    UserProfileUpdateRequest,
    CompanyProfileUpdateRequest,
    handleApiError
} from '../lib/api';
import { UserProfile, CompanyProfile, ProfileCompletenessStatus } from '../types';

interface ProfileContextType {
    // State
    userProfile: UserProfile | null;
    companyProfile: CompanyProfile | null;
    completenessStatus: ProfileCompletenessStatus | null;
    isLoading: boolean;
    error: string | null;

    // Actions
    loadFullProfile: () => Promise<void>;
    loadUserProfile: () => Promise<void>;
    loadCompanyProfile: () => Promise<void>;
    updateUserProfile: (updates: UserProfileUpdateRequest) => Promise<void>;
    updateCompanyProfile: (updates: CompanyProfileUpdateRequest) => Promise<void>;
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

    const loadFullProfile = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const profiles = await profileApi.getFullProfile();
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

    const updateUserProfile = useCallback(async (updates: UserProfileUpdateRequest) => {
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

    const updateCompanyProfile = useCallback(async (updates: CompanyProfileUpdateRequest) => {
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
        loadFullProfile,
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