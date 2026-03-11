import { useState, useEffect } from 'react';
import { PlusIcon, TrashIcon, PencilIcon } from '@heroicons/react/24/outline';
import { tagApi } from '../../lib/api/tagApi';
import { Tag } from '../../types/tag';
import TagBadge from './TagBadge';

interface TagManagerProps {
    scope: 'personal' | 'organization';
}

const DEFAULT_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280'];

export default function TagManager({ scope }: TagManagerProps) {
    const [tags, setTags] = useState<Tag[]>([]);
    const [newName, setNewName] = useState('');
    const [newColor, setNewColor] = useState(DEFAULT_COLORS[4]);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editName, setEditName] = useState('');
    const [editColor, setEditColor] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => { loadTags(); }, []);

    const loadTags = async () => {
        try {
            const all = await tagApi.list();
            setTags(all.filter(t => t.scope === scope));
        } catch (err) {
            console.error('Failed to load tags:', err);
        }
    };

    const createTag = async () => {
        if (!newName.trim()) return;
        setLoading(true);
        try {
            await tagApi.create({ name: newName.trim(), scope, color: newColor });
            setNewName('');
            await loadTags();
        } catch (err) {
            console.error('Failed to create tag:', err);
        } finally {
            setLoading(false);
        }
    };

    const startEdit = (tag: Tag) => {
        setEditingId(tag.tag_id);
        setEditName(tag.name);
        setEditColor(tag.color || DEFAULT_COLORS[4]);
    };

    const saveEdit = async () => {
        if (editingId === null || !editName.trim()) return;
        try {
            await tagApi.update(editingId, { name: editName.trim(), color: editColor });
            setEditingId(null);
            await loadTags();
        } catch (err) {
            console.error('Failed to update tag:', err);
        }
    };

    const deleteTag = async (tagId: number) => {
        if (!confirm('Delete this tag? All assignments will be removed.')) return;
        try {
            await tagApi.delete(tagId);
            await loadTags();
        } catch (err) {
            console.error('Failed to delete tag:', err);
        }
    };

    return (
        <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {scope === 'personal' ? 'My Tags' : 'Organization Tags'}
            </h3>

            {/* Create new tag */}
            <div className="flex items-center gap-2">
                <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && createTag()}
                    placeholder="New tag name..."
                    className="flex-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <div className="flex gap-1">
                    {DEFAULT_COLORS.map(c => (
                        <button
                            key={c}
                            onClick={() => setNewColor(c)}
                            className={`w-5 h-5 rounded-full border-2 ${newColor === c ? 'border-gray-900 dark:border-white' : 'border-transparent'}`}
                            style={{ backgroundColor: c }}
                        />
                    ))}
                </div>
                <button
                    onClick={createTag}
                    disabled={loading || !newName.trim()}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                    <PlusIcon className="h-4 w-4" />
                    Add
                </button>
            </div>

            {/* Tag list */}
            <div className="space-y-2">
                {tags.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
                        No {scope === 'personal' ? 'personal' : 'organization'} tags yet
                    </p>
                ) : (
                    tags.map(tag => (
                        <div key={tag.tag_id} className="flex items-center justify-between py-1.5 px-3 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800">
                            {editingId === tag.tag_id ? (
                                <div className="flex items-center gap-2 flex-1">
                                    <input
                                        type="text"
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                                        className="flex-1 text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        autoFocus
                                    />
                                    <div className="flex gap-1">
                                        {DEFAULT_COLORS.map(c => (
                                            <button
                                                key={c}
                                                onClick={() => setEditColor(c)}
                                                className={`w-4 h-4 rounded-full border-2 ${editColor === c ? 'border-gray-900 dark:border-white' : 'border-transparent'}`}
                                                style={{ backgroundColor: c }}
                                            />
                                        ))}
                                    </div>
                                    <button onClick={saveEdit} className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400">Save</button>
                                    <button onClick={() => setEditingId(null)} className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400">Cancel</button>
                                </div>
                            ) : (
                                <>
                                    <TagBadge name={tag.name} color={tag.color} scope={tag.scope} size="md" />
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => startEdit(tag)} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                                            <PencilIcon className="h-4 w-4" />
                                        </button>
                                        <button onClick={() => deleteTag(tag.tag_id)} className="p-1 text-gray-400 hover:text-red-500">
                                            <TrashIcon className="h-4 w-4" />
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
