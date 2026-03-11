import { useState } from 'react';
import { XMarkIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { collectionApi } from '../../lib/api/collectionApi';
import type { ExplorerArticle } from '../../types/explorer';

interface CreateCollectionModalProps {
    selectedArticles: ExplorerArticle[];
    onClose: () => void;
    onComplete: () => void;
}

function formatAuthors(authors: any): string {
    if (!authors) return '';
    if (typeof authors === 'string') return authors;
    if (Array.isArray(authors)) return authors.slice(0, 2).join(', ') + (authors.length > 2 ? ' et al.' : '');
    return '';
}

export default function CreateCollectionModal({ selectedArticles, onClose, onComplete }: CreateCollectionModalProps) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState('');

    const localArticles = selectedArticles.filter(a => a.article_id);
    const pubmedOnlyArticles = selectedArticles.filter(a => !a.is_local);

    const handleCreate = async () => {
        if (!name.trim()) return;
        setCreating(true);
        setError('');
        try {
            const coll = await collectionApi.create({ name: name.trim(), description: description.trim() || undefined });
            // Add local articles to the new collection
            for (const article of localArticles) {
                await collectionApi.addArticle(coll.collection_id, article.article_id!);
            }
            // TODO: For PubMed-only articles, import them first then add
            onComplete();
        } catch (err: any) {
            console.error('Failed to create collection:', err);
            setError(err?.response?.data?.detail || 'Failed to create collection');
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
                {/* Header */}
                <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Create New Collection
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                        <XMarkIcon className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
                    {/* Name */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Collection Name
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g., Key Papers on Topic X"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Description <span className="text-gray-400 font-normal">(optional)</span>
                        </label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            rows={2}
                            placeholder="Brief description of this collection..."
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        />
                    </div>

                    {/* Articles to add */}
                    <div>
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Articles to add ({selectedArticles.length}):
                        </h4>
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                            {selectedArticles.map((a, i) => (
                                <p key={a.article_id || `pmid-${a.pmid}` || i} className="text-sm text-gray-600 dark:text-gray-400 truncate">
                                    · {a.title} {a.authors ? `— ${formatAuthors(a.authors)}` : ''}
                                </p>
                            ))}
                        </div>
                    </div>

                    {/* PubMed import warning */}
                    {pubmedOnlyArticles.length > 0 && (
                        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-700 dark:text-amber-400">
                            <ExclamationTriangleIcon className="h-4 w-4 inline mr-1" />
                            {pubmedOnlyArticles.length} article{pubmedOnlyArticles.length !== 1 ? 's' : ''} from PubMed will be imported first
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                    )}
                </div>

                {/* Footer */}
                <div className="flex-shrink-0 flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800">
                        Cancel
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={creating || !name.trim()}
                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                    >
                        {creating ? 'Creating...' : `Create & Add ${localArticles.length} Article${localArticles.length !== 1 ? 's' : ''}`}
                    </button>
                </div>
            </div>
        </div>
    );
}
