import { api } from './index';
import { Collection, CollectionArticle } from '../../types/collection';

export const collectionApi = {
    async list(scope?: string, streamId?: number): Promise<Collection[]> {
        const params = new URLSearchParams();
        if (scope) params.append('scope', scope);
        if (streamId) params.append('stream_id', String(streamId));
        const query = params.toString();
        const response = await api.get(`/api/collections${query ? '?' + query : ''}`);
        return response.data;
    },

    async get(collectionId: number): Promise<Collection> {
        const response = await api.get(`/api/collections/${collectionId}`);
        return response.data;
    },

    async create(data: { name: string; description?: string; scope?: string; stream_id?: number }): Promise<Collection> {
        const response = await api.post('/api/collections', data);
        return response.data;
    },

    async update(collectionId: number, data: { name?: string; description?: string }): Promise<Collection> {
        const response = await api.put(`/api/collections/${collectionId}`, data);
        return response.data;
    },

    async delete(collectionId: number): Promise<void> {
        await api.delete(`/api/collections/${collectionId}`);
    },

    async addArticle(collectionId: number, articleId: number, notes?: string): Promise<void> {
        await api.post(`/api/collections/${collectionId}/articles`, { article_id: articleId, notes });
    },

    async removeArticle(collectionId: number, articleId: number): Promise<void> {
        await api.delete(`/api/collections/${collectionId}/articles/${articleId}`);
    },

    async getArticles(collectionId: number): Promise<{ articles: CollectionArticle[] }> {
        const response = await api.get(`/api/collections/${collectionId}/articles`);
        return response.data;
    },
};
