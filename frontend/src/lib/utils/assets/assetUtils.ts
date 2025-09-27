import { Asset } from '@/types/asset';

export const getAssetColor = (type: string, subtype?: string) => {
    switch (type) {
        case 'file':
            // File type colors based on subtype
            switch (subtype?.toLowerCase()) {
                case 'pdf':
                    return 'text-red-600';
                case 'doc':
                case 'docx':
                    return 'text-blue-600';
                case 'txt':
                    return 'text-gray-600';
                case 'csv':
                case 'json':
                    return 'text-green-600';
                case 'png':
                case 'jpg':
                case 'jpeg':
                case 'gif':
                    return 'text-purple-600';
                case 'mp3':
                case 'wav':
                    return 'text-orange-600';
                case 'mp4':
                    return 'text-pink-600';
                default:
                    return 'text-gray-600';
            }
        case 'string':
            return 'text-gray-600';
        case 'object':
            return 'text-green-600';
        case 'database_entity':
            return 'text-blue-600';
        default:
            return 'text-gray-600';
    }
};

export const getFileType = (file: File): string => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    return extension || 'unknown';
};

// Helper function to get content from an asset with null safety
// content can be primitive, object, or array
// if object, return object[dataType]
// if array, return array
// if primitive, return primitive
// if null or undefined, return null
export const getAssetContent = (asset: Asset) => {
    // Handle null/undefined content
    if (!asset.value_representation) {
        return null;
    }

    // If value is a primitive (string, number, etc.), return it directly
    if (typeof asset.value_representation !== 'object') {
        return asset.value_representation;
    }

    // If value is an object and has a property matching the subtype, return that property
    if (asset.subtype && Object.keys(asset.value_representation).includes(asset.subtype)) {
        return asset.value_representation[asset.subtype];
    }

    // If value is an object but doesn't have a matching subtype property, return the whole object
    return asset.value_representation;
}; 