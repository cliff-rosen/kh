/**
 * Canonical Types for Frontend
 * 
 * This file contains all canonical type definitions and support methods.
 * It must be kept in sync with backend/schemas/canonical_types.py
 */

import { SchemaType } from './base';

// --- Canonical Type Interfaces ---

export interface CanonicalFeatureDefinition {
    id: string;
    name: string;
    description: string;
    type: 'boolean' | 'text' | 'score' | 'number';
    options?: Record<string, any>;
}

// Type for extracted feature values - aligned with CanonicalFeatureDefinition.type
export type CanonicalFeatureValue = boolean | string | number;
// - boolean: for 'boolean' type features
// - string: for 'text' type features
// - number: for 'score' and 'number' type featuress

export interface CanonicalResearchArticle {
    // Core identification
    id: string;
    source: 'pubmed' | 'scholar';
    pmid?: string; // PubMed ID (for PubMed articles)

    // Core metadata
    title: string;
    authors: string[];
    abstract?: string;
    snippet?: string;
    
    // Publication details
    journal?: string;
    publication_date?: string;
    publication_year?: number;
    
    // PubMed-specific date fields (always populated for PubMed articles)
    date_completed?: string;     // Date record was completed (YYYY-MM-DD)
    date_revised?: string;       // Date record was last revised (YYYY-MM-DD)
    date_entered?: string;       // Date entered into PubMed (YYYY-MM-DD)
    date_published?: string;     // Publication date with full precision (YYYY-MM-DD)
    
    // Identifiers and links
    doi?: string;
    url?: string;
    pdf_url?: string;
    
    // Classification and keywords
    keywords: string[];
    mesh_terms: string[];
    categories: string[];
    
    // Citation and related content
    citation_count?: number;
    cited_by_url?: string;
    related_articles_url?: string;
    versions_url?: string;
    
    // Search context
    search_position?: number;
    relevance_score?: number;
    
    // Research analysis results
    extracted_features?: Record<string, CanonicalFeatureValue>;
    quality_scores?: Record<string, number>;
    
    // Source preservation
    source_metadata?: Record<string, any>;

    // Enrichment metadata (e.g., abstract source tracking)
    metadata?: Record<string, any>;

    // System metadata
    indexed_at?: string;
    retrieved_at?: string;
}

export interface CanonicalEmail {
    id: string;
    subject: string;
    body: string;
    sender: string;
    timestamp: string;
    labels: string[];
    metadata: Record<string, any>;
}

export interface CanonicalSearchResult {
    title: string;
    url: string;
    snippet: string;
    published_date?: string;
    source: string;
    rank: number;
    relevance_score?: number;
    metadata?: Record<string, any>;
}

export interface CanonicalWebpage {
    url: string;
    title: string;
    content: string;
    metadata: {
        description?: string;
        author?: string;
        published_date?: string;
        word_count?: number;
        language?: string;
    };
    extracted_at: string;
}

export interface CanonicalPubMedArticle {
    pmid: string;
    title: string;
    authors: string[];
    journal: string;
    publication_date: string;
    doi?: string;
    abstract?: string;
    keywords: string[];
    mesh_terms: string[];
    url: string;
}

export interface CanonicalNewsletter {
    id: string;
    title: string;
    content: string;
    sender: string;
    received_date: string;
    categories: string[];
    metadata: {
        word_count?: number;
        read_time_minutes?: number;
        sentiment_score?: number;
    };
}

export interface CanonicalDailyNewsletterRecap {
    date: string;
    newsletter_count: number;
    total_word_count: number;
    average_sentiment: number;
    top_categories: string[];
    key_topics: string[];
    summary: string;
    newsletters: CanonicalNewsletter[];
}

export interface CanonicalScholarArticle {
    title: string;
    link?: string;
    authors: string[];
    publication_info?: string;
    snippet?: string;
    cited_by_count?: number;
    cited_by_link?: string;
    related_pages_link?: string;
    versions_link?: string;
    pdf_link?: string;
    year?: number;
    position: number;
    metadata?: Record<string, any>;
}

// --- Type Registry ---

export type CanonicalType =
    | 'email'
    | 'search_result'
    | 'webpage'
    | 'pubmed_article'
    | 'newsletter'
    | 'daily_newsletter_recap'
    | 'scholar_article';

export const CANONICAL_TYPES: Record<CanonicalType, string> = {
    email: 'Email',
    search_result: 'Search Result',
    webpage: 'Webpage',
    pubmed_article: 'PubMed Article',
    newsletter: 'Newsletter',
    daily_newsletter_recap: 'Daily Newsletter Recap',
    scholar_article: 'Google Scholar Article'
};

// --- Schema Derivation (Auto-generated from interfaces) ---

/**
 * Get the schema definition for a canonical type
 * Schemas are manually kept in sync with the interface definitions above
 */
export function getCanonicalTypeSchema(type: CanonicalType): SchemaType {
    switch (type) {
        case 'email':
            return {
                type: 'email',
                description: 'Email object',
                is_array: false,
                fields: {
                    id: { type: 'string', description: 'Unique email identifier', is_array: false },
                    subject: { type: 'string', description: 'Email subject line', is_array: false },
                    body: { type: 'string', description: 'Email body content', is_array: false },
                    sender: { type: 'string', description: 'Email sender address', is_array: false },
                    timestamp: { type: 'string', description: 'Email timestamp (ISO format)', is_array: false },
                    labels: { type: 'string', description: 'Email labels/categories', is_array: true },
                    metadata: { type: 'object', description: 'Additional email metadata', is_array: false }
                }
            };

        case 'search_result':
            return {
                type: 'search_result',
                description: 'Search Result object',
                is_array: false,
                fields: {
                    title: { type: 'string', description: 'Result title', is_array: false },
                    url: { type: 'string', description: 'Result URL', is_array: false },
                    snippet: { type: 'string', description: 'Result snippet/preview', is_array: false },
                    published_date: { type: 'string', description: 'Publication date (optional)', is_array: false },
                    source: { type: 'string', description: 'Source domain', is_array: false },
                    rank: { type: 'number', description: 'Search result rank', is_array: false },
                    relevance_score: { type: 'number', description: 'Relevance score (optional)', is_array: false },
                    metadata: { type: 'object', description: 'Additional search metadata (optional)', is_array: false }
                }
            };

        case 'webpage':
            return {
                type: 'webpage',
                description: 'Webpage object',
                is_array: false,
                fields: {
                    url: { type: 'string', description: 'Page URL', is_array: false },
                    title: { type: 'string', description: 'Page title', is_array: false },
                    content: { type: 'string', description: 'Page content', is_array: false },
                    metadata: {
                        type: 'object',
                        description: 'Page metadata',
                        is_array: false,
                        fields: {
                            description: { type: 'string', description: 'Page description', is_array: false },
                            author: { type: 'string', description: 'Page author', is_array: false },
                            published_date: { type: 'string', description: 'Publication date', is_array: false },
                            word_count: { type: 'number', description: 'Word count', is_array: false },
                            language: { type: 'string', description: 'Content language', is_array: false }
                        }
                    },
                    extracted_at: { type: 'string', description: 'Extraction timestamp', is_array: false }
                }
            };

        case 'pubmed_article':
            return {
                type: 'pubmed_article',
                description: 'Pubmed Article object',
                is_array: false,
                fields: {
                    pmid: { type: 'string', description: 'PubMed ID', is_array: false },
                    title: { type: 'string', description: 'Article title', is_array: false },
                    authors: { type: 'string', description: 'Article authors', is_array: true },
                    journal: { type: 'string', description: 'Publication journal', is_array: false },
                    publication_date: { type: 'string', description: 'Publication date', is_array: false },
                    doi: { type: 'string', description: 'Digital Object Identifier', is_array: false },
                    abstract: { type: 'string', description: 'Article abstract', is_array: false },
                    keywords: { type: 'string', description: 'Article keywords', is_array: true },
                    mesh_terms: { type: 'string', description: 'MeSH terms', is_array: true },
                    url: { type: 'string', description: 'Article URL', is_array: false }
                }
            };

        case 'newsletter':
            return {
                type: 'newsletter',
                description: 'Newsletter object',
                is_array: false,
                fields: {
                    id: { type: 'string', description: 'Newsletter ID', is_array: false },
                    title: { type: 'string', description: 'Newsletter title', is_array: false },
                    content: { type: 'string', description: 'Newsletter content', is_array: false },
                    sender: { type: 'string', description: 'Newsletter sender', is_array: false },
                    received_date: { type: 'string', description: 'Received date', is_array: false },
                    categories: { type: 'string', description: 'Newsletter categories', is_array: true },
                    metadata: {
                        type: 'object',
                        description: 'Newsletter metadata',
                        is_array: false,
                        fields: {
                            word_count: { type: 'number', description: 'Word count', is_array: false },
                            read_time_minutes: { type: 'number', description: 'Estimated read time', is_array: false },
                            sentiment_score: { type: 'number', description: 'Sentiment score', is_array: false }
                        }
                    }
                }
            };

        case 'daily_newsletter_recap':
            return {
                type: 'daily_newsletter_recap',
                description: 'Daily Newsletter Recap object',
                is_array: false,
                fields: {
                    date: { type: 'string', description: 'Recap date', is_array: false },
                    newsletter_count: { type: 'number', description: 'Number of newsletters', is_array: false },
                    total_word_count: { type: 'number', description: 'Total word count', is_array: false },
                    average_sentiment: { type: 'number', description: 'Average sentiment score', is_array: false },
                    top_categories: { type: 'string', description: 'Top categories', is_array: true },
                    key_topics: { type: 'string', description: 'Key topics', is_array: true },
                    summary: { type: 'string', description: 'Daily summary', is_array: false },
                    newsletters: { type: 'newsletter', description: 'Newsletters in recap', is_array: true }
                }
            };

        case 'scholar_article':
            return {
                type: 'scholar_article',
                description: 'Google Scholar Article object',
                is_array: false,
                fields: {
                    title: { type: 'string', description: 'Article title', is_array: false },
                    link: { type: 'string', description: 'Direct link to the article', is_array: false },
                    authors: { type: 'string', description: 'Article authors', is_array: true },
                    publication_info: { type: 'string', description: 'Publication venue and details', is_array: false },
                    snippet: { type: 'string', description: 'Article snippet/excerpt', is_array: false },
                    cited_by_count: { type: 'number', description: 'Number of citations', is_array: false },
                    cited_by_link: { type: 'string', description: 'Link to citing articles', is_array: false },
                    related_pages_link: { type: 'string', description: 'Link to related articles', is_array: false },
                    versions_link: { type: 'string', description: 'Link to different versions', is_array: false },
                    pdf_link: { type: 'string', description: 'Direct PDF link if available', is_array: false },
                    year: { type: 'number', description: 'Publication year', is_array: false },
                    position: { type: 'number', description: 'Position in search results', is_array: false },
                    metadata: { type: 'object', description: 'Additional Scholar metadata', is_array: false }
                }
            };

        default:
            throw new Error(`Unknown canonical type: ${type}`);
    }
}



// --- Utility Functions ---

/**
 * Check if a type is a canonical type
 */
export function isCanonicalType(type: string): type is CanonicalType {
    return type in CANONICAL_TYPES;
}

/**
 * Get the human-readable name for a canonical type
 */
export function getCanonicalTypeName(type: CanonicalType): string {
    return CANONICAL_TYPES[type];
}

/**
 * Get all canonical types
 */
export function getAllCanonicalTypes(): CanonicalType[] {
    return Object.keys(CANONICAL_TYPES) as CanonicalType[];
}

/**
 * Resolve a schema that references a canonical type by expanding it
 */
export function resolveCanonicalSchema(schema: SchemaType): SchemaType {
    if (!isCanonicalType(schema.type)) {
        return schema;
    }

    try {
        const canonicalSchema = getCanonicalTypeSchema(schema.type);
        // Preserve the original array setting and description
        canonicalSchema.is_array = schema.is_array;
        if (schema.description) {
            canonicalSchema.description = schema.description;
        }
        return canonicalSchema;
    } catch (error) {
        // If we can't resolve the canonical type, return the original
        return schema;
    }
} 