/**
 * Resource Schema Definitions
 *
 * This file contains all TypeScript types and interfaces for defining and
 * managing Resources. Resources represent external systems, APIs, or
 * databases that tools can depend on.
 */

// Resource Types - Frontend equivalent of backend/schemas/resource.py

import { SchemaType } from './base';

// Resource and authentication types
export type AuthFieldType = 'string' | 'secret' | 'url';
export type AuthType = 'oauth2' | 'api_key' | 'basic_auth' | 'none';
export type ResourceType = 'database' | 'api' | 'file_system' | 'messaging' | 'storage' | 'web' | 'social';

export interface AuthField {
    field_name: string;
    field_type: AuthFieldType;
    required: boolean;
    description: string;
}

export interface AuthConfig {
    type: AuthType;
    required_fields: AuthField[];
}

export interface ResourceExample {
    description: string;
    connection_example: Record<string, any>;
    use_case: string;
}

export interface Resource {
    id: string;
    name: string;
    type: ResourceType;
    description: string;
    auth_config?: AuthConfig;
    base_url?: string;
    documentation_url?: string;
    rate_limits?: Record<string, any>;
    connection_schema: SchemaType;
    capabilities: string[];
    examples: ResourceExample[];
    metadata: Record<string, any>;
    created_at: string;
    updated_at: string;
}

// Built-in resource definitions (matching backend)
export const GMAIL_RESOURCE: Resource = {
    id: "gmail",
    name: "Gmail",
    description: "Google Gmail email service for searching and retrieving emails",
    type: "messaging",
    connection_schema: {
        type: "object",
        description: "Gmail OAuth credentials",
        is_array: false,
        fields: {
            "access_token": { type: "string", description: "OAuth access token", is_array: false },
            "refresh_token": { type: "string", description: "OAuth refresh token", is_array: false },
            "token_expires_at": { type: "string", description: "Token expiration timestamp", is_array: false }
        }
    },
    capabilities: ["search", "retrieve", "send", "list_folders"],
    rate_limits: {
        requests_per_minute: 250,
        requests_per_day: 1000000,
        concurrent_requests: 10
    },
    base_url: "https://gmail.googleapis.com",
    documentation_url: "https://developers.google.com/gmail/api",
    examples: [
        {
            description: "Search for emails in Gmail",
            connection_example: {
                "access_token": "ya29.a0...",
                "refresh_token": "1//04...",
                "token_expires_at": "2024-01-15T14:30:00Z"
            },
            use_case: "Retrieve AI newsletter emails from the last month"
        }
    ],
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
};

export const PUBMED_RESOURCE: Resource = {
    id: "pubmed",
    name: "PubMed Database",
    description: "NCBI PubMed database for searching biomedical research articles",
    type: "database",
    connection_schema: {
        type: "object",
        description: "PubMed API configuration",
        is_array: false,
        fields: {
            "api_key": { type: "string", description: "NCBI API key (optional but recommended)", is_array: false },
            "email": { type: "string", description: "Contact email for API usage", is_array: false }
        }
    },
    capabilities: ["search", "retrieve", "get_metadata"],
    rate_limits: {
        requests_per_minute: 10,
        concurrent_requests: 3
    },
    base_url: "https://eutils.ncbi.nlm.nih.gov",
    documentation_url: "https://www.ncbi.nlm.nih.gov/books/NBK25501/",
    examples: [
        {
            description: "Search for research articles",
            connection_example: {
                "api_key": "abc123def456",
                "email": "researcher@university.edu"
            },
            use_case: "Find recent papers on machine learning in healthcare"
        }
    ],
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
};

export const WEB_SEARCH_RESOURCE: Resource = {
    id: "web_search",
    name: "Web Search",
    description: "Search the web using search engines (Google, Bing, etc.)",
    type: "web",
    connection_schema: {
        type: "object",
        description: "Web search API credentials",
        is_array: false,
        fields: {
            "api_key": { type: "string", description: "Search API key", is_array: false },
            "search_engine": { type: "string", description: "Which search engine to use", is_array: false },
            "custom_search_id": { type: "string", description: "Custom search engine ID (if applicable)", is_array: false }
        }
    },
    capabilities: ["search", "get_snippets", "get_urls"],
    rate_limits: {
        requests_per_day: 100,
        concurrent_requests: 2
    },
    examples: [
        {
            description: "Search the web for information",
            connection_example: {
                "api_key": "AIza...",
                "search_engine": "google",
                "custom_search_id": "017576662512468239146:omuauf_lfve"
            },
            use_case: "Find recent news about AI developments"
        }
    ],
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
};

export const DROPBOX_RESOURCE: Resource = {
    id: "dropbox",
    name: "Dropbox",
    description: "Dropbox file storage and sharing service",
    type: "storage",
    connection_schema: {
        type: "object",
        description: "Dropbox API credentials",
        is_array: false,
        fields: {
            "access_token": { type: "string", description: "Dropbox access token", is_array: false },
            "refresh_token": { type: "string", description: "Dropbox refresh token", is_array: false }
        }
    },
    capabilities: ["upload", "download", "list", "search", "share"],
    rate_limits: {
        requests_per_minute: 120,
        concurrent_requests: 5
    },
    base_url: "https://api.dropboxapi.com",
    documentation_url: "https://developers.dropbox.com/documentation",
    examples: [
        {
            description: "Access files in Dropbox",
            connection_example: {
                "access_token": "sl.B...",
                "refresh_token": "1234..."
            },
            use_case: "Download and analyze CSV files from project folder"
        }
    ],
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
};

// Resource registry
export const RESOURCE_REGISTRY: Record<string, Resource> = {
    "gmail": GMAIL_RESOURCE,
    "pubmed": PUBMED_RESOURCE,
    "web_search": WEB_SEARCH_RESOURCE,
    "dropbox": DROPBOX_RESOURCE
};

// Utility functions
export function getResource(resourceId: string): Resource | undefined {
    return RESOURCE_REGISTRY[resourceId];
}

export function getResourcesByType(resourceType: ResourceType): Resource[] {
    return Object.values(RESOURCE_REGISTRY).filter(resource => resource.type === resourceType);
}

export function getResourcesWithCapability(capability: string): Resource[] {
    return Object.values(RESOURCE_REGISTRY).filter(resource =>
        resource.capabilities.includes(capability)
    );
}

// Resource utility functions
export function getResourceAuthFields(resource: Resource): AuthField[] {
    return resource.auth_config?.required_fields || [];
}

export function getRequiredAuthFields(resource: Resource): AuthField[] {
    return resource.auth_config?.required_fields.filter(field => field.required) || [];
}

export function getOptionalAuthFields(resource: Resource): AuthField[] {
    return resource.auth_config?.required_fields.filter(field => !field.required) || [];
}

export function hasSecretFields(resource: Resource): boolean {
    return resource.auth_config?.required_fields.some(field => field.field_type === 'secret') || false;
}

export function getSecretFields(resource: Resource): AuthField[] {
    return resource.auth_config?.required_fields.filter(field => field.field_type === 'secret') || [];
}

export function getUrlFields(resource: Resource): AuthField[] {
    return resource.auth_config?.required_fields.filter(field => field.field_type === 'url') || [];
}

export function getStringFields(resource: Resource): AuthField[] {
    return resource.auth_config?.required_fields.filter(field => field.field_type === 'string') || [];
}

export function validateResourceConfig(resource: Resource, config: Record<string, any>): string[] {
    const errors: string[] = [];
    const requiredFields = getRequiredAuthFields(resource);

    // Check all required fields are present
    for (const field of requiredFields) {
        if (!(field.field_name in config)) {
            errors.push(`Missing required field: ${field.field_name}`);
        }
    }

    // Validate URL fields
    for (const field of getUrlFields(resource)) {
        if (field.field_name in config) {
            try {
                new URL(config[field.field_name]);
            } catch {
                errors.push(`Invalid URL in field: ${field.field_name}`);
            }
        }
    }

    return errors;
} 