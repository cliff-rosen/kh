import { PlusIcon, FolderIcon, BuildingOfficeIcon, BeakerIcon } from '@heroicons/react/24/outline';
import { Collection } from '../../types/collection';

interface CollectionListProps {
    collections: Collection[];
    selectedId: number | null;
    onSelect: (id: number) => void;
    onCreate: () => void;
}

export default function CollectionList({ collections, selectedId, onSelect, onCreate }: CollectionListProps) {
    const personal = collections.filter(c => c.scope === 'personal');
    const org = collections.filter(c => c.scope === 'organization');
    const stream = collections.filter(c => c.scope === 'stream');

    const renderGroup = (label: string, items: Collection[], icon: React.ReactNode) => {
        if (items.length === 0) return null;
        return (
            <div className="mb-4">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 px-3 mb-1">
                    {icon}
                    {label}
                </h3>
                {items.map(c => (
                    <button
                        key={c.collection_id}
                        onClick={() => onSelect(c.collection_id)}
                        className={`w-full text-left px-3 py-2 text-sm rounded-md flex items-center justify-between ${
                            selectedId === c.collection_id
                                ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                    >
                        <span className="truncate">{c.name}</span>
                        <span className="text-xs text-gray-400 ml-2 flex-shrink-0">{c.article_count}</span>
                    </button>
                ))}
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex-shrink-0 px-3 py-3 border-b border-gray-200 dark:border-gray-700">
                <button
                    onClick={onCreate}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md"
                >
                    <PlusIcon className="h-4 w-4" />
                    New Collection
                </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto py-2">
                {collections.length === 0 ? (
                    <p className="px-3 py-8 text-sm text-gray-500 dark:text-gray-400 text-center">
                        No collections yet. Create one to start organizing articles.
                    </p>
                ) : (
                    <>
                        {renderGroup('My Collections', personal, <FolderIcon className="h-3.5 w-3.5" />)}
                        {renderGroup('Organization', org, <BuildingOfficeIcon className="h-3.5 w-3.5" />)}
                        {renderGroup('Stream', stream, <BeakerIcon className="h-3.5 w-3.5" />)}
                    </>
                )}
            </div>
        </div>
    );
}
