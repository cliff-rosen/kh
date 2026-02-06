import { useState, useEffect, useRef, useCallback } from 'react';
import { PlusIcon, TrashIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { adminApi } from '../../lib/api/adminApi';
import { handleApiError } from '../../lib/api';
import type { Artifact } from '../../types/artifact';

const TYPE_BADGES: Record<string, string> = {
    bug: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    feature: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
};

const STATUS_BADGES: Record<string, string> = {
    open: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    closed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
};

const STATUS_LABELS: Record<string, string> = {
    open: 'Open',
    in_progress: 'In Progress',
    closed: 'Closed',
};

const CATEGORY_COLORS: string[] = [
    'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
    'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400',
    'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
    'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
];

function getCategoryColor(category: string, allCategories: string[]): string {
    const idx = allCategories.indexOf(category);
    return CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
}

interface EditState {
    id: number;
    title: string;
    artifact_type: 'bug' | 'feature';
    status: string;
    description: string;
    category: string;
}

export function ArtifactList() {
    const [artifacts, setArtifacts] = useState<Artifact[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filters
    const [filterType, setFilterType] = useState<string>('');
    const [filterStatus, setFilterStatus] = useState<string>('');
    const [filterCategory, setFilterCategory] = useState<string>('');

    // Inline editing state
    const [editing, setEditing] = useState<EditState | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const savingRef = useRef(false);
    const titleInputRef = useRef<HTMLInputElement>(null);

    // Create dialog state
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newType, setNewType] = useState<'bug' | 'feature'>('bug');
    const [newDescription, setNewDescription] = useState('');
    const [newCategory, setNewCategory] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    // Derive unique categories from loaded artifacts
    const allCategories = Array.from(
        new Set(artifacts.map((a) => a.category).filter((c): c is string => !!c))
    ).sort();

    useEffect(() => {
        loadArtifacts();
    }, [filterType, filterStatus, filterCategory]);

    const loadArtifacts = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const params: { type?: string; status?: string; category?: string } = {};
            if (filterType) params.type = filterType;
            if (filterStatus) params.status = filterStatus;
            if (filterCategory) params.category = filterCategory;
            const data = await adminApi.getArtifacts(params);
            setArtifacts(data);
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!newTitle.trim()) return;

        setIsCreating(true);
        try {
            await adminApi.createArtifact({
                title: newTitle.trim(),
                artifact_type: newType,
                description: newDescription.trim() || undefined,
                category: newCategory.trim() || undefined,
            });
            setNewTitle('');
            setNewType('bug');
            setNewDescription('');
            setNewCategory('');
            setShowCreateDialog(false);
            await loadArtifacts();
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsCreating(false);
        }
    };

    const startEdit = useCallback((artifact: Artifact) => {
        setEditing({
            id: artifact.id,
            title: artifact.title,
            artifact_type: artifact.artifact_type as 'bug' | 'feature',
            status: artifact.status,
            description: artifact.description || '',
            category: artifact.category || '',
        });
    }, []);

    const saveEdit = useCallback(async (editState?: EditState) => {
        const toSave = editState || editing;
        if (!toSave || !toSave.title.trim() || savingRef.current) return;

        // Find original to check for changes
        const original = artifacts.find((a) => a.id === toSave.id);
        if (!original) return;

        const hasChanges =
            original.title !== toSave.title.trim() ||
            original.artifact_type !== toSave.artifact_type ||
            original.status !== toSave.status ||
            (original.description || '') !== toSave.description.trim() ||
            (original.category || '') !== toSave.category.trim();

        if (!hasChanges) {
            setEditing(null);
            return;
        }

        savingRef.current = true;
        setIsSaving(true);
        try {
            await adminApi.updateArtifact(toSave.id, {
                title: toSave.title.trim(),
                artifact_type: toSave.artifact_type,
                status: toSave.status,
                description: toSave.description.trim() || undefined,
                category: toSave.category.trim() || undefined,
            });
            setEditing(null);
            await loadArtifacts();
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            savingRef.current = false;
            setIsSaving(false);
        }
    }, [editing, artifacts]);

    const cancelEdit = useCallback(() => {
        setEditing(null);
    }, []);

    const handleRowClick = useCallback(async (artifact: Artifact) => {
        if (editing && editing.id === artifact.id) return;

        // Save current edit first, then start editing the new row
        if (editing) {
            await saveEdit();
        }
        startEdit(artifact);
    }, [editing, saveEdit, startEdit]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            cancelEdit();
        } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            saveEdit();
        }
    }, [cancelEdit, saveEdit]);

    const handleDelete = async (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to delete this artifact?')) return;

        try {
            await adminApi.deleteArtifact(id);
            if (editing?.id === id) setEditing(null);
            await loadArtifacts();
        } catch (err) {
            setError(handleApiError(err));
        }
    };

    // Focus title input when editing starts
    useEffect(() => {
        if (editing && titleInputRef.current) {
            titleInputRef.current.focus();
        }
    }, [editing?.id]);

    if (isLoading && artifacts.length === 0) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            </div>
        );
    }

    const inputClasses = "w-full px-2 py-1 text-sm border border-purple-300 dark:border-purple-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-purple-500";
    const selectClasses = "px-2 py-1 text-sm border border-purple-300 dark:border-purple-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-purple-500";

    return (
        <div className="space-y-6">
            {/* Header with Filters and Create Button */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Artifacts ({artifacts.length})
                    </h2>
                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                        <option value="">All Types</option>
                        <option value="bug">Bug</option>
                        <option value="feature">Feature</option>
                    </select>
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                        <option value="">All Statuses</option>
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="closed">Closed</option>
                    </select>
                    <select
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                        <option value="">All Categories</option>
                        {allCategories.map((cat) => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                </div>
                <button
                    onClick={() => setShowCreateDialog(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                    <PlusIcon className="h-5 w-5" />
                    Create Artifact
                </button>
            </div>

            {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
                    {error}
                </div>
            )}

            {/* Artifacts Table */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">
                                Type
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Title
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">
                                Status
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-36">
                                Category
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Description
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-28">
                                Created
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {artifacts.map((artifact) => {
                            const isEditing = editing?.id === artifact.id;

                            return (
                                <tr
                                    key={artifact.id}
                                    onClick={() => handleRowClick(artifact)}
                                    className={`cursor-pointer transition-colors ${
                                        isEditing
                                            ? 'bg-purple-50 dark:bg-purple-900/20 ring-1 ring-inset ring-purple-300 dark:ring-purple-700'
                                            : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                    }`}
                                >
                                    {/* Type */}
                                    <td className="px-6 py-3 whitespace-nowrap" onClick={(e) => isEditing && e.stopPropagation()}>
                                        {isEditing ? (
                                            <select
                                                value={editing.artifact_type}
                                                onChange={(e) => setEditing({ ...editing, artifact_type: e.target.value as 'bug' | 'feature' })}
                                                onKeyDown={handleKeyDown}
                                                className={selectClasses}
                                            >
                                                <option value="bug">Bug</option>
                                                <option value="feature">Feature</option>
                                            </select>
                                        ) : (
                                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${TYPE_BADGES[artifact.artifact_type] || ''}`}>
                                                {artifact.artifact_type}
                                            </span>
                                        )}
                                    </td>

                                    {/* Title */}
                                    <td className="px-6 py-3" onClick={(e) => isEditing && e.stopPropagation()}>
                                        {isEditing ? (
                                            <input
                                                ref={titleInputRef}
                                                type="text"
                                                value={editing.title}
                                                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                                                onKeyDown={handleKeyDown}
                                                className={inputClasses}
                                            />
                                        ) : (
                                            <div className="font-medium text-gray-900 dark:text-white">
                                                {artifact.title}
                                            </div>
                                        )}
                                    </td>

                                    {/* Status */}
                                    <td className="px-6 py-3 whitespace-nowrap" onClick={(e) => isEditing && e.stopPropagation()}>
                                        {isEditing ? (
                                            <select
                                                value={editing.status}
                                                onChange={(e) => setEditing({ ...editing, status: e.target.value })}
                                                onKeyDown={handleKeyDown}
                                                className={selectClasses}
                                            >
                                                <option value="open">Open</option>
                                                <option value="in_progress">In Progress</option>
                                                <option value="closed">Closed</option>
                                            </select>
                                        ) : (
                                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${STATUS_BADGES[artifact.status] || ''}`}>
                                                {STATUS_LABELS[artifact.status] || artifact.status}
                                            </span>
                                        )}
                                    </td>

                                    {/* Category */}
                                    <td className="px-6 py-3 whitespace-nowrap" onClick={(e) => isEditing && e.stopPropagation()}>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                value={editing.category}
                                                onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                                                onKeyDown={handleKeyDown}
                                                list="category-options"
                                                placeholder="Category..."
                                                className={inputClasses}
                                            />
                                        ) : artifact.category ? (
                                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getCategoryColor(artifact.category, allCategories)}`}>
                                                {artifact.category}
                                            </span>
                                        ) : (
                                            <span className="text-gray-400 dark:text-gray-500 text-xs">-</span>
                                        )}
                                    </td>

                                    {/* Description */}
                                    <td className="px-6 py-3" onClick={(e) => isEditing && e.stopPropagation()}>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                value={editing.description}
                                                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                                                onKeyDown={handleKeyDown}
                                                placeholder="Description..."
                                                className={inputClasses}
                                            />
                                        ) : (
                                            <div className="text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">
                                                {artifact.description || '-'}
                                            </div>
                                        )}
                                    </td>

                                    {/* Created */}
                                    <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {new Date(artifact.created_at).toLocaleDateString()}
                                    </td>

                                    {/* Actions */}
                                    <td className="px-6 py-3 whitespace-nowrap text-right text-sm" onClick={(e) => e.stopPropagation()}>
                                        {isEditing ? (
                                            <div className="flex items-center justify-end gap-1">
                                                <button
                                                    onClick={() => saveEdit()}
                                                    disabled={isSaving || !editing.title.trim()}
                                                    className="p-1 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 disabled:opacity-50"
                                                    title="Save (Enter)"
                                                >
                                                    <CheckIcon className="h-5 w-5" />
                                                </button>
                                                <button
                                                    onClick={cancelEdit}
                                                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                                    title="Cancel (Esc)"
                                                >
                                                    <XMarkIcon className="h-5 w-5" />
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={(e) => handleDelete(e, artifact.id)}
                                                className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                                                title="Delete"
                                            >
                                                <TrashIcon className="h-5 w-5" />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        {artifacts.length === 0 && (
                            <tr>
                                <td colSpan={7} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                                    No artifacts found
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
                {/* Datalist for category autocomplete */}
                <datalist id="category-options">
                    {allCategories.map((cat) => (
                        <option key={cat} value={cat} />
                    ))}
                </datalist>
            </div>

            {/* Create Dialog */}
            {showCreateDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            Create Artifact
                        </h3>
                        <div className="space-y-4">
                            <input
                                type="text"
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                                placeholder="Title"
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                autoFocus
                            />
                            <div className="flex gap-3">
                                <select
                                    value={newType}
                                    onChange={(e) => setNewType(e.target.value as 'bug' | 'feature')}
                                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                >
                                    <option value="bug">Bug</option>
                                    <option value="feature">Feature</option>
                                </select>
                                <input
                                    type="text"
                                    value={newCategory}
                                    onChange={(e) => setNewCategory(e.target.value)}
                                    placeholder="Category (optional)"
                                    list="create-category-options"
                                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>
                            <textarea
                                value={newDescription}
                                onChange={(e) => setNewDescription(e.target.value)}
                                placeholder="Description (optional)"
                                rows={3}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>
                        <div className="flex justify-end gap-3 mt-4">
                            <button
                                onClick={() => setShowCreateDialog(false)}
                                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={isCreating || !newTitle.trim()}
                                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                            >
                                {isCreating ? 'Creating...' : 'Create'}
                            </button>
                        </div>
                        <datalist id="create-category-options">
                            {allCategories.map((cat) => (
                                <option key={cat} value={cat} />
                            ))}
                        </datalist>
                    </div>
                </div>
            )}
        </div>
    );
}
