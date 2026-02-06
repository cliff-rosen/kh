import { useState } from 'react';
import { CheckIcon, XMarkIcon, PlusIcon, PencilIcon, TrashIcon, TagIcon } from '@heroicons/react/24/solid';

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

interface ArtifactChangesCardProps {
    proposal: ArtifactChangesProposal;
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
    onAccept,
    onReject,
}: ArtifactChangesCardProps) {
    const catOps = proposal.category_operations || [];
    const [checked, setChecked] = useState<Set<number>>(
        () => new Set(proposal.changes.map((_, i) => i))
    );
    const [catChecked, setCatChecked] = useState<Set<number>>(
        () => new Set(catOps.map((_, i) => i))
    );
    const [isAccepted, setIsAccepted] = useState(false);
    const [isRejected, setIsRejected] = useState(false);
    const [appliedCount, setAppliedCount] = useState(0);

    const toggleCheck = (idx: number) => {
        setChecked(prev => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx); else next.add(idx);
            return next;
        });
    };

    const toggleCatCheck = (idx: number) => {
        setCatChecked(prev => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx); else next.add(idx);
            return next;
        });
    };

    const handleAccept = () => {
        const selectedChanges = proposal.changes.filter((_, i) => checked.has(i));
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

    const totalSelected = checked.size + catChecked.size;
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
                                    const isChecked = checked.has(globalIdx);
                                    const Icon = style.icon;

                                    return (
                                        <label
                                            key={globalIdx}
                                            className={`flex items-start gap-3 p-3 rounded-lg border-l-4 ${style.border} ${style.bg} cursor-pointer transition-opacity ${!isChecked ? 'opacity-50' : ''}`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={() => toggleCheck(globalIdx)}
                                                className="mt-0.5 rounded text-purple-600 focus:ring-purple-500"
                                            />
                                            <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${style.iconColor}`} />
                                            <div className="flex-1 min-w-0">
                                                <ChangeDetail change={change} />
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

function ChangeDetail({ change }: { change: ArtifactChange }) {
    if (change.action === 'create') {
        return (
            <div className="text-sm">
                <div className="font-medium text-gray-900 dark:text-gray-100">{change.title}</div>
                <div className="flex flex-wrap gap-2 mt-1">
                    {change.artifact_type && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            Type: <span className="font-medium">{change.artifact_type}</span>
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
        const fields: string[] = [];
        if (change.title) fields.push(`title: "${change.title}"`);
        if (change.status) fields.push(`status: ${STATUS_LABELS[change.status] || change.status}`);
        if (change.category !== undefined) fields.push(`category: ${change.category || '(clear)'}`);
        if (change.artifact_type) fields.push(`type: ${change.artifact_type}`);
        if (change.description) fields.push('description updated');

        return (
            <div className="text-sm">
                <div className="font-medium text-gray-900 dark:text-gray-100">#{change.id}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {fields.join(' \u00b7 ')}
                </div>
            </div>
        );
    }

    // delete
    return (
        <div className="text-sm">
            <div className="font-medium text-gray-900 dark:text-gray-100">
                #{change.id} {change.title_hint && <span className="text-gray-500 dark:text-gray-400">{'\u2014'} {change.title_hint}</span>}
            </div>
        </div>
    );
}
