import { api, handleApiError } from './index';

export interface Newsletter {
    id: number;
    source_name: string;
    issue_identifier?: string;
    email_date: string;
    subject_line?: string;
    raw_content?: string;
    cleaned_content?: string;
    extraction?: any;
    processed_status?: string;
}

export interface NewsletterPagination {
    page: number;
    page_size: number;
    total_count: number;
    total_pages: number;
}

export interface GetNewslettersResponse {
    newsletters: Newsletter[];
    pagination: NewsletterPagination;
}

export interface GetNewsletterSummaryResponse {
    summary: string;
    source_count: number;
    source_ids: number[];
}

export interface ExtractNewsletterResponse {
    success: boolean;
    data: {
        newsletter: Newsletter;
        extraction: any;
    };
    message?: string;
}

export interface ExtractNewsletterRangeResponse {
    success: boolean;
    data: {
        processed: number;
        total: number;
        errors?: string[];
    };
    message?: string;
}

export const newsletterApi = {
    async getNewsletters(params: {
        page?: number;
        page_size?: number;
        source_name?: string;
        processed_status?: string;
        start_date?: string;
        end_date?: string;
    }): Promise<GetNewslettersResponse> {
        try {
            const response = await api.get('/api/newsletter/list', { params });
            return response.data.data;
        } catch (error) {
            throw handleApiError(error);
        }
    },

    async getNewsletterSummary(params: {
        period_type: string;
        start_date: string;
        end_date: string;
    }): Promise<GetNewsletterSummaryResponse> {
        try {
            const response = await api.get('/api/newsletter/summary', { params });
            return response.data.data;
        } catch (error) {
            throw handleApiError(error);
        }
    },

    async extractNewsletter(newsletter: Newsletter): Promise<ExtractNewsletterResponse> {
        try {
            const response = await api.post('/api/newsletter/extract', newsletter);
            return response.data;
        } catch (error) {
            throw handleApiError(error);
        }
    },

    async extractNewsletterRange(params: {
        min_id: number;
        max_id: number;
    }): Promise<ExtractNewsletterRangeResponse> {
        try {
            const response = await api.post('/api/newsletter/extract/range', params);
            return response.data;
        } catch (error) {
            throw handleApiError(error);
        }
    }
}; 