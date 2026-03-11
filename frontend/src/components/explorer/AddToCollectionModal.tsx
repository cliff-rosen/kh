import { useState } from 'react';
import { XMarkIcon, FolderIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { Collection } from '../../types/collection';
import { explorerApi } from '../../lib/api/explorerApi';
import type { OverlapCheckResponse } from '../../lib/api/explorerApi';
import type { ExplorerArticle } from '../../types/explorer';
import { collectionApi } from '../../lib/api/collectionApi';

interface AddToCollectionModalProps {
    collections: Collection[];
    selectedArticles: ExplorerArticle[];
    onClose: () => void;
    onComplete: () => void;
}

type Step = 'pick' | 'confirm';

function formatAuthors(authors: any): string {
    if (!authors) return '';
    if (typeof authors === 'string') return authors;
    if (Array.isArray(authors)) return authors.slice(0, 2).join(', ') + (authors.length > 2 ? ' et al.' : '');
    return '';
}

export default function AddToCollectionModal({ collections: initialCollections, selectedArticles, onClose, onComplete }: AddToCollectionModalProps) {
    const [step, setStep] = useState<Step>('pick');
    const [collections, setCollections] = useState<Collection[]>(initialCollections);
    const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
    const [overlap, setOverlap] = useState<OverlapCheckResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [adding, setAdding] = useState(false);
    const [showOverlaps, setShowOverlaps] = useState(false);

    const localArticleIds = selectedArticles.filter(a => a.article_id).map(a => a.article_id!);
    const pubmedOnlyCount = selectedArticles.filter(a => !a.is_local).length;

    const handlePickCollection = async (coll: Collection) => {
        setSelectedCollection(coll);
        setLoading(true);
        try {
            const result = await explorerApi.checkOverlap(coll.collection_id, localArticleIds);
            setOverlap(result);
            setStep('confirm');
        } catch (err) {
            console.error('Overlap check failed:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleConfirmAdd = async () => {
        if (!selectedCollection || !overlap) return;
        setAdding(true);
        try {
            // Add each new article (skip overlaps — backend does INSERT IGNORE anyway)
            for (const id of overlap.new_ids) {
                await collectionApi.addArticle(selectedCollection.collection_id, id);
            }
            // Update local collection count so picker reflects the change
            const addedCount = overlap.new_ids.length;
            setCollections(prev => prev.map(c =>
                c.collection_id === selectedCollection.collection_id
                    ? { ...c, article_count: c.article_count + addedCount }
                    : c
            ));
            // TODO: For PubMed-only articles, import them first then add
            onComplete();
        } catch (err) {
            console.error('Failed to add articles:', err);
        } finally {
            setAdding(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
                {/* Header */}
                <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {step === 'pick' ? 'Add to Collection' : `Add to "${selectedCollection?.name}"`}
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                        <XMarkIcon className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 min-h-0 overflow-y-auto p-6">
                    {step === 'pick' && (
                        <div>
                            {loading && (
                                <div className="flex items-center justify-center py-8">
                                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                                </div>
                            )}
                            {!loading && collections.length === 0 && (
                                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                                    No collections yet. Create one first.
                                </p>
                            )}
                            {!loading && collections.length > 0 && (
                                <div className="space-y-2">
                                    {collections.map(coll => (
                                        <button
                                            key={coll.collection_id}
                                            onClick={() => handlePickCollection(coll)}
                                            className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors text-left"
                                        >
                                            <FolderIcon className="h-5 w-5 text-gray-400 flex-shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{coll.name}</p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                    {coll.article_count} article{coll.article_count !== 1 ? 's' : ''} · {coll.scope}
                                                </p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {step === 'confirm' && overlap && (
                        <div className="space-y-4">
                            {/* Math summary */}
                            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                                <div className="space-y-1 text-sm">
                                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                                        <span>Collection currently has:</span>
                                        <span className="font-medium">{overlap.existing_count} articles</span>
                                    </div>
                                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                                        <span>You selected:</span>
                                        <span className="font-medium">{overlap.selected_count} articles</span>
                                    </div>
                                    <hr className="border-gray-200 dark:border-gray-700 my-2" />
                                    <div className="flex justify-between text-green-700 dark:text-green-400">
                                        <span className="flex items-center gap-1">
                                            <CheckCircleIcon className="h-4 w-4" />
                                            New articles to add:
                                        </span>
                                        <span className="font-bold">{overlap.new_ids.length}</span>
                                    </div>
                                    {overlap.overlap_ids.length > 0 && (
                                        <div className="flex justify-between text-amber-600 dark:text-amber-400">
                                            <span className="flex items-center gap-1">
                                                <ExclamationTriangleIcon className="h-4 w-4" />
                                                Already in collection (skipped):
                                            </span>
                                            <span className="font-bold">{overlap.overlap_ids.length}</span>
                                        </div>
                                    )}
                                    <hr className="border-gray-200 dark:border-gray-700 my-2" />
                                    <div className="flex justify-between text-gray-900 dark:text-white font-medium">
                                        <span>Collection will have:</span>
                                        <span className="font-bold">{overlap.final_count} articles</span>
                                    </div>
                                </div>
                            </div>

                            {/* New articles list */}
                            {overlap.new_articles.length > 0 && (
                                <div>
                                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        New ({overlap.new_articles.length}):
                                    </h4>
                                    <div className="space-y-1">
                                        {overlap.new_articles.map(a => (
                                            <p key={a.article_id} className="text-sm text-gray-600 dark:text-gray-400 truncate">
                                                · {a.title} — {formatAuthors(a.authors)}
                                            </p>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Overlap articles list (collapsible) */}
                            {overlap.overlap_articles.length > 0 && (
                                <div>
                                    <button
                                        onClick={() => setShowOverlaps(!showOverlaps)}
                                        className="text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                                    >
                                        Already in collection ({overlap.overlap_articles.length}) {showOverlaps ? '▾' : '▸'}
                                    </button>
                                    {showOverlaps && (
                                        <div className="mt-1 space-y-1 opacity-60">
                                            {overlap.overlap_articles.map(a => (
                                                <p key={a.article_id} className="text-sm text-gray-500 dark:text-gray-500 truncate">
                                                    · {a.title} — {formatAuthors(a.authors)}
                                                </p>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* PubMed import warning */}
                            {pubmedOnlyCount > 0 && (
                                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-700 dark:text-amber-400">
                                    <ExclamationTriangleIcon className="h-4 w-4 inline mr-1" />
                                    {pubmedOnlyCount} article{pubmedOnlyCount !== 1 ? 's' : ''} from PubMed will be imported first
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                {step === 'confirm' && overlap && (
                    <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                        <button
                            onClick={() => { setStep('pick'); setOverlap(null); setSelectedCollection(null); }}
                            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                        >
                            ← Back
                        </button>
                        <div className="flex gap-2">
                            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800">
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmAdd}
                                disabled={adding || overlap.new_ids.length === 0}
                                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                            >
                                {adding ? 'Adding...' : `Add ${overlap.new_ids.length} New Article${overlap.new_ids.length !== 1 ? 's' : ''}`}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
