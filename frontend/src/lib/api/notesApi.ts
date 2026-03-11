/**
 * Notes API — unified article notes (decoupled from report/collection context)
 */

import { api } from './index';

export interface ArticleNoteData {
    note_id: number;
    article_id: number;
    user_id: number;
    author_name: string;
    content: string;
    visibility: 'personal' | 'shared';
    context_type?: string | null;
    context_id?: number | null;
    created_at: string;
    updated_at: string;
}

export interface NotesListResponse {
    article_id: number;
    notes: ArticleNoteData[];
    total_count: number;
}

export const notesApi = {
    async getNotes(articleId: number): Promise<NotesListResponse> {
        const response = await api.get(`/api/notes/articles/${articleId}`);
        return response.data;
    },

    async createNote(
        articleId: number,
        data: { content: string; visibility?: string; context_type?: string; context_id?: number }
    ): Promise<ArticleNoteData> {
        const response = await api.post(`/api/notes/articles/${articleId}`, data);
        return response.data;
    },

    async updateNote(
        noteId: number,
        data: { content?: string; visibility?: string }
    ): Promise<ArticleNoteData> {
        const response = await api.put(`/api/notes/notes/${noteId}`, data);
        return response.data;
    },

    async deleteNote(noteId: number): Promise<void> {
        await api.delete(`/api/notes/notes/${noteId}`);
    },

    async getNotesCountsBatch(articleIds: number[]): Promise<Record<number, number>> {
        if (articleIds.length === 0) return {};
        const response = await api.get(`/api/notes/articles/batch/counts?article_ids=${articleIds.join(',')}`);
        return response.data;
    },
};
