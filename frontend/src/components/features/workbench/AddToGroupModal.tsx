import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Loader2,
  Search,
  FolderOpen,
  AlertCircle,
  FileText,
  Hash,
  Calendar,
  CheckCircle
} from 'lucide-react';
import { workbenchApi } from '@/lib/api/workbenchApi';
import { ArticleGroup } from '@/types/workbench';
import { useToast } from '@/components/ui/use-toast';
import { format } from 'date-fns';

interface AddToGroupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (groupId: string, navigateToGroup: boolean) => Promise<void>;
  articlesToAdd: Array<{ id: string; title: string }>;
  sourceCollectionName: string;
  currentGroupId?: string; // Hide this group from the list
  totalArticleCount?: number; // Total count for when adding entire collection
}

type ModalStep = 'select-group' | 'navigation-choice' | 'adding' | 'success';

export function AddToGroupModal({
  open,
  onOpenChange,
  onConfirm,
  articlesToAdd,
  sourceCollectionName: _sourceCollectionName, // Not used currently
  currentGroupId,
  totalArticleCount
}: AddToGroupModalProps) {
  const [groups, setGroups] = useState<ArticleGroup[]>([]);
  const [filteredGroups, setFilteredGroups] = useState<ArticleGroup[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [modalStep, setModalStep] = useState<ModalStep>('select-group');
  const [targetGroupName, setTargetGroupName] = useState('');
  const [rememberChoice, setRememberChoice] = useState(false);
  const [, setAddResult] = useState<{ articlesAdded: number; duplicatesSkipped: number } | null>(null);
  const { toast } = useToast();

  // Load groups when modal opens
  useEffect(() => {
    if (open && modalStep === 'select-group') {
      loadGroups();
      setSelectedGroupId('');
      setSearchTerm('');
      setAddResult(null);
    }
  }, [open, modalStep]);

  // Check for stored preference
  useEffect(() => {
    const storedPreference = localStorage.getItem('addToGroupNavigationChoice');
    if (storedPreference && modalStep === 'select-group') {
      setRememberChoice(true);
    }
  }, [modalStep]);

  const loadGroups = async () => {
    setIsLoading(true);
    try {
      const response = await workbenchApi.getGroups(1, 100);
      const groupsData: ArticleGroup[] = response.groups || [];
      setGroups(groupsData);
      setFilteredGroups(groupsData);
    } catch (error) {
      console.error('Failed to load groups:', error);
      toast({
        title: 'Error',
        description: 'Failed to load your saved groups',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Filter and sort groups based on search and exclude current group
  useEffect(() => {
    const filtered = groups.filter(group => {
      // Exclude the current group from the list
      if (currentGroupId && group.id === currentGroupId) {
        return false;
      }

      // Apply search filter
      return group.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (group.description && group.description.toLowerCase().includes(searchTerm.toLowerCase()));
    });
    
    // Sort alphabetically by name (case insensitive)
    const sorted = filtered.sort((a, b) => 
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    );
    
    setFilteredGroups(sorted);
  }, [groups, searchTerm, currentGroupId]);

  const handleSelectGroup = () => {
    if (!selectedGroupId) return;

    const selectedGroup = groups.find(g => g.id === selectedGroupId);
    if (!selectedGroup) return;

    setTargetGroupName(selectedGroup.name);
    
    // Check if user has a stored preference
    const storedPreference = localStorage.getItem('addToGroupNavigationChoice');
    if (storedPreference) {
      // User has a preference, execute it directly
      handleExecuteAdd(storedPreference === 'navigate');
    } else {
      // No preference, show choice dialog
      setModalStep('navigation-choice');
    }
  };

  const handleNavigationChoice = (navigateToGroup: boolean) => {
    // Store user preference if they checked the box
    if (rememberChoice) {
      localStorage.setItem('addToGroupNavigationChoice', navigateToGroup ? 'navigate' : 'stay');
    }
    
    handleExecuteAdd(navigateToGroup);
  };

  const handleExecuteAdd = async (navigateToGroup: boolean) => {
    if (!selectedGroupId) return;
    
    setModalStep('adding');
    
    try {
      await onConfirm(selectedGroupId, navigateToGroup);
      // Success is handled by parent, just close the modal
      onOpenChange(false);
      setModalStep('select-group');
    } catch (error) {
      // Error is handled by parent, reset to selection
      setModalStep('select-group');
    }
  };

  const handleClose = () => {
    if (modalStep !== 'adding') {
      onOpenChange(false);
      // Reset modal state when closing
      setModalStep('select-group');
    }
  };

  const renderSelectGroupStep = () => (
    <div className="flex flex-col h-full">
      <DialogHeader className="flex-shrink-0 pb-4">
        <DialogTitle className="text-gray-900 dark:text-gray-100">Add to Existing Group</DialogTitle>
        <DialogDescription className="text-gray-600 dark:text-gray-400">
          Adding {totalArticleCount || articlesToAdd.length} {(totalArticleCount || articlesToAdd.length) === 1 ? 'article' : 'articles'} to an existing group
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col space-y-4 flex-1 min-h-0">
        {/* Article Preview */}
        <div className="flex-shrink-0 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
          <div className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
            Articles to add ({totalArticleCount || articlesToAdd.length}):
          </div>
          <div className="space-y-1 max-h-24 overflow-y-auto">
            {articlesToAdd.slice(0, 5).map((article) => (
              <div
                key={article.id}
                className="text-xs truncate flex items-center gap-2 text-blue-700 dark:text-blue-300"
              >
                <span>•</span>
                <span className="flex-1 truncate">{article.title}</span>
              </div>
            ))}
            {(totalArticleCount || articlesToAdd.length) > 5 && (
              <div className="text-xs text-blue-600 dark:text-blue-400 italic">
                ... and {(totalArticleCount || articlesToAdd.length) - 5} more
              </div>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="flex-shrink-0 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
          <Input
            placeholder="Search groups..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Groups List - Scrollable */}
        <div className="flex-1 min-h-0 max-h-[400px] border rounded-lg">
          <div className="h-full overflow-y-auto p-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-600 dark:text-gray-400" />
              </div>
            ) : filteredGroups.length === 0 ? (
              <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-amber-800 dark:text-amber-200">
                  {searchTerm ? 'No groups match your search.' : 'You don\'t have any saved groups yet.'}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredGroups.map((group) => (
                  <div
                    key={group.id}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${selectedGroupId === group.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    onClick={() => setSelectedGroupId(group.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm truncate mb-1 text-gray-900 dark:text-gray-100">
                          {group.name}
                        </h3>

                        {group.description && (
                          <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                            {group.description}
                          </p>
                        )}

                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <FileText className="w-3 h-3" />
                            {group.article_count}
                          </span>
                          <span className="flex items-center gap-1">
                            <Hash className="w-3 h-3" />
                            {group.feature_definitions?.length || 0}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {format(new Date(group.updated_at), 'MMM d, yyyy h:mm a')}
                          </span>
                        </div>
                      </div>

                      {selectedGroupId === group.id && (
                        <CheckCircle className="w-5 h-5 text-blue-500 dark:text-blue-400 flex-shrink-0" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-2 pt-4 border-t flex-shrink-0">
        <Button variant="outline" onClick={handleClose}>
          Cancel
        </Button>
        <Button
          onClick={handleSelectGroup}
          disabled={!selectedGroupId || isLoading}
        >
          <FolderOpen className="w-4 h-4 mr-2" />
          Add to Group
        </Button>
      </div>
    </div>
  );

  const renderNavigationChoiceStep = () => (
    <div className="flex flex-col h-full">
      <DialogHeader className="flex-shrink-0 pb-4">
        <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
          <FolderOpen className="w-5 h-5 text-blue-500" />
          Add to "{targetGroupName}"?
        </DialogTitle>
        <DialogDescription className="text-muted-foreground">
          What would you like to do after adding {totalArticleCount || articlesToAdd.length} {(totalArticleCount || articlesToAdd.length) === 1 ? 'article' : 'articles'}?
        </DialogDescription>
      </DialogHeader>

      <div className="flex-1 flex flex-col justify-center space-y-6 py-8">
        <div className="flex gap-4">
          <Button
            onClick={() => handleNavigationChoice(false)}
            variant="outline"
            className="flex-1 h-12"
          >
            Stay Here
          </Button>
          <Button
            onClick={() => handleNavigationChoice(true)}
            variant="default"
            className="flex-1 h-12"
          >
            Go to Group
          </Button>
        </div>

        <div className="flex items-center justify-center space-x-2 pt-4">
          <Checkbox
            id="remember-choice"
            checked={rememberChoice}
            onCheckedChange={(checked) => setRememberChoice(checked as boolean)}
          />
          <label
            htmlFor="remember-choice"
            className="text-sm text-muted-foreground cursor-pointer"
          >
            Remember my choice
          </label>
        </div>
      </div>
    </div>
  );

  const renderAddingStep = () => (
    <div className="flex flex-col h-full">
      <DialogHeader className="flex-shrink-0 pb-4">
        <DialogTitle className="text-gray-900 dark:text-gray-100">Adding Articles...</DialogTitle>
        <DialogDescription className="text-gray-600 dark:text-gray-400">
          Please wait while we add the articles to the group
        </DialogDescription>
      </DialogHeader>

      <div className="flex-1 flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-4 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 dark:text-blue-400" />
          <div className="space-y-1">
            <p className="font-medium text-gray-900 dark:text-white">
              Adding {totalArticleCount || articlesToAdd.length} articles to
            </p>
            <p className="text-sm text-muted-foreground">"{targetGroupName}"</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
        {modalStep === 'select-group' && renderSelectGroupStep()}
        {modalStep === 'navigation-choice' && renderNavigationChoiceStep()}
        {modalStep === 'adding' && renderAddingStep()}
      </DialogContent>
    </Dialog>
  );
}