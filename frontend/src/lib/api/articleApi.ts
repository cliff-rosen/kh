import { api } from './index';
import { CanonicalResearchArticle } from '../../types/canonical_types';

export const articleApi = {
    /**
     * Fetch a single article by PMID
     */
    async getArticleByPmid(pmid: string): Promise<CanonicalResearchArticle> {
        const response = await api.get(`/api/articles/${pmid}`);
        return response.data;
    }
};
