import { useState, useEffect, useRef } from 'react';
import { PlusIcon, TagIcon } from '@heroicons/react/24/outline';
import { tagApi } from '../../lib/api/tagApi';
import { Tag, ArticleTag } from '../../types/tag';
import TagBadge from './TagBadge';

interface TagPickerProps {
    articleId: number;
    onTagsChanged?: () => void;
}

export default function TagPicker({ articleId, onTagsChanged }: TagPickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [allTags, setAllTags] = useState<Tag[]>([]);
    const [articleTags, setArticleTags] = useState<ArticleTag[]>([]);
    const [newTagName, setNewTagName] = useState('');
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            loadTags();
        }
    }, [isOpen]);

    useEffect(() => {
        loadArticleTags();
    }, [articleId]);

    // Close on outside click
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        }
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isOpen]);

    const loadTags = async () => {
        try {
            const tags = await tagApi.list();
            setAllTags(tags);
        } catch (err) {
            console.error('Failed to load tags:', err);
        }
    };

    const loadArticleTags = async () => {
        try {
            const tags = await tagApi.getArticleTags(articleId);
            setArticleTags(tags);
        } catch (err) {
            console.error('Failed to load article tags:', err);
        }
    };

    const isAssigned = (tagId: number) => articleTags.some(t => t.tag_id === tagId);

    const toggleTag = async (tag: Tag) => {
        try {
            if (isAssigned(tag.tag_id)) {
                await tagApi.unassign(tag.tag_id, articleId);
            } else {
                await tagApi.assign([tag.tag_id], [articleId]);
            }
            await loadArticleTags();
            onTagsChanged?.();
        } catch (err) {
            console.error('Failed to toggle tag:', err);
        }
    };

    const createAndAssign = async () => {
        if (!newTagName.trim()) return;
        setLoading(true);
        try {
            const tag = await tagApi.create({ name: newTagName.trim() });
            await tagApi.assign([tag.tag_id], [articleId]);
            setNewTagName('');
            await Promise.all([loadTags(), loadArticleTags()]);
            onTagsChanged?.();
        } catch (err) {
            console.error('Failed to create tag:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveTag = async (tagId: number) => {
        try {
            await tagApi.unassign(tagId, articleId);
            await loadArticleTags();
            onTagsChanged?.();
        } catch (err) {
            console.error('Failed to remove tag:', err);
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Current tags display */}
            <div className="flex flex-wrap items-center gap-1">
                {articleTags.map(tag => (
                    <TagBadge
                        key={tag.tag_id}
                        name={tag.name}
                        color={tag.color}
                        scope={tag.scope}
                        onRemove={() => handleRemoveTag(tag.tag_id)}
                    />
                ))}
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 px-2 py-0.5 rounded-full border border-dashed border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
                >
                    <TagIcon className="h-3 w-3" />
                    Tag
                </button>
            </div>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute z-50 mt-1 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2">
                    {/* Create new tag */}
                    <div className="px-3 pb-2 border-b border-gray-100 dark:border-gray-700">
                        <div className="flex gap-1">
                            <input
                                type="text"
                                value={newTagName}
                                onChange={(e) => setNewTagName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && createAndAssign()}
                                placeholder="New tag..."
                                className="flex-1 text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <button
                                onClick={createAndAssign}
                                disabled={loading || !newTagName.trim()}
                                className="p-1 text-blue-600 hover:text-blue-700 dark:text-blue-400 disabled:opacity-50"
                            >
                                <PlusIcon className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    {/* Tag list */}
                    <div className="max-h-48 overflow-y-auto py-1">
                        {allTags.length === 0 ? (
                            <p className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No tags yet</p>
                        ) : (
                            allTags.map(tag => (
                                <button
                                    key={tag.tag_id}
                                    onClick={() => toggleTag(tag)}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700"
                                >
                                    <span className={`w-4 h-4 rounded border flex items-center justify-center ${
                                        isAssigned(tag.tag_id)
                                            ? 'bg-blue-500 border-blue-500 text-white'
                                            : 'border-gray-300 dark:border-gray-600'
                                    }`}>
                                        {isAssigned(tag.tag_id) && <span className="text-xs">&#10003;</span>}
                                    </span>
                                    <span
                                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: tag.color || (tag.scope === 'organization' ? '#3b82f6' : '#6b7280') }}
                                    />
                                    <span className="text-gray-700 dark:text-gray-300 truncate">{tag.name}</span>
                                    {tag.scope === 'organization' && (
                                        <span className="text-xs text-gray-400 ml-auto">org</span>
                                    )}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
