import type { SmartSearchArticle } from '@/types/smart-search';
import type { CanonicalResearchArticle } from '@/types/canonical_types';

// --- Helper transforms ---

export function _toCanonicalResearchArticle(article: SmartSearchArticle): CanonicalResearchArticle {
    const canonical: CanonicalResearchArticle = {
        id: article.id,
        source: article.source,
        title: article.title,
        authors: article.authors || [],
        keywords: article.keywords || [],
        mesh_terms: article.mesh_terms || [],
        categories: article.categories || [],
    } as CanonicalResearchArticle;

    if (article.pmid) canonical.pmid = article.pmid;
    if (article.abstract) canonical.abstract = article.abstract;
    if (article.snippet) canonical.snippet = article.snippet;
    if (article.journal) canonical.journal = article.journal;
    if (article.publication_date) canonical.publication_date = article.publication_date;
    if (article.publication_year !== undefined) canonical.publication_year = article.publication_year;
    if (article.date_completed) canonical.date_completed = article.date_completed;
    if (article.date_revised) canonical.date_revised = article.date_revised;
    if (article.date_entered) canonical.date_entered = article.date_entered;
    if (article.date_published) canonical.date_published = article.date_published;
    if (article.doi) canonical.doi = article.doi;
    if (article.url) canonical.url = article.url;
    if (article.pdf_url) canonical.pdf_url = article.pdf_url;
    if (article.citation_count !== undefined) canonical.citation_count = article.citation_count;
    if (article.cited_by_url) canonical.cited_by_url = article.cited_by_url;
    if (article.related_articles_url) canonical.related_articles_url = article.related_articles_url;
    if (article.versions_url) canonical.versions_url = article.versions_url;
    if (article.search_position !== undefined) canonical.search_position = article.search_position;
    if (article.relevance_score !== undefined) canonical.relevance_score = article.relevance_score;
    if (article.extracted_features) canonical.extracted_features = article.extracted_features;
    if (article.quality_scores) canonical.quality_scores = article.quality_scores;
    if (article.source_metadata) canonical.source_metadata = article.source_metadata as Record<string, any>;
    if (article.indexed_at) canonical.indexed_at = article.indexed_at;
    if (article.retrieved_at) canonical.retrieved_at = article.retrieved_at;

    return canonical;
}

export function _toCanonicalResearchArticles(articles: SmartSearchArticle[]): CanonicalResearchArticle[] {
    return articles.map(_toCanonicalResearchArticle);
}

export function _fromCanonicalToSmartArticle(article: CanonicalResearchArticle): SmartSearchArticle {
    return {
        ...article,
        filterStatus: null,
        isDuplicate: false,
        duplicateReason: undefined,
        duplicateMatch: null,
        similarityScore: undefined
    } as SmartSearchArticle;
}

export function _fromCanonicalToSmartArticles(articles: CanonicalResearchArticle[]): SmartSearchArticle[] {
    return articles.map(_fromCanonicalToSmartArticle);
}


