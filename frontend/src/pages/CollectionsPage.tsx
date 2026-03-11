import { useState, useEffect, useCallback } from 'react';
import { FolderIcon } from '@heroicons/react/24/outline';
import { Collection, CollectionArticle } from '../types/collection';
import { collectionApi } from '../lib/api/collectionApi';
import CollectionList from '../components/collections/CollectionList';
import CollectionDetail from '../components/collections/CollectionDetail';
import AddArticleModal from '../components/collections/AddArticleModal';
import ArticleViewerModal from '../components/articles/ArticleViewerModal';

export default function CollectionsPage() {
    const [collections, setCollections] = useState<Collection[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showAddArticle, setShowAddArticle] = useState(false);
    const [editingCollection, setEditingCollection] = useState<Collection | null>(null);
    const [viewerArticles, setViewerArticles] = useState<CollectionArticle[]>([]);
    const [viewerIndex, setViewerIndex] = useState(0);
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [newScope, setNewScope] = useState<string>('personal');
    const [detailRefreshKey, setDetailRefreshKey] = useState(0);

    const loadCollections = useCallback(async () => {
        try {
            const data = await collectionApi.list();
            setCollections(data);
        } catch (err) {
            console.error('Failed to load collections:', err);
        }
    }, []);

    useEffect(() => { loadCollections(); }, [loadCollections]);

    const selectedCollection = collections.find(c => c.collection_id === selectedId) || null;

    const handleCreate = async () => {
        if (!newName.trim()) return;
        try {
            const created = await collectionApi.create({ name: newName.trim(), description: newDesc || undefined, scope: newScope });
            setShowCreateModal(false);
            setNewName('');
            setNewDesc('');
            setNewScope('personal');
            await loadCollections();
            setSelectedId(created.collection_id);
        } catch (err) {
            console.error('Failed to create collection:', err);
        }
    };

    const handleEdit = async () => {
        if (!editingCollection || !newName.trim()) return;
        try {
            await collectionApi.update(editingCollection.collection_id, { name: newName.trim(), description: newDesc || undefined });
            setEditingCollection(null);
            setNewName('');
            setNewDesc('');
            await loadCollections();
        } catch (err) {
            console.error('Failed to update collection:', err);
        }
    };

    const handleDelete = async () => {
        if (!selectedCollection) return;
        if (!confirm(`Delete "${selectedCollection.name}"? This cannot be undone.`)) return;
        try {
            await collectionApi.delete(selectedCollection.collection_id);
            setSelectedId(null);
            await loadCollections();
        } catch (err) {
            console.error('Failed to delete collection:', err);
        }
    };

    const startEdit = () => {
        if (!selectedCollection) return;
        setEditingCollection(selectedCollection);
        setNewName(selectedCollection.name);
        setNewDesc(selectedCollection.description || '');
    };

    return (
        <div className="h-full flex flex-col">
            {/* Page header */}
            <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <div className="flex items-center gap-2">
                    <FolderIcon className="h-6 w-6 text-gray-600 dark:text-gray-400" />
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white">Collections</h1>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Organize articles into custom groups</p>
            </div>

            {/* Main content: split view */}
            <div className="flex-1 min-h-0 flex">
                {/* Left panel: collection list */}
                <div className="w-72 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                    <CollectionList
                        collections={collections}
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                        onCreate={() => { setNewName(''); setNewDesc(''); setNewScope('personal'); setShowCreateModal(true); }}
                    />
                </div>

                {/* Right panel: detail */}
                <div className="flex-1 min-w-0 bg-gray-50 dark:bg-gray-900">
                    {selectedCollection ? (
                        <CollectionDetail
                            collection={selectedCollection}
                            refreshKey={detailRefreshKey}
                            onArticleClick={(article, allArticles) => {
                                setViewerArticles(allArticles);
                                setViewerIndex(allArticles.findIndex(a => a.article_id === article.article_id));
                            }}
                            onEdit={startEdit}
                            onDelete={handleDelete}
                            onAddArticle={() => setShowAddArticle(true)}
                        />
                    ) : (
                        <div className="flex items-center justify-center h-full">
                            <div className="text-center">
                                <FolderIcon className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                                <p className="text-gray-500 dark:text-gray-400">Select a collection to view its articles</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Create/Edit Modal */}
            {(showCreateModal || editingCollection) && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            {editingCollection ? 'Edit Collection' : 'New Collection'}
                        </h3>
                        <div className="space-y-3">
                            <input
                                type="text"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="Collection name"
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                autoFocus
                            />
                            <textarea
                                value={newDesc}
                                onChange={(e) => setNewDesc(e.target.value)}
                                placeholder="Description (optional)"
                                rows={2}
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            {!editingCollection && (
                                <select
                                    value={newScope}
                                    onChange={(e) => setNewScope(e.target.value)}
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                    <option value="personal">Personal</option>
                                    <option value="organization">Organization</option>
                                    <option value="stream">Stream</option>
                                </select>
                            )}
                        </div>
                        <div className="flex justify-end gap-2 mt-4">
                            <button
                                onClick={() => { setShowCreateModal(false); setEditingCollection(null); }}
                                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={editingCollection ? handleEdit : handleCreate}
                                disabled={!newName.trim()}
                                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                            >
                                {editingCollection ? 'Save' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Article Modal */}
            {showAddArticle && selectedId && (
                <AddArticleModal
                    collectionId={selectedId}
                    onClose={() => setShowAddArticle(false)}
                    onAdded={() => { loadCollections(); setDetailRefreshKey(k => k + 1); }}
                />
            )}

            {/* Article Viewer Modal */}
            {viewerArticles.length > 0 && (
                <ArticleViewerModal
                    articles={viewerArticles as any[]}
                    initialIndex={viewerIndex}
                    onClose={() => setViewerArticles([])}
                />
            )}
        </div>
    );
}
