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
    priority?: string;
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
    priority: string | null;
    category: string | null;
    description: string | null;
}

/** A single step in the execution progress list */
export interface ProgressStep {
    label: string;
    status: 'pending' | 'running' | 'done' | 'error';
    error?: string;
}

/**
 * The executor callback. The card calls this with the selected changes.
 * It should process items one at a time and call `onProgress` after each step.
 * The steps array is pre-built by the card; the executor updates statuses.
 */
export type AcceptExecutor = (
    data: { category_operations?: CategoryOperation[]; changes: ArtifactChange[] },
    steps: ProgressStep[],
    onProgress: (steps: ProgressStep[]) => void,
) => Promise<void>;

interface ArtifactChangesCardProps {
    proposal: ArtifactChangesProposal;
    existingArtifacts?: ExistingArtifact[];
    onAccept?: AcceptExecutor;
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
    new: 'New',
    open: 'Open',
    in_progress: 'In Progress',
    icebox: 'Icebox',
    closed: 'Closed',
};

export default function ArtifactChangesCard({
    proposal,
    existingArtifacts,
    onAccept,
    onReject,
}: ArtifactChangesCardProps) {
    const catOps = proposal.category_operations || [];
    const changes = proposal.changes || [];
    const artifactMap = useMemo(() => {
        const map = new Map<number, ExistingArtifact>();
        existingArtifacts?.forEach(a => map.set(a.id, a));
        return map;
    }, [existingArtifacts]);
    const [checked, setChecked] = useState<Set<number>>(
        () => new Set(changes.map((_, i) => i))
    );
    const [catChecked, setCatChecked] = useState<Set<number>>(
        () => new Set(catOps.map((_, i) => i))
    );
    const [isRejected, setIsRejected] = useState(false);

    // Progress state — null means not started, array means executing/done
    const [progressSteps, setProgressSteps] = useState<ProgressStep[] | null>(null);
    const isExecuting = progressSteps !== null;
    const isComplete = progressSteps !== null && progressSteps.every(s => s.status === 'done' || s.status === 'error');

    // Build dependency map: for each artifact change index, which catOp indices it depends on.
    const dependencyMap = useMemo(() => {
        const map = new Map<number, number[]>();
        if (catOps.length === 0) return map;

        changes.forEach((change, changeIdx) => {
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
    }, [changes, catOps]);

    const isBlocked = useCallback((changeIdx: number): boolean => {
        const deps = dependencyMap.get(changeIdx);
        if (!deps) return false;
        return deps.some(opIdx => !catChecked.has(opIdx));
    }, [dependencyMap, catChecked]);

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
        if (isBlocked(idx)) return;
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

            setChecked(prevChecked => {
                const nextChecked = new Set(prevChecked);
                dependencyMap.forEach((deps, changeIdx) => {
                    if (!deps.includes(idx)) return;
                    if (wasChecked) {
                        const allDepsMet = deps.every(d => d === idx ? false : next.has(d));
                        if (!allDepsMet) {
                            nextChecked.delete(changeIdx);
                        }
                    } else {
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

    /** Build human-readable step labels for each selected operation */
    const buildStepLabels = useCallback((
        selectedCatOps: CategoryOperation[],
        selectedChanges: ArtifactChange[],
    ): ProgressStep[] => {
        const steps: ProgressStep[] = [];

        // Category ops
        for (const op of selectedCatOps) {
            if (op.action === 'create') {
                steps.push({ label: `Create category "${op.name}"`, status: 'pending' });
            } else if (op.action === 'rename') {
                steps.push({ label: `Rename category "${op.old_name || '#' + op.id}" to "${op.new_name}"`, status: 'pending' });
            } else if (op.action === 'delete') {
                steps.push({ label: `Delete category "${op.name || '#' + op.id}"`, status: 'pending' });
            }
        }

        // Artifact changes
        for (const change of selectedChanges) {
            const existing = change.id ? artifactMap.get(change.id) : undefined;
            if (change.action === 'create') {
                steps.push({ label: `Create "${change.title}"`, status: 'pending' });
            } else if (change.action === 'update') {
                const name = existing?.title || change.title || `#${change.id}`;
                steps.push({ label: `Update "${name}"`, status: 'pending' });
            } else if (change.action === 'delete') {
                const name = existing?.title || change.title_hint || `#${change.id}`;
                steps.push({ label: `Delete "${name}"`, status: 'pending' });
            }
        }

        // Final refresh step
        steps.push({ label: 'Refreshing list', status: 'pending' });

        return steps;
    }, [artifactMap]);

    const handleAccept = async () => {
        const selectedChanges = changes.filter((_, i) => checked.has(i) && !isBlocked(i));
        const selectedCatOps = catOps.filter((_, i) => catChecked.has(i));
        if (selectedChanges.length === 0 && selectedCatOps.length === 0) return;

        const steps = buildStepLabels(selectedCatOps, selectedChanges);
        setProgressSteps(steps);

        await onAccept?.(
            {
                category_operations: selectedCatOps.length > 0 ? selectedCatOps : undefined,
                changes: selectedChanges,
            },
            steps,
            (updated) => setProgressSteps([...updated]),
        );
    };

    const handleReject = () => {
        setIsRejected(true);
        onReject?.();
    };

    // ── Progress view ──
    if (progressSteps !== null) {
        const doneCount = progressSteps.filter(s => s.status === 'done').length;
        const errorCount = progressSteps.filter(s => s.status === 'error').length;
        const total = progressSteps.length;

        return (
            <div className="space-y-3">
                {/* Progress header */}
                <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {isComplete
                            ? errorCount > 0
                                ? `Completed with ${errorCount} error${errorCount !== 1 ? 's' : ''}`
                                : 'All changes applied'
                            : 'Applying changes...'
                        }
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                        {doneCount}/{total}
                    </span>
                </div>

                {/* Progress bar */}
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                        className={`h-full transition-all duration-300 ease-out rounded-full ${errorCount > 0 ? 'bg-amber-500' : 'bg-green-500'}`}
                        style={{ width: `${((doneCount + errorCount) / total) * 100}%` }}
                    />
                </div>

                {/* Step list */}
                <div className="space-y-1 max-h-64 overflow-y-auto">
                    {progressSteps.map((step, i) => (
                        <div
                            key={i}
                            className={`flex items-center gap-2.5 px-3 py-1.5 rounded text-sm transition-opacity ${
                                step.status === 'pending' ? 'opacity-40' : ''
                            }`}
                        >
                            <StepIcon status={step.status} />
                            <span className={`flex-1 min-w-0 truncate ${
                                step.status === 'done' ? 'text-gray-500 dark:text-gray-400' :
                                step.status === 'running' ? 'text-gray-900 dark:text-gray-100 font-medium' :
                                step.status === 'error' ? 'text-red-600 dark:text-red-400' :
                                'text-gray-400 dark:text-gray-500'
                            }`}>
                                {step.label}
                            </span>
                            {step.error && (
                                <span className="text-xs text-red-500 dark:text-red-400 truncate max-w-[200px]" title={step.error}>
                                    {step.error}
                                </span>
                            )}
                        </div>
                    ))}
                </div>

                {/* Done summary */}
                {isComplete && (
                    <div className={`mt-2 p-3 rounded-lg ${
                        errorCount > 0
                            ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
                            : 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                    }`}>
                        <div className={`flex items-center gap-2 text-sm font-medium ${
                            errorCount > 0
                                ? 'text-amber-800 dark:text-amber-200'
                                : 'text-green-800 dark:text-green-200'
                        }`}>
                            <CheckIcon className="h-4 w-4" />
                            <span>
                                {doneCount} change{doneCount !== 1 ? 's' : ''} applied
                                {errorCount > 0 && `, ${errorCount} failed`}
                            </span>
                        </div>
                    </div>
                )}
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

    const creates = changes.filter(c => c.action === 'create');
    const updates = changes.filter(c => c.action === 'update');
    const deletes = changes.filter(c => c.action === 'delete');
    const groups = [
        { label: 'Create', items: creates, action: 'create' as const },
        { label: 'Update', items: updates, action: 'update' as const },
        { label: 'Delete', items: deletes, action: 'delete' as const },
    ].filter(g => g.items.length > 0);

    // Count only non-blocked checked items
    const effectiveChecked = changes.filter((_, i) => checked.has(i) && !isBlocked(i)).length;
    const totalSelected = effectiveChecked + catChecked.size;
    const totalItems = changes.length + catOps.length;

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
                                    const globalIdx = changes.indexOf(change);
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
                    disabled={totalSelected === 0 || isExecuting}
                    className="flex-1 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
                >
                    <CheckIcon className="h-5 w-5" />
                    Apply Selected ({totalSelected})
                </button>
                <button
                    onClick={handleReject}
                    disabled={isExecuting}
                    className="px-6 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <XMarkIcon className="h-5 w-5" />
                    Reject
                </button>
            </div>
        </div>
    );
}

// ── Step status icon for progress view ──

function StepIcon({ status }: { status: ProgressStep['status'] }) {
    if (status === 'done') {
        return <CheckIcon className="h-4 w-4 flex-shrink-0 text-green-500" />;
    }
    if (status === 'error') {
        return <XMarkIcon className="h-4 w-4 flex-shrink-0 text-red-500" />;
    }
    if (status === 'running') {
        return (
            <div className="h-4 w-4 flex-shrink-0 flex items-center justify-center">
                <div className="h-3 w-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }
    // pending
    return <div className="h-4 w-4 flex-shrink-0 rounded-full border-2 border-gray-300 dark:border-gray-600" />;
}

// ── Sub-components ──

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
    task: 'Task',
};

const PRIORITY_LABELS: Record<string, string> = {
    urgent: 'Urgent',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
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
                    {change.priority && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            Priority: <span className="font-medium">{PRIORITY_LABELS[change.priority] || change.priority}</span>
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
        const displayTitle = existing?.title || change.title || `#${change.id}`;

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
        if (change.priority !== undefined && change.priority !== existing?.priority) {
            diffs.push({
                label: 'Priority',
                oldVal: existing?.priority ? (PRIORITY_LABELS[existing.priority] || existing.priority) : null,
                newVal: change.priority ? (PRIORITY_LABELS[change.priority] || change.priority) : null,
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
