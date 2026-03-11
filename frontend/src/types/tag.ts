export interface Tag {
    tag_id: number;
    name: string;
    color?: string;
    scope: 'personal' | 'organization';
    created_by: number;
    created_at: string;
}

export interface ArticleTag {
    tag_id: number;
    name: string;
    color?: string;
    scope: string;
}
