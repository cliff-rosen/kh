import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Search,
  FileText,
  Hash,
  Calendar,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Trash2,
  MoreHorizontal,
  Play
} from 'lucide-react';

import { ArticleGroup } from '@/types/workbench';
import { format } from 'date-fns';

interface GroupsTabProps {
  onLoadGroup: (groupId: string) => void;
  onDeleteGroup?: (groupId: string, groupName: string) => void;
  groupsData: ArticleGroup[];
  groupsLoading: boolean;
  onLoadGroupsData: (force?: boolean) => Promise<void>;
}

export function GroupsTab({ onLoadGroup, onDeleteGroup, groupsData, groupsLoading, onLoadGroupsData }: GroupsTabProps) {
  const [filteredGroups, setFilteredGroups] = useState<ArticleGroup[]>(groupsData);
  const [searchTerm, setSearchTerm] = useState('');
  const [operationInProgress, setOperationInProgress] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    // Remember the collapsed state in localStorage
    const saved = localStorage.getItem('groupsTabCollapsed');
    return saved ? JSON.parse(saved) : false;
  });

  // Load groups when component mounts
  useEffect(() => {
    onLoadGroupsData();
  }, []);

  // Update and sort filtered groups when groupsData changes
  useEffect(() => {
    const sorted = [...groupsData].sort((a, b) => 
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    );
    setFilteredGroups(sorted);
  }, [groupsData]);

  // Filter and sort groups based on search term
  useEffect(() => {
    const filtered = groupsData.filter(group =>
      group.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (group.description && group.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );
    
    // Sort alphabetically by name (case insensitive)
    const sorted = filtered.sort((a, b) => 
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    );
    
    setFilteredGroups(sorted);
  }, [groupsData, searchTerm]);

  const handleLoadGroup = async (groupId: string) => {
    setOperationInProgress(groupId);
    try {
      await onLoadGroup(groupId);
    } finally {
      setOperationInProgress(null);
    }
  };

  const handleDeleteGroup = async (groupId: string, groupName: string) => {
    if (!onDeleteGroup) return;

    if (confirm(`Are you sure you want to delete the group "${groupName}"? This action cannot be undone.`)) {
      setOperationInProgress(groupId);
      try {
        await onDeleteGroup(groupId, groupName);
      } catch (error) {
        console.error('Failed to delete group:', error);
      } finally {
        setOperationInProgress(null);
      }
    }
  };

  const handleCollapseChange = (open: boolean) => {
    const collapsed = !open;
    setIsCollapsed(collapsed);
    localStorage.setItem('groupsTabCollapsed', JSON.stringify(collapsed));
  };

  if (groupsLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3 text-gray-900 dark:text-gray-100">
            <div className="flex gap-1">
              <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-pulse"></div>
              <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
              <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
            </div>
            <span className="text-sm">Loading your saved groups...</span>
          </div>
        </div>
      </div>
    );
  }


  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <Collapsible open={!isCollapsed} onOpenChange={handleCollapseChange}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Your Saved Groups</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {groupsData.length === 0
                    ? "No saved groups yet"
                    : `${groupsData.length} group${groupsData.length === 1 ? '' : 's'}`
                  }
                </p>
              </div>
            </div>
            <Button
              onClick={(e) => { e.stopPropagation(); onLoadGroupsData(true); }}
              variant="outline"
              size="sm"
              disabled={groupsLoading}
            >
              {groupsLoading ? (
                <div className="flex gap-0.5">
                  <div className="w-1 h-1 bg-current rounded-full animate-pulse"></div>
                  <div className="w-1 h-1 bg-current rounded-full animate-pulse" style={{ animationDelay: '0.15s' }}></div>
                  <div className="w-1 h-1 bg-current rounded-full animate-pulse" style={{ animationDelay: '0.3s' }}></div>
                </div>
              ) : "Refresh"}
            </Button>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="p-4">

            {groupsData.length > 0 && (
              <>
                {/* Search */}
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                  <Input
                    placeholder="Search groups..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100"
                  />
                </div>

                {/* Groups List - Compact */}
                {filteredGroups.length === 0 ? (
                  <div className="flex items-start gap-2 p-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-md">
                    <AlertCircle className="h-4 w-4 text-gray-600 dark:text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      No groups match your search.
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredGroups.map((group) => (
                      <div
                        key={group.id}
                        className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                      >
                        {/* Load Button - subtle icon-only approach */}
                        <Button
                          onClick={() => handleLoadGroup(group.id)}
                          variant="ghost"
                          size="sm"
                          disabled={operationInProgress === group.id}
                          className="h-8 w-8 p-0 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          {operationInProgress === group.id ? (
                            <MoreHorizontal className="w-4 h-4 animate-pulse" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                        </Button>

                        {/* Group Info - takes remaining space */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3">
                            <h3 className="font-medium text-sm truncate text-gray-900 dark:text-gray-100">
                              {group.name}
                            </h3>
                            <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                              <span className="flex items-center gap-1">
                                <FileText className="w-3 h-3" />
                                {group.article_count || 0}
                              </span>
                              <span className="flex items-center gap-1">
                                <Hash className="w-3 h-3" />
                                {group.feature_definitions?.length || 0}
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {format(new Date(group.updated_at), 'MMM d')}
                              </span>
                            </div>
                          </div>
                          {group.description && (
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                              {group.description}
                            </p>
                          )}
                        </div>

                        {/* Delete Button */}
                        {onDeleteGroup && (
                          <Button
                            onClick={() => handleDeleteGroup(group.id, group.name)}
                            variant="ghost"
                            size="sm"
                            disabled={operationInProgress === group.id}
                            className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                          >
                            {operationInProgress === group.id ? (
                              <div className="w-4 h-4 flex items-center justify-center">
                                <div className="w-1.5 h-1.5 bg-current rounded-full animate-pulse"></div>
                              </div>
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}