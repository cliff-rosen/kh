import { api } from './index';

export interface ExplorerSource {
    type: 'stream' | 'collection' | 'pubmed';
    id?: number;
    name: string;
    report_name?: string;
}

export interface ExplorerArticle {
    article_id: number | null;
    title: string;
    authors: any;
    journal?: string;
    pmid?: string;
    doi?: string;
    abstract?: string;
    url?: string;
    pub_year?: number;
    pub_month?: number;
    pub_day?: number;
    sources: ExplorerSource[];
    is_local: boolean;
}

export interface PubMedPagination {
    total: number;
    offset: number;
    returned: number;
    overlap_count: number;
    has_more: boolean;
}

export interface ExplorerSearchResponse {
    articles: ExplorerArticle[];
    total: number;
    sources_searched: string[];
    local_count: number;
    pubmed: PubMedPagination | null;
}

export interface OverlapCheckResponse {
    collection_name: string;
    existing_count: number;
    selected_count: number;
    new_ids: number[];
    overlap_ids: number[];
    new_articles: { article_id: number; title: string; authors: any }[];
    overlap_articles: { article_id: number; title: string; authors: any }[];
    final_count: number;
}

export const explorerApi = {
    async search(params: {
        q: string;
        include_streams?: boolean;
        stream_ids?: number[];
        include_collections?: boolean;
        collection_ids?: number[];
        include_pubmed?: boolean;
        limit?: number;
        pubmed_limit?: number;
        pubmed_offset?: number;
    }): Promise<ExplorerSearchResponse> {
        const qs = new URLSearchParams();
        qs.append('q', params.q);
        if (params.include_streams) qs.append('include_streams', 'true');
        if (params.stream_ids?.length) qs.append('stream_ids', params.stream_ids.join(','));
        if (params.include_collections) qs.append('include_collections', 'true');
        if (params.collection_ids?.length) qs.append('collection_ids', params.collection_ids.join(','));
        if (params.include_pubmed) qs.append('include_pubmed', 'true');
        if (params.limit) qs.append('limit', String(params.limit));
        if (params.pubmed_limit) qs.append('pubmed_limit', String(params.pubmed_limit));
        if (params.pubmed_offset) qs.append('pubmed_offset', String(params.pubmed_offset));
        const response = await api.get(`/api/articles/explorer-search?${qs.toString()}`);
        return response.data;
    },

    async checkOverlap(collectionId: number, articleIds: number[]): Promise<OverlapCheckResponse> {
        const response = await api.post(`/api/collections/${collectionId}/check-overlap`, { article_ids: articleIds });
        return response.data;
    },
};
