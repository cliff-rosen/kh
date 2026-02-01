/**
 * Help Content Browser
 *
 * Platform admin component for browsing and previewing help documentation.
 * Shows all help sections organized by area, their role visibility, and allows
 * previewing how the TOC appears to different user roles.
 */

import { useState, useEffect, useMemo } from 'react';
import {
    ArrowPathIcon,
    BookOpenIcon,
    ChevronRightIcon,
    ChevronDownIcon,
    EyeIcon,
    UserIcon,
    UserGroupIcon,
    ShieldCheckIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';
import {
    adminApi,
    HelpSectionSummary,
    HelpSectionDetail,
    HelpTOCPreview,
} from '../../lib/api/adminApi';
import { handleApiError } from '../../lib/api';
import { MarkdownRenderer } from '../ui/MarkdownRenderer';

type ViewMode = 'sections' | 'toc-preview';

interface SectionGroup {
    area: string;
    label: string;
    sections: HelpSectionSummary[];
}

/** Get the area from a section ID (e.g., "reports/viewing" -> "reports") */
function getArea(sectionId: string): string {
    const parts = sectionId.split('/');
    return parts.length > 1 ? parts[0] : 'general';
}

/** Get a display label for an area */
function getAreaLabel(area: string): string {
    const labels: Record<string, string> = {
        'general': 'Getting Started',
        'reports': 'Reports',
        'streams': 'Streams',
        'tools': 'Tools',
        'operations': 'Operations',
    };
    return labels[area] || area.charAt(0).toUpperCase() + area.slice(1);
}

/** Area sort order */
function getAreaOrder(area: string): number {
    const order: Record<string, number> = {
        'general': 0,
        'reports': 1,
        'streams': 2,
        'tools': 3,
        'operations': 4,
    };
    return order[area] ?? 99;
}

export function HelpContentBrowser() {
    // Data state
    const [sections, setSections] = useState<HelpSectionSummary[]>([]);
    const [tocPreviews, setTocPreviews] = useState<HelpTOCPreview[]>([]);
    const [selectedSection, setSelectedSection] = useState<HelpSectionDetail | null>(null);

    // UI state
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingSection, setIsLoadingSection] = useState(false);
    const [isReloading, setIsReloading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('sections');
    const [collapsedAreas, setCollapsedAreas] = useState<Set<string>>(new Set());

    // Group sections by area
    const groupedSections = useMemo((): SectionGroup[] => {
        const groups: Record<string, HelpSectionSummary[]> = {};

        for (const section of sections) {
            const area = getArea(section.id);
            if (!groups[area]) {
                groups[area] = [];
            }
            groups[area].push(section);
        }

        // Sort sections within each group by order
        for (const area in groups) {
            groups[area].sort((a, b) => a.order - b.order);
        }

        // Convert to array and sort by area order
        return Object.entries(groups)
            .map(([area, sects]) => ({
                area,
                label: getAreaLabel(area),
                sections: sects,
            }))
            .sort((a, b) => getAreaOrder(a.area) - getAreaOrder(b.area));
    }, [sections]);

    const toggleArea = (area: string) => {
        setCollapsedAreas(prev => {
            const next = new Set(prev);
            if (next.has(area)) {
                next.delete(area);
            } else {
                next.add(area);
            }
            return next;
        });
    };

    // Load data on mount
    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [sectionsRes, tocRes] = await Promise.all([
                adminApi.getHelpSections(),
                adminApi.getHelpTocPreview(),
            ]);
            setSections(sectionsRes.sections);
            setTocPreviews(tocRes);
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsLoading(false);
        }
    };

    const handleReload = async () => {
        setIsReloading(true);
        try {
            const result = await adminApi.reloadHelpContent();
            // Reload data after successful reload
            await loadData();
            alert(`Reloaded ${result.sections_loaded} help sections`);
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsReloading(false);
        }
    };

    const handleViewSection = async (sectionId: string) => {
        setIsLoadingSection(true);
        try {
            const detail = await adminApi.getHelpSection(sectionId);
            setSelectedSection(detail);
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsLoadingSection(false);
        }
    };

    const getRoleIcon = (role: string) => {
        switch (role) {
            case 'platform_admin':
                return <ShieldCheckIcon className="h-4 w-4" />;
            case 'org_admin':
                return <UserGroupIcon className="h-4 w-4" />;
            default:
                return <UserIcon className="h-4 w-4" />;
        }
    };

    const getRoleBadgeColor = (role: string) => {
        switch (role) {
            case 'platform_admin':
                return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
            case 'org_admin':
                return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
            default:
                return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <ArrowPathIcon className="h-8 w-8 animate-spin text-gray-400" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Help Content
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Browse and preview help documentation shown to users via chat
                    </p>
                </div>
                <button
                    onClick={handleReload}
                    disabled={isReloading}
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
                >
                    <ArrowPathIcon className={`h-4 w-4 ${isReloading ? 'animate-spin' : ''}`} />
                    Reload from Files
                </button>
            </div>

            {/* Error banner */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
                    {error}
                </div>
            )}

            {/* View mode tabs */}
            <div className="border-b border-gray-200 dark:border-gray-700">
                <nav className="flex gap-4">
                    <button
                        onClick={() => setViewMode('sections')}
                        className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                            viewMode === 'sections'
                                ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                        }`}
                    >
                        <div className="flex items-center gap-2">
                            <BookOpenIcon className="h-4 w-4" />
                            All Sections ({sections.length})
                        </div>
                    </button>
                    <button
                        onClick={() => setViewMode('toc-preview')}
                        className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                            viewMode === 'toc-preview'
                                ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                        }`}
                    >
                        <div className="flex items-center gap-2">
                            <EyeIcon className="h-4 w-4" />
                            TOC by Role
                        </div>
                    </button>
                </nav>
            </div>

            {/* Sections list - grouped by area */}
            {viewMode === 'sections' && (
                <div className="space-y-4">
                    {groupedSections.map((group) => (
                        <div key={group.area} className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                            {/* Area header */}
                            <button
                                onClick={() => toggleArea(group.area)}
                                className="w-full flex items-center justify-between px-6 py-4 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <BookOpenIcon className="h-5 w-5 text-purple-500" />
                                    <span className="text-lg font-semibold text-gray-900 dark:text-white">
                                        {group.label}
                                    </span>
                                    <span className="text-sm text-gray-500 dark:text-gray-400">
                                        ({group.sections.length} sections)
                                    </span>
                                </div>
                                {collapsedAreas.has(group.area) ? (
                                    <ChevronRightIcon className="h-5 w-5 text-gray-400" />
                                ) : (
                                    <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                                )}
                            </button>

                            {/* Sections in this area */}
                            {!collapsedAreas.has(group.area) && (
                                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                    <thead className="bg-gray-50/50 dark:bg-gray-900/50">
                                        <tr>
                                            <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                Section
                                            </th>
                                            <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                Visible To
                                            </th>
                                            <th className="px-6 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                        {group.sections.map((section) => (
                                            <tr
                                                key={section.id}
                                                className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                                            >
                                                <td className="px-6 py-3">
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                                                            {section.title}
                                                        </span>
                                                        <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                                                            {section.id}
                                                        </span>
                                                        <span className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                                            {section.summary}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-3">
                                                    <div className="flex flex-wrap gap-1">
                                                        {section.roles.map((role) => (
                                                            <span
                                                                key={role}
                                                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${getRoleBadgeColor(role)}`}
                                                            >
                                                                {getRoleIcon(role)}
                                                                {role}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-3 text-right">
                                                    <button
                                                        onClick={() => handleViewSection(section.id)}
                                                        className="inline-flex items-center gap-1 text-sm text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300"
                                                    >
                                                        View
                                                        <ChevronRightIcon className="h-4 w-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* TOC Preview by role */}
            {viewMode === 'toc-preview' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {tocPreviews.map((preview) => (
                        <div
                            key={preview.role}
                            className="bg-white dark:bg-gray-800 rounded-lg shadow p-4"
                        >
                            <div className="flex items-center gap-2 mb-3">
                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-sm font-medium ${getRoleBadgeColor(preview.role)}`}>
                                    {getRoleIcon(preview.role)}
                                    {preview.role}
                                </span>
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-900 rounded p-3 font-mono text-xs whitespace-pre-wrap text-gray-700 dark:text-gray-300 max-h-96 overflow-y-auto">
                                {preview.toc}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Section detail modal */}
            {selectedSection && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[calc(100vw-4rem)] max-w-4xl h-[calc(100vh-4rem)] flex flex-col">
                        {/* Modal header */}
                        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    {selectedSection.title}
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                                    {selectedSection.id}
                                </p>
                            </div>
                            <button
                                onClick={() => setSelectedSection(null)}
                                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                            >
                                <XMarkIcon className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Modal metadata */}
                        <div className="flex-shrink-0 px-6 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-500 dark:text-gray-400">Visible to:</span>
                                    <div className="flex gap-1">
                                        {selectedSection.roles.map((role) => (
                                            <span
                                                key={role}
                                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${getRoleBadgeColor(role)}`}
                                            >
                                                {getRoleIcon(role)}
                                                {role}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                    Order: {selectedSection.order}
                                </div>
                            </div>
                        </div>

                        {/* Modal content */}
                        <div className="flex-1 min-h-0 overflow-y-auto p-6">
                            {isLoadingSection ? (
                                <div className="flex items-center justify-center h-32">
                                    <ArrowPathIcon className="h-6 w-6 animate-spin text-gray-400" />
                                </div>
                            ) : (
                                <div className="prose dark:prose-invert max-w-none">
                                    <MarkdownRenderer content={selectedSection.content} />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
