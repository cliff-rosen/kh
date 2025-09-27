import { DocumentIcon, DocumentTextIcon, TableCellsIcon, PhotoIcon, MusicalNoteIcon, VideoCameraIcon } from '@heroicons/react/24/outline';
import { getAssetColor } from './assetUtils';

export const getAssetIcon = (type: string, subtype?: string) => {
    switch (type) {
        case 'file':
            // File type icons based on subtype
            switch (subtype?.toLowerCase()) {
                case 'pdf':
                case 'doc':
                case 'docx':
                    return <DocumentIcon className={`h-6 w-6 ${getAssetColor(type, subtype)}`} />;
                case 'txt':
                    return <DocumentTextIcon className={`h-6 w-6 ${getAssetColor(type, subtype)}`} />;
                case 'csv':
                case 'json':
                    return <TableCellsIcon className={`h-6 w-6 ${getAssetColor(type, subtype)}`} />;
                case 'png':
                case 'jpg':
                case 'jpeg':
                case 'gif':
                    return <PhotoIcon className={`h-6 w-6 ${getAssetColor(type, subtype)}`} />;
                case 'mp3':
                case 'wav':
                    return <MusicalNoteIcon className={`h-6 w-6 ${getAssetColor(type, subtype)}`} />;
                case 'mp4':
                    return <VideoCameraIcon className={`h-6 w-6 ${getAssetColor(type, subtype)}`} />;
                default:
                    return <DocumentIcon className={`h-6 w-6 ${getAssetColor(type, subtype)}`} />;
            }
        case 'string':
            return <DocumentTextIcon className={`h-6 w-6 ${getAssetColor(type, subtype)}`} />;
        case 'object':
            return <TableCellsIcon className={`h-6 w-6 ${getAssetColor(type, subtype)}`} />;
        case 'database_entity':
            return <TableCellsIcon className={`h-6 w-6 ${getAssetColor(type, subtype)}`} />;
        default:
            return <DocumentIcon className={`h-6 w-6 ${getAssetColor(type, subtype)}`} />;
    }
}; 