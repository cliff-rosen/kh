import { XMarkIcon, BuildingOfficeIcon } from '@heroicons/react/24/outline';

interface TagBadgeProps {
    name: string;
    color?: string;
    scope?: string;
    onRemove?: () => void;
    size?: 'sm' | 'md';
}

export default function TagBadge({ name, color, scope, onRemove, size = 'sm' }: TagBadgeProps) {
    const isOrg = scope === 'organization';
    const bgColor = color || (isOrg ? '#3b82f6' : '#6b7280');

    const sizeClasses = size === 'sm'
        ? 'text-xs px-2 py-0.5'
        : 'text-sm px-2.5 py-1';

    // Org tags get a subtle double-ring border to distinguish from personal
    const borderStyle = isOrg
        ? { borderColor: bgColor, borderWidth: '1.5px', borderStyle: 'solid' as const }
        : { borderColor: bgColor, borderWidth: '1px', borderStyle: 'solid' as const };

    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full font-medium ${sizeClasses} text-gray-800 dark:text-gray-200`}
            style={{ backgroundColor: bgColor + '20', ...borderStyle }}
        >
            <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: bgColor }}
            />
            {name}
            {isOrg && (
                <BuildingOfficeIcon className="h-2.5 w-2.5 opacity-50 flex-shrink-0" />
            )}
            {onRemove && (
                <button
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                    className="ml-0.5 hover:opacity-70"
                >
                    <XMarkIcon className="h-3 w-3" />
                </button>
            )}
        </span>
    );
}
