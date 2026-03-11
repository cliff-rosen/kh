import { useState, useEffect, useRef } from 'react';
import { FolderPlusIcon, CheckIcon } from '@heroicons/react/24/outline';
import { collectionApi } from '../../lib/api/collectionApi';
import { Collection } from '../../types/collection';

interface AddToCollectionButtonProps {
    articleId: number;
}

export default function AddToCollectionButton({ articleId }: AddToCollectionButtonProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [collections, setCollections] = useState<Collection[]>([]);
    const [memberOfIds, setMemberOfIds] = useState<Set<number>>(new Set());
    const [message, setMessage] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            // Fetch collections and which ones this article is already in, in parallel
            Promise.all([
                collectionApi.list(),
                collectionApi.getCollectionsForArticle(articleId),
            ]).then(([colls, memberOf]) => {
                setCollections(colls);
                setMemberOfIds(new Set(memberOf.map(m => m.collection_id)));
            }).catch(console.error);
        }
    }, [isOpen, articleId]);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setMessage('');
            }
        }
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isOpen]);

    const addToCollection = async (collectionId: number) => {
        if (memberOfIds.has(collectionId)) return; // already in this collection
        try {
            await collectionApi.addArticle(collectionId, articleId);
            // Update local state: mark as member and bump count
            setMemberOfIds(prev => new Set(prev).add(collectionId));
            setCollections(prev => prev.map(c =>
                c.collection_id === collectionId
                    ? { ...c, article_count: c.article_count + 1 }
                    : c
            ));
            setMessage('Added!');
            setTimeout(() => setMessage(''), 1500);
        } catch (err) {
            console.error('Failed to add to collection:', err);
            setMessage('Failed');
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 px-2 py-0.5 rounded-full border border-dashed border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
            >
                <FolderPlusIcon className="h-3 w-3" />
                Collection
            </button>

            {isOpen && (
                <div className="absolute z-50 mt-1 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1">
                    {collections.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No collections yet</p>
                    ) : (
                        collections.map(c => {
                            const alreadyIn = memberOfIds.has(c.collection_id);
                            return (
                                <button
                                    key={c.collection_id}
                                    onClick={() => addToCollection(c.collection_id)}
                                    disabled={alreadyIn}
                                    className={`w-full flex items-center justify-between px-3 py-1.5 text-sm text-left ${
                                        alreadyIn
                                            ? 'text-gray-400 dark:text-gray-500 cursor-default'
                                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                                    }`}
                                >
                                    <span className="flex items-center gap-1.5 truncate">
                                        {alreadyIn && <CheckIcon className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />}
                                        {c.name}
                                    </span>
                                    <span className="text-xs text-gray-400 ml-2">{c.article_count}</span>
                                </button>
                            );
                        })
                    )}
                    {message && (
                        <p className={`px-3 py-1 text-xs ${message === 'Added!' ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                            {message}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
