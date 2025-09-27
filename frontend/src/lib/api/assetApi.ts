import { Asset, AssetStatus } from '@/types/asset';
import { api } from '@/lib/api';

// Asset persistence information for tracking database state
interface AssetPersistence {
    isInDb: boolean;
    dbId?: string;
    isDirty?: boolean;
    lastSyncedAt?: string;
    version?: number;
}

// Asset with persistence information
interface AssetWithPersistence extends Asset {
    persistence: AssetPersistence;
}

// Type for creating an asset - matching backend CreateAssetRequest
interface CreateAssetParams {
    name: string;
    description?: string;
    type: string; // legacy API still uses string types
    subtype?: string;
    role?: string;
    content?: any;
    asset_metadata?: Record<string, any>;
}

// Type for updating an asset - using string types for API compatibility  
interface UpdateAssetParams {
    type?: string; // legacy API still uses string types
    subtype?: string;
    content?: any;
    metadata?: Record<string, any>;
}

// Helper function to convert API response to unified Asset format
function convertToUnifiedAsset(apiAsset: any): Asset {
    return {
        id: apiAsset.id,
        name: apiAsset.name,
        description: apiAsset.description || '',
        schema_definition: {
            type: mapLegacyTypeToValueType(apiAsset.type),
            description: apiAsset.description,
            is_array: apiAsset.is_collection || false,  // Map from database field
            fields: undefined // TODO: Could extract from content structure
        },
        value_representation: apiAsset.content,
        status: apiAsset.status || AssetStatus.PENDING,
        subtype: mapLegacySubtype(apiAsset.subtype),
        scope_type: apiAsset.scope_type || 'mission',
        scope_id: apiAsset.scope_id || '',
        role: apiAsset.role || 'intermediate',
        created_at: apiAsset.created_at || new Date().toISOString(),
        updated_at: apiAsset.updated_at || new Date().toISOString(),
        asset_metadata: apiAsset.asset_metadata || {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            creator: null,
            tags: [],
            agent_associations: [],
            version: 1,
            token_count: 0
        }
    };
}

// Helper to map legacy AssetType to unified ValueType
function mapLegacyTypeToValueType(legacyType: string): any {
    const mapping: Record<string, string> = {
        'file': 'file',
        'primitive': 'string',
        'object': 'object',
        'database_entity': 'database_entity',
        'markdown': 'string',
        'config': 'object'
    };
    return mapping[legacyType] || 'object';
}

// Helper to map legacy subtype to unified CustomType
function mapLegacySubtype(subtype: string): any {
    const mapping: Record<string, string> = {
        'email': 'email',
        'newsletter': 'newsletter',
        'search_result': 'search_result',
        'web_page': 'webpage',
        'pubmed_article': 'pubmed_article'
    };
    return mapping[subtype] || undefined;
}

export const assetApi = {
    // Get all assets
    async getAssets(): Promise<AssetWithPersistence[]> {
        const response = await api.get('/api/assets');
        return response.data.map((asset: any) => ({
            ...convertToUnifiedAsset(asset),
            persistence: {
                isInDb: true,
                dbId: asset.id,
                isDirty: false,
                lastSyncedAt: new Date().toISOString(),
                version: 1
            }
        }));
    },



    // Get a specific asset
    async getAsset(id: string): Promise<AssetWithPersistence> {
        const response = await api.get(`/api/assets/${id}/details`);
        return {
            ...convertToUnifiedAsset(response.data),
            persistence: {
                isInDb: true,
                dbId: response.data.id,
                isDirty: false,
                lastSyncedAt: new Date().toISOString(),
                version: 1
            }
        };
    },

    // Get detailed asset information including database entity content
    async getAssetDetails(id: string): Promise<AssetWithPersistence> {
        const response = await api.get(`/api/assets/${id}/details`);
        return {
            ...convertToUnifiedAsset(response.data),
            persistence: {
                isInDb: true,
                dbId: response.data.id,
                isDirty: false,
                lastSyncedAt: new Date().toISOString(),
                version: 1
            }
        };
    },

    // Create a new asset
    async createAsset(params: CreateAssetParams): Promise<AssetWithPersistence> {
        const response = await api.post('/api/assets', params);
        return {
            ...convertToUnifiedAsset(response.data),
            persistence: {
                isInDb: true,
                dbId: response.data.id,
                isDirty: false,
                lastSyncedAt: new Date().toISOString(),
                version: 1
            }
        };
    },

    // Update an asset
    async updateAsset(id: string, updates: UpdateAssetParams): Promise<AssetWithPersistence> {
        const response = await api.put(`/api/assets/${id}`, updates);
        return {
            ...convertToUnifiedAsset(response.data),
            persistence: {
                isInDb: true,
                dbId: response.data.id,
                isDirty: false,
                lastSyncedAt: new Date().toISOString(),
                version: 1
            }
        };
    },

    async deleteAsset(id: string): Promise<void> {
        await api.delete(`/api/assets/${id}`);
    },

    // Upload a file as an asset
    async zzDELETEuploadFileAsset(
        file: File,
        options?: {
            name?: string;
            description?: string;
            subtype?: string;
        }
    ): Promise<Asset> {
        const formData = new FormData();
        formData.append('file', file);

        if (options?.name) formData.append('name', options.name);
        if (options?.description) formData.append('description', options.description);
        if (options?.subtype) formData.append('subtype', options.subtype);

        const response = await api.post('/api/assets/upload', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });

        return convertToUnifiedAsset(response.data);
    },

    // Download a file asset
    async zzDELETEdownloadFileAsset(assetId: string): Promise<Blob> {
        const response = await api.get(`/api/assets/${assetId}/download`, {
            responseType: 'blob'
        });
        return response.data;
    }
}; 