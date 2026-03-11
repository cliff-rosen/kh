import { api } from './index';
import { Tag, ArticleTag } from '../../types/tag';

export const tagApi = {
    async list(): Promise<Tag[]> {
        const response = await api.get('/api/tags');
        return response.data;
    },

    async create(data: { name: string; scope?: string; color?: string }): Promise<Tag> {
        const response = await api.post('/api/tags', data);
        return response.data;
    },

    async update(tagId: number, data: { name?: string; color?: string }): Promise<Tag> {
        const response = await api.put(`/api/tags/${tagId}`, data);
        return response.data;
    },

    async delete(tagId: number): Promise<void> {
        await api.delete(`/api/tags/${tagId}`);
    },

    async assign(tagIds: number[], articleIds: number[]): Promise<void> {
        await api.post('/api/tags/assign', { tag_ids: tagIds, article_ids: articleIds });
    },

    async unassign(tagId: number, articleId: number): Promise<void> {
        await api.delete(`/api/tags/assign?tag_id=${tagId}&article_id=${articleId}`);
    },

    async getArticleTags(articleId: number): Promise<ArticleTag[]> {
        const response = await api.get(`/api/tags/articles/${articleId}`);
        return response.data;
    },

    async getTagsForArticles(articleIds: number[]): Promise<Record<number, ArticleTag[]>> {
        if (articleIds.length === 0) return {};
        const response = await api.get(`/api/tags/batch?article_ids=${articleIds.join(',')}`);
        return response.data;
    },

    async getAggregateTags(reportId?: number, collectionId?: number): Promise<(Tag & { article_count: number })[]> {
        const params = new URLSearchParams();
        if (reportId) params.append('report_id', String(reportId));
        if (collectionId) params.append('collection_id', String(collectionId));
        const response = await api.get(`/api/tags/aggregate?${params.toString()}`);
        return response.data;
    },

    async searchByTags(tagIds: number[], streamId?: number, reportId?: number): Promise<{ articles: any[] }> {
        const params = new URLSearchParams();
        params.append('tag_ids', tagIds.join(','));
        if (streamId) params.append('stream_id', String(streamId));
        if (reportId) params.append('report_id', String(reportId));
        const response = await api.get(`/api/tags/search?${params.toString()}`);
        return response.data;
    },
};
