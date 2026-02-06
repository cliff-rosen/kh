import { useState, useMemo, useCallback } from 'react';
import { CheckIcon, XMarkIcon, PlusIcon, PencilIcon, TrashIcon, TagIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid';

interface CategoryOperation {
    action: 'create' | 'rename' | 'delete';
    id?: number;
    name?: string;
    old_name?: string;
    new_name?: string;
}

interface ArtifactChange {
    action: 'create' | 'update' | 'delete';
    id?: number;
    title?: string;
    title_hint?: string;
    artifact_type?: string;
    status?: string;
    category?: string;
    description?: string;
}

interface ArtifactChangesProposal {
    category_operations?: CategoryOperation[];
    changes: ArtifactChange[];
    reasoning?: string;
}

interface ExistingArtifact {
    id: number;
    title: string;
    artifact_type: string;
    status: string;
    category: string | null;
    description: string | null;
}

interface ArtifactChangesCardProps {
    proposal: ArtifactChangesProposal;
    existingArtifacts?: ExistingArtifact[];
    onAccept?: (data: { category_operations?: CategoryOperation[]; changes: ArtifactChange[] }) => void;
    onReject?: () => void;
}

const ACTION_STYLES = {
    create: {
        border: 'border-l-green-500',
        bg: 'bg-green-50 dark:bg-green-900/10',
        icon: PlusIcon,
        iconColor: 'text-green-600 dark:text-green-400',
        label: 'Create',
        labelColor: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    },
    update: {
        border: 'border-l-yellow-500',
        bg: 'bg-yellow-50 dark:bg-yellow-900/10',
        icon: PencilIcon,
        iconColor: 'text-yellow-600 dark:text-yellow-400',
        label: 'Update',
        labelColor: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    },
    delete: {
        border: 'border-l-red-500',
        bg: 'bg-red-50 dark:bg-red-900/10',
        icon: TrashIcon,
        iconColor: 'text-red-600 dark:text-red-400',
        label: 'Delete',
        labelColor: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    },
};

const CAT_ACTION_STYLES = {
    create: { icon: PlusIcon, iconColor: 'text-green-600 dark:text-green-400', label: 'New' },
    rename: { icon: PencilIcon, iconColor: 'text-yellow-600 dark:text-yellow-400', label: 'Rename' },
    delete: { icon: TrashIcon, iconColor: 'text-red-600 dark:text-red-400', label: 'Remove' },
};

const STATUS_LABELS: Record<string, string> = {
    open: 'Open',
    in_progress: 'In Progress',
    backburner: 'Backburner',
    closed: 'Closed',
};

export default function ArtifactChangesCard({
    proposal,
    existingArtifacts,
    onAccept,
    onReject,
}: ArtifactChangesCardProps) {
    const catOps = proposal.category_operations || [];
    const artifactMap = useMemo(() => {
        const map = new Map<number, ExistingArtifact>();
        existingArtifacts?.forEach(a => map.set(a.id, a));
        return map;
    }, [existingArtifacts]);
    const [checked, setChecked] = useState<Set<number>>(
        () => new Set(proposal.changes.map((_, i) => i))
    );
    const [catChecked, setCatChecked] = useState<Set<number>>(
        () => new Set(catOps.map((_, i) => i))
    );
    const [isAccepted, setIsAccepted] = useState(false);
    const [isRejected, setIsRejected] = useState(false);
    const [appliedCount, setAppliedCount] = useState(0);

    // Build dependency map: for each artifact change index, which catOp indices it depends on.
    // An artifact depends on a category op if:
    //   - The artifact's category matches a "create" op's name
    //   - The artifact's category matches a "rename" op's new_name
    const dependencyMap = useMemo(() => {
        const map = new Map<number, number[]>(); // artifact index -> catOp indices
        if (catOps.length === 0) return map;

        proposal.changes.forEach((change, changeIdx) => {
            if (!change.category) return;
            const deps: number[] = [];
            catOps.forEach((op, opIdx) => {
                if (op.action === 'create' && op.name === change.category) {
                    deps.push(opIdx);
                } else if (op.action === 'rename' && op.new_name === change.category) {
                    deps.push(opIdx);
                }
            });
            if (deps.length > 0) {
                map.set(changeIdx, deps);
            }
        });
        return map;
    }, [proposal.changes, catOps]);

    // Check if an artifact change has all its category deps met
    const isBlocked = useCallback((changeIdx: number): boolean => {
        const deps = dependencyMap.get(changeIdx);
        if (!deps) return false;
        return deps.some(opIdx => !catChecked.has(opIdx));
    }, [dependencyMap, catChecked]);

    // Get the category name that's blocking an artifact change
    const getBlockingCategory = useCallback((changeIdx: number): string | null => {
        const deps = dependencyMap.get(changeIdx);
        if (!deps) return null;
        for (const opIdx of deps) {
            if (!catChecked.has(opIdx)) {
                const op = catOps[opIdx];
                if (op.action === 'create') return op.name || 'new category';
                if (op.action === 'rename') return op.new_name || 'renamed category';
            }
        }
        return null;
    }, [dependencyMap, catChecked, catOps]);

    const toggleCheck = (idx: number) => {
        if (isBlocked(idx)) return; // can't check blocked items
        setChecked(prev => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx); else next.add(idx);
            return next;
        });
    };

    const toggleCatCheck = (idx: number) => {
        setCatChecked(prev => {
            const next = new Set(prev);
            const wasChecked = next.has(idx);
            if (wasChecked) {
                next.delete(idx);
            } else {
                next.add(idx);
            }

            // Update dependent artifact changes
            setChecked(prevChecked => {
                const nextChecked = new Set(prevChecked);
                dependencyMap.forEach((deps, changeIdx) => {
                    if (!deps.includes(idx)) return;
                    if (wasChecked) {
                        // Category was unchecked — uncheck dependent artifacts
                        // (only if ALL their deps are now unmet)
                        const allDepsMet = deps.every(d => d === idx ? false : next.has(d));
                        if (!allDepsMet) {
                            nextChecked.delete(changeIdx);
                        }
                    } else {
                        // Category was re-checked — re-check dependent artifacts
                        // (only if all deps are now met)
                        const allDepsMet = deps.every(d => d === idx ? true : next.has(d));
                        if (allDepsMet) {
                            nextChecked.add(changeIdx);
                        }
                    }
                });
                return nextChecked;
            });

            return next;
        });
    };

    const handleAccept = () => {
        // Filter out any blocked artifact changes (safety check)
        const selectedChanges = proposal.changes.filter((_, i) => checked.has(i) && !isBlocked(i));
        const selectedCatOps = catOps.filter((_, i) => catChecked.has(i));
        if (selectedChanges.length === 0 && selectedCatOps.length === 0) return;
        setAppliedCount(selectedChanges.length + selectedCatOps.length);
        setIsAccepted(true);
        onAccept?.({
            category_operations: selectedCatOps.length > 0 ? selectedCatOps : undefined,
            changes: selectedChanges,
        });
    };

    const handleReject = () => {
        setIsRejected(true);
        onReject?.();
    };

    if (isAccepted) {
        return (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
                    <CheckIcon className="h-5 w-5" />
                    <span className="font-medium">Applied {appliedCount} change{appliedCount !== 1 ? 's' : ''}. List is refreshing.</span>
                </div>
            </div>
        );
    }

    if (isRejected) {
        return (
            <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <XMarkIcon className="h-5 w-5" />
                    <span className="font-medium">Changes dismissed</span>
                </div>
            </div>
        );
    }

    const creates = proposal.changes.filter(c => c.action === 'create');
    const updates = proposal.changes.filter(c => c.action === 'update');
    const deletes = proposal.changes.filter(c => c.action === 'delete');
    const groups = [
        { label: 'Create', items: creates, action: 'create' as const },
        { label: 'Update', items: updates, action: 'update' as const },
        { label: 'Delete', items: deletes, action: 'delete' as const },
    ].filter(g => g.items.length > 0);

    // Count only non-blocked checked items
    const effectiveChecked = proposal.changes.filter((_, i) => checked.has(i) && !isBlocked(i)).length;
    const totalSelected = effectiveChecked + catChecked.size;
    const totalItems = proposal.changes.length + catOps.length;

    return (
        <div>
            {/* Reasoning */}
            {proposal.reasoning && (
                <div className="mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-1.5">
                        Reasoning
                    </p>
                    <p className="text-sm text-gray-900 dark:text-gray-100 italic">
                        {proposal.reasoning}
                    </p>
                </div>
            )}

            {/* Summary */}
            <div className="mb-4 flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                <span>{totalItems} proposed change{totalItems !== 1 ? 's' : ''}</span>
                <span className="text-gray-300 dark:text-gray-600">|</span>
                <span>{totalSelected} selected</span>
            </div>

            {/* Category operations */}
            {catOps.length > 0 && (
                <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                        <TagIcon className="h-4 w-4 text-purple-500" />
                        <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                            Categories ({catOps.length})
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 italic">applied first</span>
                    </div>
                    <div className="space-y-1.5">
                        {catOps.map((op, idx) => {
                            const isChecked = catChecked.has(idx);
                            const style = CAT_ACTION_STYLES[op.action];
                            const Icon = style.icon;

                            return (
                                <label
                                    key={idx}
                                    className={`flex items-center gap-3 p-2.5 rounded-lg border-l-4 border-l-purple-400 bg-purple-50 dark:bg-purple-900/10 cursor-pointer transition-opacity ${!isChecked ? 'opacity-50' : ''}`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => toggleCatCheck(idx)}
                                        className="rounded text-purple-600 focus:ring-purple-500"
                                    />
                                    <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${style.iconColor}`} />
                                    <span className="text-sm text-gray-900 dark:text-gray-100">
                                        <CategoryOpDetail op={op} />
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Grouped artifact changes */}
            <div className="space-y-4 mb-6">
                {groups.map(group => {
                    const style = ACTION_STYLES[group.action];
                    return (
                        <div key={group.action}>
                            <div className="flex items-center gap-2 mb-2">
                                <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${style.labelColor}`}>
                                    {group.label} ({group.items.length})
                                </span>
                            </div>
                            <div className="space-y-1.5">
                                {group.items.map(change => {
                                    const globalIdx = proposal.changes.indexOf(change);
                                    const blocked = isBlocked(globalIdx);
                                    const isChecked = checked.has(globalIdx) && !blocked;
                                    const blockingCat = blocked ? getBlockingCategory(globalIdx) : null;
                                    const Icon = style.icon;

                                    return (
                                        <label
                                            key={globalIdx}
                                            className={`flex items-start gap-3 p-3 rounded-lg border-l-4 ${style.border} ${style.bg} transition-opacity ${blocked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} ${!isChecked && !blocked ? 'opacity-50' : ''}`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={() => toggleCheck(globalIdx)}
                                                disabled={blocked}
                                                className="mt-0.5 rounded text-purple-600 focus:ring-purple-500 disabled:opacity-50"
                                            />
                                            <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${style.iconColor}`} />
                                            <div className="flex-1 min-w-0">
                                                <ChangeDetail change={change} existing={change.id ? artifactMap.get(change.id) : undefined} />
                                                {blocked && blockingCat && (
                                                    <div className="flex items-center gap-1 mt-1 text-xs text-amber-600 dark:text-amber-400">
                                                        <ExclamationTriangleIcon className="h-3 w-3 flex-shrink-0" />
                                                        <span>Requires category: {blockingCat}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
                <button
                    onClick={handleAccept}
                    disabled={totalSelected === 0}
                    className="flex-1 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
                >
                    <CheckIcon className="h-5 w-5" />
                    Apply Selected ({totalSelected})
                </button>
                <button
                    onClick={handleReject}
                    className="px-6 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm"
                >
                    <XMarkIcon className="h-5 w-5" />
                    Reject
                </button>
            </div>
        </div>
    );
}

function CategoryOpDetail({ op }: { op: CategoryOperation }) {
    if (op.action === 'create') {
        return <><span className="font-medium">{op.name}</span></>;
    }
    if (op.action === 'rename') {
        return <>
            <span className="text-gray-500 dark:text-gray-400">{op.old_name || `#${op.id}`}</span>
            {' \u2192 '}
            <span className="font-medium">{op.new_name}</span>
        </>;
    }
    // delete
    return <><span className="line-through text-gray-500 dark:text-gray-400">{op.name || `#${op.id}`}</span></>;
}

const TYPE_LABELS: Record<string, string> = {
    bug: 'Bug',
    feature: 'Feature',
};

function FieldDiff({ label, oldVal, newVal }: { label: string; oldVal?: string | null; newVal?: string | null }) {
    const oldDisplay = oldVal || '(none)';
    const newDisplay = newVal || '(none)';
    return (
        <div className="flex items-baseline gap-1.5 text-xs">
            <span className="text-gray-400 dark:text-gray-500 w-16 flex-shrink-0">{label}:</span>
            <span className="text-gray-400 dark:text-gray-500 line-through">{oldDisplay}</span>
            <span className="text-gray-400 dark:text-gray-500">{'\u2192'}</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">{newDisplay}</span>
        </div>
    );
}

function ChangeDetail({ change, existing }: { change: ArtifactChange; existing?: ExistingArtifact }) {
    if (change.action === 'create') {
        return (
            <div className="text-sm">
                <div className="font-medium text-gray-900 dark:text-gray-100">{change.title}</div>
                <div className="flex flex-wrap gap-2 mt-1">
                    {change.artifact_type && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            Type: <span className="font-medium">{TYPE_LABELS[change.artifact_type] || change.artifact_type}</span>
                        </span>
                    )}
                    {change.status && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            Status: <span className="font-medium">{STATUS_LABELS[change.status] || change.status}</span>
                        </span>
                    )}
                    {change.category && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            Category: <span className="font-medium">{change.category}</span>
                        </span>
                    )}
                </div>
                {change.description && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">{change.description}</div>
                )}
            </div>
        );
    }

    if (change.action === 'update') {
        // Show the artifact title so user knows which item this is
        const displayTitle = existing?.title || change.title || `#${change.id}`;

        // Build field-by-field diffs
        const diffs: { label: string; oldVal: string | null; newVal: string | null }[] = [];
        if (change.title !== undefined && change.title !== existing?.title) {
            diffs.push({ label: 'Title', oldVal: existing?.title ?? null, newVal: change.title });
        }
        if (change.status !== undefined && change.status !== existing?.status) {
            diffs.push({
                label: 'Status',
                oldVal: existing?.status ? (STATUS_LABELS[existing.status] || existing.status) : null,
                newVal: STATUS_LABELS[change.status] || change.status,
            });
        }
        if (change.category !== undefined && change.category !== existing?.category) {
            diffs.push({
                label: 'Category',
                oldVal: existing?.category ?? null,
                newVal: change.category || null,
            });
        }
        if (change.artifact_type !== undefined && change.artifact_type !== existing?.artifact_type) {
            diffs.push({
                label: 'Type',
                oldVal: existing?.artifact_type ? (TYPE_LABELS[existing.artifact_type] || existing.artifact_type) : null,
                newVal: TYPE_LABELS[change.artifact_type] || change.artifact_type,
            });
        }
        if (change.description !== undefined) {
            const oldDesc = existing?.description;
            if (change.description !== oldDesc) {
                diffs.push({
                    label: 'Desc.',
                    oldVal: oldDesc ? (oldDesc.length > 40 ? oldDesc.slice(0, 40) + '...' : oldDesc) : null,
                    newVal: change.description.length > 40 ? change.description.slice(0, 40) + '...' : change.description,
                });
            }
        }

        return (
            <div className="text-sm">
                <div className="font-medium text-gray-900 dark:text-gray-100">{displayTitle}</div>
                {diffs.length > 0 ? (
                    <div className="mt-1 space-y-0.5">
                        {diffs.map(d => (
                            <FieldDiff key={d.label} label={d.label} oldVal={d.oldVal} newVal={d.newVal} />
                        ))}
                    </div>
                ) : (
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 italic">No visible changes</div>
                )}
            </div>
        );
    }

    // delete
    const deleteTitle = existing?.title || change.title_hint || `#${change.id}`;
    return (
        <div className="text-sm">
            <div className="font-medium text-gray-900 dark:text-gray-100">{deleteTitle}</div>
            {existing && (
                <div className="flex flex-wrap gap-2 mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                    <span>{TYPE_LABELS[existing.artifact_type] || existing.artifact_type}</span>
                    <span>{'\u00b7'}</span>
                    <span>{STATUS_LABELS[existing.status] || existing.status}</span>
                    {existing.category && <><span>{'\u00b7'}</span><span>{existing.category}</span></>}
                </div>
            )}
        </div>
    );
}
