import { api } from './index';
import { CanonicalResearchArticle } from '../../types/canonical_types';

export interface FullTextLink {
    provider: string;
    url: string;
    categories: string[];
    is_free: boolean;
}

export interface FullTextLinksResponse {
    pmid: string;
    links: FullTextLink[];
}

export const articleApi = {
    /**
     * Fetch a single article by PMID
     */
    async getArticleByPmid(pmid: string): Promise<CanonicalResearchArticle> {
        const response = await api.get(`/api/articles/${pmid}`);
        return response.data;
    },

    /**
     * Fetch full text link options for an article from PubMed's LinkOut system
     */
    async getFullTextLinks(pmid: string): Promise<FullTextLinksResponse> {
        const response = await api.get(`/api/articles/${pmid}/full-text-links`);
        return response.data;
    }
};
