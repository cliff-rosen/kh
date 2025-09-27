import { api, handleApiError } from './index';

export interface EmailLabel {
    id: string;
    name: string;
    type: string;
}

export interface EmailAgentResponse {
    success: boolean;
    data?: any;
    error?: string;
    metadata?: any;
}

export interface EmailSearchParams {
    folders?: string[];
    query_terms?: string[];
    max_results?: number;
    include_attachments?: boolean;
    include_metadata?: boolean;
    date_range?: {
        start: string | null;
        end: string | null;
    };
}

export interface EmailSearchResponse {
    success: boolean;
    data: {
        messages?: any[];
        labels?: EmailLabel[];
        metadata?: {
            progress?: number;
            createdAt?: string;
            estimatedCompletion?: string;
        };
    };
    error?: string;
}

export const emailApi = {
    checkConnection: async (): Promise<boolean> => {
        try {
            const response = await api.get<EmailAgentResponse>('/api/email/labels');
            return response.data.success;
        } catch (error) {
            console.error('Error checking Gmail connection:', error);
            return false;
        }
    },

    initOAuth: async (): Promise<string> => {
        try {
            const response = await api.get<{ url: string }>('/api/email/auth/init');
            if (!response.data.url) {
                throw new Error('No authorization URL received from server');
            }
            return response.data.url;
        } catch (error) {
            console.error('Error initializing OAuth:', error);
            throw new Error(handleApiError(error));
        }
    },

    disconnect: async (): Promise<void> => {
        try {
            await api.post<{ success: boolean; message: string }>('/api/email/auth/disconnect');
        } catch (error) {
            console.error('Error disconnecting Gmail:', error);
            throw new Error(handleApiError(error));
        }
    },

    searchEmails: async (params: EmailSearchParams): Promise<EmailSearchResponse> => {
        try {
            const response = await api.post<EmailSearchResponse>('/api/email/search', params);
            return response.data;
        } catch (error) {
            console.error('Error searching emails:', error);
            throw new Error(handleApiError(error));
        }
    },

    listLabels: async (): Promise<EmailLabel[]> => {
        try {
            const response = await api.get<EmailAgentResponse>('/api/email/labels');
            console.log('Email API Response:', response.data);
            if (!response.data.success) {
                throw new Error(response.data.error || 'Failed to fetch labels');
            }
            if (!response.data.data?.labels) {
                throw new Error('No labels found in response');
            }
            return response.data.data.labels;
        } catch (error) {
            console.error('Error listing labels:', error);
            throw new Error(handleApiError(error));
        }
    }
}; 