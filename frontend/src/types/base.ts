/**
 * Base Schema Definitions
 *
 * This file contains the most fundamental, shared types and interfaces that
 * other schema modules will build upon. It is the root of the new,
 * modular schema system for the frontend.
 */

// --- Common Type Definitions ---

export type PrimitiveType = 'string' | 'number' | 'boolean';
export type CustomType = 'email' | 'webpage' | 'search_result' | 'pubmed_article' | 'newsletter' | 'daily_newsletter_recap' | 'scholar_article';
export type ComplexType = 'object' | 'file' | 'database_entity' | CustomType;
export type ValueType = PrimitiveType | ComplexType;

// Defines the role an asset plays within a workflow.
export type AssetRole = 'input' | 'output' | 'intermediate';

// --- Core Schema Interfaces ---

export interface SchemaType {
    type: ValueType;
    description?: string;
    is_array: boolean;
    fields?: Record<string, SchemaType>; // for nested objects
}

export interface SchemaEntity {
    id: string;
    name: string;
    description: string;
    schema_definition: SchemaType;
}


// --- Utility Functions ---

export function isCustomType(type: ValueType): type is CustomType {
    const customTypes: CustomType[] = ['email', 'webpage', 'search_result', 'pubmed_article', 'newsletter', 'daily_newsletter_recap', 'scholar_article'];
    return customTypes.includes(type as CustomType);
}

export function isPrimitiveType(type: ValueType): type is PrimitiveType {
    const primitiveTypes: PrimitiveType[] = ['string', 'number', 'boolean'];
    return primitiveTypes.includes(type as PrimitiveType);
}

export function getCanonicalTypeSchema(type: CustomType): SchemaType {
    /**
     * Returns the canonical schema structure for a custom type.
     * This is manually kept in sync with backend/schemas/canonical_types.py
     * 
     * NOTE: When updating schemas, update BOTH files:
     * - backend/schemas/canonical_types.py (Pydantic models)
     * - frontend/src/types/base.ts (this function)
     */
    const schemas: Record<CustomType, SchemaType> = {
        email: {
            type: 'email',
            description: 'Email message object',
            is_array: false,
            fields: {
                id: { type: 'string', description: 'Unique email identifier', is_array: false },
                subject: { type: 'string', description: 'Email subject line', is_array: false },
                body: { type: 'string', description: 'Email body content (HTML or plain text)', is_array: false },
                sender: { type: 'string', description: 'Sender email address', is_array: false },
                recipients: { type: 'string', description: 'List of recipient email addresses', is_array: true },
                timestamp: { type: 'string', description: 'Email timestamp (ISO format)', is_array: false },
                labels: { type: 'string', description: 'Email labels/folders', is_array: true },
                thread_id: { type: 'string', description: 'Thread ID if part of conversation', is_array: false },
                snippet: { type: 'string', description: 'Email preview snippet', is_array: false },
                attachments: { type: 'object', description: 'List of email attachments', is_array: true },
                metadata: { type: 'object', description: 'Additional email metadata', is_array: false }
            }
        },
        search_result: {
            type: 'search_result',
            description: 'Web search result object',
            is_array: false,
            fields: {
                title: { type: 'string', description: 'Page title', is_array: false },
                url: { type: 'string', description: 'Page URL', is_array: false },
                snippet: { type: 'string', description: 'Page snippet/description', is_array: false },
                published_date: { type: 'string', description: 'Publication date (ISO format)', is_array: false },
                source: { type: 'string', description: 'Source domain', is_array: false },
                rank: { type: 'number', description: 'Search result rank', is_array: false },
                relevance_score: { type: 'number', description: 'Relevance score (0-1)', is_array: false },
                metadata: { type: 'object', description: 'Additional search metadata', is_array: false }
            }
        },
        webpage: {
            type: 'webpage',
            description: 'Webpage object',
            is_array: false,
            fields: {
                url: { type: 'string', description: 'Webpage URL', is_array: false },
                title: { type: 'string', description: 'Webpage title', is_array: false },
                content: { type: 'string', description: 'Webpage content/text', is_array: false },
                html: { type: 'string', description: 'Raw HTML content', is_array: false },
                last_modified: { type: 'string', description: 'Last modification date (ISO format)', is_array: false },
                content_type: { type: 'string', description: 'Content type (e.g., \'text/html\')', is_array: false },
                status_code: { type: 'number', description: 'HTTP status code', is_array: false },
                headers: { type: 'object', description: 'HTTP headers', is_array: false },
                metadata: { type: 'object', description: 'Additional webpage metadata', is_array: false }
            }
        },
        pubmed_article: {
            type: 'pubmed_article',
            description: 'PubMed article object',
            is_array: false,
            fields: {
                pmid: { type: 'string', description: 'PubMed ID', is_array: false },
                title: { type: 'string', description: 'Article title', is_array: false },
                abstract: { type: 'string', description: 'Article abstract', is_array: false },
                authors: { type: 'string', description: 'List of author names', is_array: true },
                journal: { type: 'string', description: 'Journal name', is_array: false },
                publication_date: { type: 'string', description: 'Publication date', is_array: false },
                doi: { type: 'string', description: 'Digital Object Identifier', is_array: false },
                keywords: { type: 'string', description: 'Article keywords', is_array: true },
                mesh_terms: { type: 'string', description: 'MeSH terms', is_array: true },
                citation_count: { type: 'number', description: 'Number of citations', is_array: false },
                metadata: { type: 'object', description: 'Additional article metadata', is_array: false }
            }
        },
        newsletter: {
            type: 'newsletter',
            description: 'Newsletter object',
            is_array: false,
            fields: {
                id: { type: 'string', description: 'Newsletter unique identifier', is_array: false },
                title: { type: 'string', description: 'Newsletter title', is_array: false },
                content: { type: 'string', description: 'Newsletter content', is_array: false },
                source: { type: 'string', description: 'Newsletter source/publisher', is_array: false },
                publish_date: { type: 'string', description: 'Publication date (ISO format)', is_array: false },
                subject_line: { type: 'string', description: 'Email subject line', is_array: false },
                categories: { type: 'string', description: 'Newsletter categories/tags', is_array: true },
                articles: { type: 'object', description: 'Individual articles within newsletter', is_array: true },
                summary: { type: 'string', description: 'Newsletter summary', is_array: false },
                metadata: { type: 'object', description: 'Additional newsletter metadata', is_array: false }
            }
        },
        daily_newsletter_recap: {
            type: 'daily_newsletter_recap',
            description: 'Daily newsletter recap object',
            is_array: false,
            fields: {
                date: { type: 'string', description: 'Recap date (ISO format)', is_array: false },
                title: { type: 'string', description: 'Recap title', is_array: false },
                summary: { type: 'string', description: 'Daily summary content', is_array: false },
                newsletter_count: { type: 'number', description: 'Number of newsletters processed', is_array: false },
                key_topics: { type: 'string', description: 'Key topics covered', is_array: true },
                sentiment_score: { type: 'number', description: 'Overall sentiment score', is_array: false },
                top_articles: { type: 'object', description: 'Most important articles', is_array: true },
                statistics: { type: 'object', description: 'Processing statistics', is_array: false },
                metadata: { type: 'object', description: 'Additional recap metadata', is_array: false }
            }
        },
        scholar_article: {
            type: 'scholar_article',
            description: 'Google Scholar article object',
            is_array: false,
            fields: {
                title: { type: 'string', description: 'Article title', is_array: false },
                authors: { type: 'string', description: 'Article authors', is_array: true },
                link: { type: 'string', description: 'Link to article', is_array: false },
                snippet: { type: 'string', description: 'Article snippet/summary', is_array: false },
                publication_info: { type: 'string', description: 'Publication information', is_array: false },
                cited_by_count: { type: 'number', description: 'Number of citations', is_array: false },
                related_pages_link: { type: 'string', description: 'Link to related articles', is_array: false },
                versions_link: { type: 'string', description: 'Link to article versions', is_array: false },
                pdf_link: { type: 'string', description: 'Direct PDF link if available', is_array: false },
                year: { type: 'number', description: 'Publication year', is_array: false },
                metadata: { type: 'object', description: 'Additional article metadata', is_array: false }
            }
        }
    };

    return schemas[type];
}