/**
 * Mission Utilities
 * 
 * This module provides utilities for mission sanitization and chat context preparation.
 */

import { Mission, Hop } from '@/types/workflow';
import { Asset, AssetMapSummary } from '@/types/asset';

export interface SanitizedAsset {
    id: string;
    name: string;
    description: string;
    schema_definition: any;
    status: string;
    subtype?: string;
    role?: string;
    asset_metadata: {
        createdAt: string;
        updatedAt: string;
        creator: string | null;
        tags: string[];
        agent_associations: string[];
        version: number;
        token_count: number;
    };
    // Explicitly excludes 'value' field to reduce payload size
}

export interface SanitizedMission {
    id: string;
    name: string;
    description: string;
    goal?: string;
    success_criteria?: string[];
    mission_asset_map: AssetMapSummary;
    current_hop?: any;
    hop_history: any[];
    inputs: SanitizedAsset[];
    outputs: SanitizedAsset[];
    mission_status: string;
    created_at: string;
    updated_at: string;
}

/**
 * Sanitize an asset for chat context by removing large content values.
 */
export function sanitizeAssetForChat(asset: Asset): SanitizedAsset {
    return {
        id: asset.id,
        name: asset.name,
        description: asset.description,
        schema_definition: asset.schema_definition,
        status: asset.status,
        subtype: asset.subtype,
        role: asset.role,
        asset_metadata: {
            createdAt: asset.asset_metadata?.createdAt || new Date().toISOString(),
            updatedAt: asset.asset_metadata?.updatedAt || new Date().toISOString(),
            creator: asset.asset_metadata?.creator || null,
            tags: asset.asset_metadata?.tags || [],
            agent_associations: asset.asset_metadata?.agent_associations || [],
            version: asset.asset_metadata?.version || 1,
            token_count: asset.asset_metadata?.token_count || 0
        }
        // Explicitly exclude 'value' field to reduce payload size
    };
}

/**
 * Sanitize a hop for chat context by removing asset content values.
 */
export function sanitizeHopForChat(hop: Hop): any {
    return {
        ...hop,
        // hop_asset_map contains asset_id -> role mappings
        hop_asset_map: hop.hop_asset_map || {}
    };
}

/**
 * Sanitize a mission for chat context by removing large asset content values.
 */
export function sanitizeMissionForChat(mission: Mission | null): SanitizedMission | null {
    if (!mission) {
        return null;
    }

    return {
        id: mission.id,
        name: mission.name,
        description: mission.description || '',
        goal: mission.goal,
        success_criteria: mission.success_criteria || [],
        mission_status: mission.status, // Fixed: use 'status' instead of 'mission_status'
        created_at: typeof mission.created_at === 'string' ? mission.created_at : new Date().toISOString(),
        updated_at: typeof mission.updated_at === 'string' ? mission.updated_at : new Date().toISOString(),

        // Use asset mapping instead of direct state
        mission_asset_map: mission.mission_asset_map || {},
        current_hop: undefined, // Will be computed from hops relationship
        hop_history: [], // Will be populated from completed hops
        inputs: [], // Will be populated from assets with role='input'
        outputs: [] // Will be populated from assets with role='output'
    };
} 