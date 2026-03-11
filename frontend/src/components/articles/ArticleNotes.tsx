import { useState, useEffect, useCallback } from 'react';
import {
    PencilIcon,
    TrashIcon,
    PlusIcon,
    UserIcon,
    UsersIcon,
    CheckIcon,
    FolderIcon,
    DocumentTextIcon,
    GlobeAltIcon,
} from '@heroicons/react/24/outline';
import { notesApi, type ArticleNoteData } from '../../lib/api/notesApi';
import { collectionApi } from '../../lib/api/collectionApi';
import { handleApiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

interface CollectionInfo {
    collection_id: number;
    name: string;
    scope: string;
}

/** A context option the user can choose when creating/editing a note */
interface ContextOption {
    type: string | null;   // null = general, 'report', 'collection'
    id: number | null;
    label: string;
}

interface ArticleNotesProps {
    articleId: number;
    /** If viewing from a report, pass its id and title so it appears as a context option */
    reportId?: number;
    reportTitle?: string;
}

export default function ArticleNotes({ articleId, reportId, reportTitle }: ArticleNotesProps) {
    const { user } = useAuth();
    const [notes, setNotes] = useState<ArticleNoteData[]>([]);
    const [collections, setCollections] = useState<CollectionInfo[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // New note form
    const [showNewNoteForm, setShowNewNoteForm] = useState(false);
    const [newContent, setNewContent] = useState('');
    const [newVisibility, setNewVisibility] = useState<'personal' | 'shared'>('personal');
    const [newContextType, setNewContextType] = useState<string | null>(null);
    const [newContextId, setNewContextId] = useState<number | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Edit state
    const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
    const [editContent, setEditContent] = useState('');
    const [editVisibility, setEditVisibility] = useState<'personal' | 'shared'>('personal');
    const [isUpdating, setIsUpdating] = useState(false);

    // Build available context options
    const contextOptions: ContextOption[] = [
        { type: null, id: null, label: 'General' },
    ];
    if (reportId) {
        contextOptions.push({ type: 'report', id: reportId, label: `Report: ${reportTitle || reportId}` });
    }
    for (const c of collections) {
        contextOptions.push({ type: 'collection', id: c.collection_id, label: `Collection: ${c.name}` });
    }

    const loadNotes = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [notesResp, collectionsResp] = await Promise.all([
                notesApi.getNotes(articleId),
                collectionApi.getCollectionsForArticle(articleId),
            ]);
            setNotes(notesResp.notes);
            setCollections(collectionsResp);
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsLoading(false);
        }
    }, [articleId]);

    useEffect(() => { loadNotes(); }, [loadNotes]);

    // Default the context to the current viewing context when opening the form
    const openNewNoteForm = () => {
        setNewContent('');
        setNewVisibility('personal');
        if (reportId) {
            setNewContextType('report');
            setNewContextId(reportId);
        } else {
            setNewContextType(null);
            setNewContextId(null);
        }
        setShowNewNoteForm(true);
    };

    const handleContextChange = (optionIndex: number) => {
        const opt = contextOptions[optionIndex];
        setNewContextType(opt.type);
        setNewContextId(opt.id);
    };

    const selectedContextIndex = contextOptions.findIndex(
        o => o.type === newContextType && o.id === newContextId
    );

    const handleCreateNote = async () => {
        if (!newContent.trim()) return;
        setIsSaving(true);
        setError(null);
        try {
            const newNote = await notesApi.createNote(articleId, {
                content: newContent.trim(),
                visibility: newVisibility,
                context_type: newContextType || undefined,
                context_id: newContextId || undefined,
            });
            setNotes(prev => [...prev, newNote]);
            setShowNewNoteForm(false);
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsSaving(false);
        }
    };

    const handleStartEdit = (note: ArticleNoteData) => {
        setEditingNoteId(note.note_id);
        setEditContent(note.content);
        setEditVisibility(note.visibility);
    };

    const handleCancelEdit = () => {
        setEditingNoteId(null);
        setEditContent('');
        setEditVisibility('personal');
    };

    const handleSaveEdit = async () => {
        if (!editingNoteId || !editContent.trim()) return;
        setIsUpdating(true);
        setError(null);
        try {
            const updated = await notesApi.updateNote(editingNoteId, {
                content: editContent.trim(),
                visibility: editVisibility,
            });
            setNotes(prev => prev.map(n => n.note_id === editingNoteId ? updated : n));
            handleCancelEdit();
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsUpdating(false);
        }
    };

    const handleDeleteNote = async (noteId: number) => {
        if (!confirm('Delete this note?')) return;
        try {
            await notesApi.deleteNote(noteId);
            setNotes(prev => prev.filter(n => n.note_id !== noteId));
        } catch (err) {
            setError(handleApiError(err));
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: 'numeric', minute: '2-digit',
        });
    };

    const isOwnNote = (note: ArticleNoteData) => user && note.user_id === user.id;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            {/* Collections this article belongs to */}
            {collections.length > 0 && (
                <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        <FolderIcon className="h-3.5 w-3.5" />
                        In Collections
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {collections.map(c => (
                            <span
                                key={c.collection_id}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                            >
                                <FolderIcon className="h-3 w-3" />
                                {c.name}
                                <span className="text-gray-400 dark:text-gray-500">({c.scope})</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Notes ({notes.length})
                </h2>
                {!showNewNoteForm && (
                    <button
                        onClick={openNewNoteForm}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                        <PlusIcon className="h-4 w-4" />
                        Add Note
                    </button>
                )}
            </div>

            {error && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
                    {error}
                </div>
            )}

            {/* New Note Form */}
            {showNewNoteForm && (
                <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                    <textarea
                        value={newContent}
                        onChange={(e) => setNewContent(e.target.value)}
                        placeholder="Write your note..."
                        className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        rows={4}
                        autoFocus
                    />
                    {/* Two-row controls: visibility + context */}
                    <div className="mt-3 space-y-3">
                        <div className="flex items-center gap-3">
                            <span className="text-sm text-gray-500 dark:text-gray-400 w-16 flex-shrink-0">Who sees:</span>
                            <VisibilityToggle value={newVisibility} onChange={setNewVisibility} />
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-sm text-gray-500 dark:text-gray-400 w-16 flex-shrink-0">Context:</span>
                            <ContextSelector
                                options={contextOptions}
                                selectedIndex={selectedContextIndex >= 0 ? selectedContextIndex : 0}
                                onChange={handleContextChange}
                            />
                        </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            {newVisibility === 'personal' ? 'Only you can see this note' : 'Visible to your organization'}
                            {newContextType === null && ' — general note on this article'}
                            {newContextType === 'report' && ` — in context of this report`}
                            {newContextType === 'collection' && ` — in context of "${contextOptions.find(o => o.type === 'collection' && o.id === newContextId)?.label.replace('Collection: ', '')}"`}
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowNewNoteForm(false)}
                                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateNote}
                                disabled={isSaving || !newContent.trim()}
                                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                            >
                                {isSaving ? 'Saving...' : <><CheckIcon className="h-4 w-4" />Save Note</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Notes List */}
            <div className="flex-1 overflow-y-auto space-y-4">
                {notes.length === 0 && !showNewNoteForm && (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        <p>No notes yet</p>
                        <p className="text-sm mt-1">Add a note to keep track of your thoughts on this article</p>
                    </div>
                )}

                {notes.map((note) => (
                    <div
                        key={note.note_id}
                        className={`p-4 rounded-lg border ${
                            isOwnNote(note)
                                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                                : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700'
                        }`}
                    >
                        {editingNoteId === note.note_id ? (
                            <div>
                                <textarea
                                    value={editContent}
                                    onChange={(e) => setEditContent(e.target.value)}
                                    className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    rows={4}
                                    autoFocus
                                />
                                <div className="mt-3 flex items-center justify-between">
                                    <VisibilityToggle value={editVisibility} onChange={setEditVisibility} />
                                    <div className="flex items-center gap-2">
                                        <button onClick={handleCancelEdit} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400">Cancel</button>
                                        <button
                                            onClick={handleSaveEdit}
                                            disabled={isUpdating || !editContent.trim()}
                                            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                                        >
                                            {isUpdating ? 'Saving...' : <><CheckIcon className="h-4 w-4" />Save</>}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Note Header — author + badges */}
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-medium text-gray-900 dark:text-white">
                                            {isOwnNote(note) ? 'You' : note.author_name}
                                        </span>
                                        <VisibilityBadge visibility={note.visibility} />
                                        <ContextBadge
                                            contextType={note.context_type}
                                            contextId={note.context_id}
                                            collections={collections}
                                            reportId={reportId}
                                            reportTitle={reportTitle}
                                        />
                                    </div>
                                    {isOwnNote(note) && (
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            <button
                                                onClick={() => handleStartEdit(note)}
                                                className="p-1.5 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 rounded hover:bg-white dark:hover:bg-gray-800"
                                                title="Edit note"
                                            >
                                                <PencilIcon className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteNote(note.note_id)}
                                                className="p-1.5 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 rounded hover:bg-white dark:hover:bg-gray-800"
                                                title="Delete note"
                                            >
                                                <TrashIcon className="h-4 w-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Note Content */}
                                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{note.content}</p>

                                {/* Note Footer */}
                                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                    {note.created_at !== note.updated_at
                                        ? `Updated ${formatDate(note.updated_at)}`
                                        : formatDate(note.created_at)}
                                </p>
                            </>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}


/** Badge showing personal/shared */
function VisibilityBadge({ visibility }: { visibility: string }) {
    if (visibility === 'shared') {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                <UsersIcon className="h-3 w-3" /> Shared
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
            <UserIcon className="h-3 w-3" /> Personal
        </span>
    );
}


/** Badge showing the note's context — General, Report, or Collection name */
function ContextBadge({
    contextType, contextId, collections, reportId, reportTitle,
}: {
    contextType?: string | null;
    contextId?: number | null;
    collections: CollectionInfo[];
    reportId?: number;
    reportTitle?: string;
}) {
    if (!contextType) {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                <GlobeAltIcon className="h-3 w-3" /> General
            </span>
        );
    }
    if (contextType === 'report') {
        const label = (contextId === reportId && reportTitle) ? reportTitle : `Report #${contextId}`;
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                <DocumentTextIcon className="h-3 w-3" /> {label}
            </span>
        );
    }
    if (contextType === 'collection') {
        const coll = collections.find(c => c.collection_id === contextId);
        const label = coll ? coll.name : `Collection #${contextId}`;
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                <FolderIcon className="h-3 w-3" /> {label}
            </span>
        );
    }
    return null;
}


/** Toggle for personal/shared selection */
function VisibilityToggle({ value, onChange }: { value: 'personal' | 'shared'; onChange: (v: 'personal' | 'shared') => void }) {
    return (
        <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button
                onClick={() => onChange('personal')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm ${
                    value === 'personal'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
            >
                <UserIcon className="h-4 w-4" />
                Personal
            </button>
            <button
                onClick={() => onChange('shared')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border-l border-gray-200 dark:border-gray-700 ${
                    value === 'shared'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
            >
                <UsersIcon className="h-4 w-4" />
                Shared
            </button>
        </div>
    );
}


/** Segmented selector for note context */
function ContextSelector({ options, selectedIndex, onChange }: {
    options: ContextOption[];
    selectedIndex: number;
    onChange: (index: number) => void;
}) {
    return (
        <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            {options.map((opt, i) => {
                const isSelected = i === selectedIndex;
                const Icon = opt.type === null ? GlobeAltIcon
                    : opt.type === 'report' ? DocumentTextIcon
                    : FolderIcon;
                return (
                    <button
                        key={`${opt.type}-${opt.id}`}
                        onClick={() => onChange(i)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm ${i > 0 ? 'border-l border-gray-200 dark:border-gray-700' : ''} ${
                            isSelected
                                ? 'bg-blue-600 text-white'
                                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                    >
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate max-w-[150px]">{opt.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
