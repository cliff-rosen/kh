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

export interface FullTextContentResponse {
    pmid: string;
    pmc_id: string | null;
    full_text: string | null;
    source: 'database' | 'pmc' | null;  // Where the full text came from
    links: FullTextLink[] | null;  // Fallback when no full text
    error: string | null;
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
    },

    /**
     * Fetch full text content from PubMed Central (if available)
     */
    async getFullTextContent(pmid: string): Promise<FullTextContentResponse> {
        const response = await api.get(`/api/articles/${pmid}/full-text`);
        return response.data;
    },

    /**
     * Resolve a list of PMIDs to articles. Creates articles from PubMed if not in local DB.
     */
    async bulkResolvePmids(pmids: string[]): Promise<BulkPmidResult> {
        const response = await api.post('/api/articles/bulk-resolve-pmids', { pmids });
        return response.data;
    }
};

export interface BulkPmidResult {
    found: { article_id: number; title: string; authors: any; journal?: string; pmid?: string; pub_year?: number }[];
    not_found: string[];
}
