export interface Collection {
    collection_id: number;
    name: string;
    description?: string;
    scope: 'personal' | 'organization' | 'stream';
    stream_id?: number;
    article_count: number;
    created_by: number;
    created_at: string;
    updated_at: string;
}

export interface CollectionArticle {
    article_id: number;
    title: string;
    authors: string[];
    journal?: string;
    pmid?: string;
    doi?: string;
    abstract?: string;
    url?: string;
    pub_year?: number;
    pub_month?: number;
    pub_day?: number;
    added_at: string;
    added_by: number;
}
