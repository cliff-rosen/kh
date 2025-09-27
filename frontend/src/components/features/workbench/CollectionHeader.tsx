import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Cloud, Search, Folder, Edit2, Check, X, Settings } from 'lucide-react';
import { ArticleCollection, CollectionSource } from '@/types/articleCollection';
import { ExportMenu } from './ExportMenu';

interface CollectionHeaderProps {
  collection: ArticleCollection;
  searchPagination?: {
    currentPage: number;
    totalPages: number;
    totalResults: number;
    pageSize: number;
  } | null;
  groupPagination?: {
    currentPage: number;
    totalPages: number;
    totalResults: number;
    pageSize: number;
  } | null;
  selectedArticleIds: string[];
  onManageFeatures: () => void;
  onSaveChanges: () => void;
  onSaveAsGroup: () => void;
  onAddToGroup: () => void;
  onDeleteSelected: () => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  isExtracting: boolean;
  isLoading: boolean;
  onUpdateGroupInfo?: (name: string, description?: string) => Promise<void>;
  onExport?: (format: 'csv' | 'json') => Promise<void>;
  onCopyToClipboard?: (format: 'csv' | 'json' | 'text') => Promise<void>;
}

export function CollectionHeader({
  collection,
  searchPagination,
  groupPagination,
  selectedArticleIds,
  onManageFeatures,
  onSaveChanges,
  onSaveAsGroup,
  onAddToGroup,
  onDeleteSelected,
  onSelectAll,
  onSelectNone,
  isExtracting,
  isLoading,
  onUpdateGroupInfo,
  onExport,
  onCopyToClipboard
}: CollectionHeaderProps) {
  const isSearchResult = collection.source === CollectionSource.SEARCH;
  const isModified = collection.is_modified;
  
  // Editing state for group name and description  
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedName, setEditedName] = useState(collection.name || '');
  const [editedDescription, setEditedDescription] = useState(collection.description || '');
  const [isSavingInfo, setIsSavingInfo] = useState(false);
  
  // Get the search query from search_params
  const searchQuery = collection.search_params?.query || collection.name;
  
  const handleSaveGroupInfo = async () => {
    if (!onUpdateGroupInfo || !editedName.trim()) return;
    
    setIsSavingInfo(true);
    try {
      await onUpdateGroupInfo(editedName.trim(), editedDescription.trim() || undefined);
      setIsEditingName(false);
      setIsEditingDescription(false);
    } catch (error) {
      console.error('Failed to update group info:', error);
      // Reset to original values on error
      setEditedName(collection.name || '');
      setEditedDescription(collection.description || '');
    } finally {
      setIsSavingInfo(false);
    }
  };
  
  const handleCancelEdit = () => {
    setEditedName(collection.name || '');
    setEditedDescription(collection.description || '');
    setIsEditingName(false);
    setIsEditingDescription(false);
  };
  
  const handleStartEditName = () => {
    setEditedName(collection.name || '');
    setIsEditingName(true);
  };
  
  const handleStartEditDescription = () => {
    setEditedDescription(collection.description || '');
    setIsEditingDescription(true);
  };
  
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-200/50 dark:border-gray-700/50">
      {/* Left side: Icon + Name + Stats */}
      <div className="flex items-center gap-3">
        {isSearchResult ? (
          <>
            <Search className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-900 dark:text-gray-100">Search Results</span>
              <span className="text-gray-500 dark:text-gray-400">•</span>
              <span className="font-medium text-sm text-gray-700 dark:text-gray-300">"{searchQuery}"</span>
              {searchPagination && (
                <>
                  <span className="text-gray-500 dark:text-gray-400">•</span>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {searchPagination.totalResults} results
                    {searchPagination.totalPages > 1 && 
                      ` • Page ${searchPagination.currentPage}/${searchPagination.totalPages}`
                    }
                  </span>
                </>
              )}
              {collection.feature_definitions.length > 0 && (
                <>
                  <span className="text-gray-500 dark:text-gray-400">•</span>
                  <Badge variant="secondary" className="text-xs">
                    {collection.feature_definitions.length} features
                  </Badge>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <Folder className={`w-5 h-5 flex-shrink-0 ${
              isModified 
                ? 'text-yellow-600 dark:text-yellow-400' 
                : 'text-green-600 dark:text-green-400'
            }`} />
            <div className="flex flex-col gap-1">
              {/* First row: Group name */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  Saved Group{isModified && ' (Modified)'}
                  {isModified && <span className="text-yellow-600 dark:text-yellow-400 ml-1">*</span>}
                </span>
                <span className="text-gray-500 dark:text-gray-400">•</span>
                
                {/* Editable Group Name */}
                {isEditingName ? (
                  <div className="flex items-center gap-1">
                    <Input
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      className="h-6 px-2 text-sm font-medium min-w-[200px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveGroupInfo();
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                      autoFocus
                    />
                    <Button
                      onClick={handleSaveGroupInfo}
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      disabled={isSavingInfo || !editedName.trim()}
                    >
                      {isSavingInfo ? (
                        <Loader2 className="w-3 h-3 animate-spin text-gray-600 dark:text-gray-400" />
                      ) : (
                        <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
                      )}
                    </Button>
                    <Button
                      onClick={handleCancelEdit}
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      disabled={isSavingInfo}
                    >
                      <X className="w-3 h-3 text-red-600 dark:text-red-400" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-sm text-gray-700 dark:text-gray-300">"{collection.name}"</span>
                    {onUpdateGroupInfo && (
                      <Button
                        onClick={handleStartEditName}
                        size="sm"
                        variant="ghost"
                        className="h-5 w-5 p-0 ml-1"
                      >
                        <Edit2 className="w-3 h-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                      </Button>
                    )}
                  </div>
                )}
                
                <span className="text-gray-500 dark:text-gray-400">•</span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {groupPagination ? (
                    `${groupPagination.totalResults} articles total • Page ${groupPagination.currentPage}/${groupPagination.totalPages}`
                  ) : (
                    `${collection.articles.length} articles`
                  )}
                </span>
                {collection.feature_definitions.length > 0 && (
                  <>
                    <span className="text-gray-500 dark:text-gray-400">•</span>
                    <Badge variant="secondary" className="text-xs">
                      {collection.feature_definitions.length} features
                    </Badge>
                  </>
                )}
              </div>
              
              {/* Second row: Group description (if exists or being edited) */}
              {(collection.description || isEditingDescription) && (
                <div className="flex items-center gap-2">
                  {isEditingDescription ? (
                    <div className="flex items-start gap-1">
                      <Textarea
                        value={editedDescription}
                        onChange={(e) => setEditedDescription(e.target.value)}
                        className="min-h-[60px] text-xs resize-none min-w-[300px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
                        placeholder="Add a description..."
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.ctrlKey) handleSaveGroupInfo();
                          if (e.key === 'Escape') handleCancelEdit();
                        }}
                        autoFocus
                      />
                      <div className="flex flex-col gap-1">
                        <Button
                          onClick={handleSaveGroupInfo}
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          disabled={isSavingInfo}
                        >
                          {isSavingInfo ? (
                            <Loader2 className="w-3 h-3 animate-spin text-gray-600 dark:text-gray-400" />
                          ) : (
                            <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
                          )}
                        </Button>
                        <Button
                          onClick={handleCancelEdit}
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          disabled={isSavingInfo}
                        >
                          <X className="w-3 h-3 text-red-600 dark:text-red-400" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-1">
                      <span className="text-xs text-gray-600 dark:text-gray-400 italic">
                        {collection.description || 'No description'}
                      </span>
                      {onUpdateGroupInfo && (
                        <Button
                          onClick={handleStartEditDescription}
                          size="sm"
                          variant="ghost"
                          className="h-4 w-4 p-0 ml-1"
                        >
                          <Edit2 className="w-2.5 h-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
              
              {/* Add description button if no description exists */}
              {!collection.description && !isEditingDescription && onUpdateGroupInfo && (
                <div className="flex items-center gap-1">
                  <Button
                    onClick={handleStartEditDescription}
                    size="sm"
                    variant="ghost"
                    className="h-5 px-2 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <Edit2 className="w-2.5 h-2.5 mr-1" />
                    Add description
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Right side: Action Buttons */}
      <div className="flex items-center gap-4">
        {selectedArticleIds.length > 0 ? (
          // Selection Mode Active
          <>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {selectedArticleIds.length} selected
            </span>

            {/* Group Management */}
            <div className="flex items-center gap-2">
              <Button
                onClick={onSaveAsGroup}
                variant="outline"
                size="sm"
              >
                <Cloud className="w-4 h-4 mr-2" />
                Save Selected as Group
              </Button>

              <Button
                onClick={onAddToGroup}
                variant="outline"
                size="sm"
              >
                Add Selected to Group
              </Button>
            </div>

            {/* Separator */}
            <div className="h-6 border-l border-gray-300 dark:border-gray-600" />

            {/* Features */}
            <div className="flex items-center gap-2">
              <Button
                onClick={onManageFeatures}
                variant="outline"
                size="sm"
              >
                Manage Features for Selected
              </Button>
            </div>

            {/* Separator */}
            <div className="h-6 border-l border-gray-300 dark:border-gray-600" />

            {/* Delete & Clear */}
            <div className="flex items-center gap-2">
              {/* Delete Selected - only for saved groups */}
              {collection.source === CollectionSource.SAVED_GROUP && (
                <Button
                  onClick={onDeleteSelected}
                  variant="outline"
                  size="sm"
                  className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                >
                  Delete Selected
                </Button>
              )}

              <Button
                onClick={onSelectNone}
                variant="ghost"
                size="sm"
              >
                Clear Selection
              </Button>
            </div>
          </>
        ) : (
          // Normal Mode
          <>
            {/* Group Management */}
            <div className="flex items-center gap-2">
              {/* Save Changes - only for modified saved groups */}
              {collection.source === CollectionSource.SAVED_GROUP && isModified && (
                <Button
                  onClick={onSaveChanges}
                  variant="default"
                  size="sm"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin text-white" />
                  ) : (
                    <Cloud className="w-4 h-4 mr-2" />
                  )}
                  Save Changes
                </Button>
              )}

              <Button
                onClick={onSaveAsGroup}
                variant="outline"
                size="sm"
              >
                <Cloud className="w-4 h-4 mr-2" />
                {collection.source === CollectionSource.SEARCH ? 'Save as Group' : 'Copy to New Group'}
              </Button>

              <Button
                onClick={onAddToGroup}
                variant="outline"
                size="sm"
              >
                Add to Group
              </Button>
            </div>

            {/* Separator */}
            <div className="h-6 border-l border-gray-300 dark:border-gray-600" />

            {/* Features */}
            <div className="flex items-center gap-2">
              <Button
                onClick={onManageFeatures}
                variant="default"
                size="sm"
                disabled={collection.articles.length === 0 || isExtracting}
              >
                {isExtracting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin text-white" />
                    Extracting...
                  </>
                ) : (
                  <>
                    <Settings className="w-4 h-4 mr-2" />
                    Manage Features
                  </>
                )}
              </Button>

              {/* Export Menu */}
              {onExport && onCopyToClipboard && (
                <ExportMenu
                  onExport={onExport}
                  onCopyToClipboard={onCopyToClipboard}
                  articleCount={
                    isSearchResult 
                      ? searchPagination?.totalResults || collection.articles.length
                      : groupPagination?.totalResults || collection.articles.length
                  }
                  disabled={collection.articles.length === 0}
                />
              )}
            </div>

            {/* Separator */}
            <div className="h-6 border-l border-gray-300 dark:border-gray-600" />

            {/* Selection */}
            <div className="flex items-center gap-2">
              <Button
                onClick={onSelectAll}
                variant="ghost"
                size="sm"
                disabled={collection.articles.length === 0}
              >
                Select All
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}