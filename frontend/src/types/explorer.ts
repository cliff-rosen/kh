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
