/**
 * Tool Schema Definitions
 *
 * This file contains all TypeScript types and interfaces for defining Tools.
 */

import { SchemaEntity } from './base';
import { Resource } from './resource';

// --- Core Tool Interfaces ---

export interface ToolParameter extends SchemaEntity {
    required: boolean;
}

export interface ToolOutput extends SchemaEntity {
    required: boolean;
}

export interface ToolDefinition {
    id: string;
    name: string;
    description: string;
    category: string;
    functional_category?: string;
    domain_category?: string;
    tags?: string[];
    pipeline_info?: {
        can_start_pipeline: boolean;
        typical_next_tools: string[];
        pipeline_name: string;
    };
    ui_metadata?: {
        icon: string;
        color: string;
        difficulty: 'beginner' | 'intermediate' | 'advanced';
    };
    parameters: ToolParameter[];
    outputs: ToolOutput[];
    resource_dependencies: Resource[];
    examples?: Array<{
        description: string;
        input: Record<string, any>;
        output: Record<string, any>;
    }>;
}

// --- Tool Utility Functions ---

export function toolRequiresResources(tool: ToolDefinition): boolean {
    return tool.resource_dependencies.length > 0;
}

export function getToolResourceIds(tool: ToolDefinition): string[] {
    return tool.resource_dependencies.map(r => r.id);
}

export function getToolResourceConfig(tool: ToolDefinition, resourceId: string): Resource | undefined {
    return tool.resource_dependencies.find(r => r.id === resourceId);
} 