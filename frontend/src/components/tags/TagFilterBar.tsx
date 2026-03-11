import { useState, useEffect } from 'react';
import { FunnelIcon } from '@heroicons/react/24/outline';
import { tagApi } from '../../lib/api/tagApi';
import { Tag } from '../../types/tag';

interface AggregateTag extends Tag {
    article_count: number;
}

interface TagFilterBarProps {
    selectedTagIds: number[];
    onSelectionChange: (tagIds: number[]) => void;
    /** When provided, shows only these tags (with counts) instead of fetching all tags */
    tags?: AggregateTag[];
    /** Fetch aggregated tags for a specific report */
    reportId?: number;
    /** Fetch aggregated tags for a specific collection */
    collectionId?: number;
}

/**
 * Lighten a hex color for dark mode backgrounds.
 * Blends toward white by the given amount (0-1).
 */
function lightenColor(hex: string, amount: number): string {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    const lr = Math.round(r + (255 - r) * amount);
    const lg = Math.round(g + (255 - g) * amount);
    const lb = Math.round(b + (255 - b) * amount);
    return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
}

export default function TagFilterBar({ selectedTagIds, onSelectionChange, tags: externalTags, reportId, collectionId }: TagFilterBarProps) {
    const [fetchedTags, setFetchedTags] = useState<AggregateTag[]>([]);

    useEffect(() => {
        if (externalTags) return;

        if (reportId || collectionId) {
            tagApi.getAggregateTags(reportId, collectionId)
                .then(setFetchedTags)
                .catch(console.error);
        } else {
            tagApi.list()
                .then(tags => setFetchedTags(tags.map(t => ({ ...t, article_count: 0 }))))
                .catch(console.error);
        }
    }, [externalTags, reportId, collectionId]);

    const tags = externalTags || fetchedTags;

    if (tags.length === 0) return null;

    const toggle = (tagId: number) => {
        if (selectedTagIds.includes(tagId)) {
            onSelectionChange(selectedTagIds.filter(id => id !== tagId));
        } else {
            onSelectionChange([...selectedTagIds, tagId]);
        }
    };

    // Detect dark mode from document
    const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

    return (
        <div className="flex items-center gap-2 flex-wrap">
            <FunnelIcon className="h-4 w-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
            {tags.map(tag => {
                const isSelected = selectedTagIds.includes(tag.tag_id);
                const baseColor = tag.color || (tag.scope === 'organization' ? '#3b82f6' : '#6b7280');
                const textColor = isDark ? lightenColor(baseColor, 0.4) : baseColor;
                const bgColorSelected = isDark ? baseColor + '25' : baseColor + '18';
                const borderColor = isDark ? lightenColor(baseColor, 0.2) : baseColor;
                return (
                    <button
                        key={tag.tag_id}
                        onClick={() => toggle(tag.tag_id)}
                        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors ${
                            isSelected
                                ? 'font-semibold'
                                : 'opacity-60 hover:opacity-100'
                        }`}
                        style={{
                            backgroundColor: isSelected ? bgColorSelected : 'transparent',
                            borderColor: borderColor,
                            color: textColor,
                        }}
                    >
                        <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: isDark ? lightenColor(baseColor, 0.2) : baseColor }}
                        />
                        {tag.name}
                        {tag.article_count > 0 && (
                            <span className="text-[10px] opacity-70">({tag.article_count})</span>
                        )}
                    </button>
                );
            })}
            {selectedTagIds.length > 0 && (
                <button
                    onClick={() => onSelectionChange([])}
                    className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline"
                >
                    Clear
                </button>
            )}
        </div>
    );
}
