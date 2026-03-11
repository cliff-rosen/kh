import { useState, useEffect } from 'react';
import { TrashIcon, PlusIcon, PencilIcon } from '@heroicons/react/24/outline';
import { Collection, CollectionArticle } from '../../types/collection';
import { collectionApi } from '../../lib/api/collectionApi';
import { tagApi } from '../../lib/api/tagApi';
import { ArticleTag } from '../../types/tag';
import TagFilterBar from '../tags/TagFilterBar';
import ReportArticleCard from '../reports/ReportArticleCard';

interface CollectionDetailProps {
    collection: Collection;
    refreshKey?: number;
    onArticleClick: (article: CollectionArticle, allArticles: CollectionArticle[]) => void;
    onEdit: () => void;
    onDelete: () => void;
    onAddArticle: () => void;
}

export default function CollectionDetail({ collection, refreshKey, onArticleClick, onEdit, onDelete, onAddArticle }: CollectionDetailProps) {
    const [articles, setArticles] = useState<CollectionArticle[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
    const [tagFilteredArticleIds, setTagFilteredArticleIds] = useState<Set<number> | null>(null);
    const [articleTagsMap, setArticleTagsMap] = useState<Record<number, ArticleTag[]>>({});

    useEffect(() => {
        loadArticles();
    }, [collection.collection_id, refreshKey]);

    const loadArticles = async () => {
        setLoading(true);
        try {
            const data = await collectionApi.getArticles(collection.collection_id);
            setArticles(data.articles);
            // Fetch tags for all articles in collection
            if (data.articles.length > 0) {
                const ids = data.articles.map((a: CollectionArticle) => a.article_id);
                tagApi.getTagsForArticles(ids).then(setArticleTagsMap).catch(console.error);
            }
        } catch (err) {
            console.error('Failed to load articles:', err);
        } finally {
            setLoading(false);
        }
    };

    // When tag selection changes, fetch matching article IDs
    useEffect(() => {
        if (selectedTagIds.length === 0) {
            setTagFilteredArticleIds(null);
            return;
        }
        tagApi.searchByTags(selectedTagIds, undefined, undefined)
            .then(result => {
                setTagFilteredArticleIds(new Set(result.articles.map((a: any) => a.article_id)));
            })
            .catch(console.error);
    }, [selectedTagIds]);

    // Reset tag filter when switching collections
    useEffect(() => {
        setSelectedTagIds([]);
        setTagFilteredArticleIds(null);
    }, [collection.collection_id]);

    const displayArticles = tagFilteredArticleIds
        ? articles.filter(a => tagFilteredArticleIds.has(a.article_id))
        : articles;

    const removeArticle = async (articleId: number, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await collectionApi.removeArticle(collection.collection_id, articleId);
            setArticles(prev => prev.filter(a => a.article_id !== articleId));
        } catch (err) {
            console.error('Failed to remove article:', err);
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{collection.name}</h2>
                        {collection.description && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{collection.description}</p>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onAddArticle}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                        >
                            <PlusIcon className="h-4 w-4" />
                            Add Article
                        </button>
                        <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded">
                            <PencilIcon className="h-4 w-4" />
                        </button>
                        <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-500 rounded">
                            <TrashIcon className="h-4 w-4" />
                        </button>
                    </div>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {collection.article_count} article{collection.article_count !== 1 ? 's' : ''} · {collection.scope}
                </p>
                {/* Consolidated tag summary / filter */}
                {!loading && articles.length > 0 && (
                    <div className="mt-2">
                        <TagFilterBar
                            selectedTagIds={selectedTagIds}
                            onSelectionChange={setSelectedTagIds}
                            collectionId={collection.collection_id}
                        />
                    </div>
                )}
            </div>

            {/* Articles list */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
                {loading ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">Loading...</p>
                ) : displayArticles.length === 0 && articles.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-sm text-gray-500 dark:text-gray-400">No articles in this collection.</p>
                        <button
                            onClick={onAddArticle}
                            className="mt-2 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                        >
                            Add articles
                        </button>
                    </div>
                ) : displayArticles.length === 0 ? (
                    <div className="text-center py-8">
                        <p className="text-sm text-gray-500 dark:text-gray-400">No articles match the selected tags.</p>
                        <button
                            onClick={() => setSelectedTagIds([])}
                            className="mt-2 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                        >
                            Clear filter
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {displayArticles.map(article => (
                            <div key={article.article_id} className="relative group">
                                <ReportArticleCard
                                    article={article as any}
                                    onClick={() => onArticleClick(article, displayArticles)}
                                    tags={articleTagsMap[article.article_id]}
                                />
                                <button
                                    onClick={(e) => removeArticle(article.article_id, e)}
                                    className="absolute top-3 right-3 p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Remove from collection"
                                >
                                    <TrashIcon className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
