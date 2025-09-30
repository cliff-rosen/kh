import type { CanonicalResearchArticle } from './canonical_types';

export interface SearchPaginationInfo {
    total_available: number;
    returned: number;
    offset: number;
    has_more: boolean;
}

export interface FilteredArticle {
    article: CanonicalResearchArticle;
    passed: boolean;
    confidence: number;
    reasoning: string;
}

export interface SmartSearchArticle extends CanonicalResearchArticle {
    filterStatus?: {
        passed: boolean;
        confidence: number;
        reasoning: string;
    } | null;
    isDuplicate?: boolean;
    duplicateReason?: string;
    duplicateMatch?: SmartSearchArticle | null;
    similarityScore?: number;
}

export interface FilteringStats {
    total_processed: number;
    total_accepted: number;
    total_rejected: number;
    average_confidence: number;
    duration_seconds: number;
}

