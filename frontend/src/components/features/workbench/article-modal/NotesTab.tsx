import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Save, Edit3 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useWorkbench } from '@/context/WorkbenchContext';

interface NotesTabProps {
  groupId: string;
  articleId: string;
  initialNotes?: string;
  articleDetail?: { notes?: string }; // Get notes from article detail if available
}

export function NotesTab({ articleId, initialNotes = '', articleDetail }: NotesTabProps) {
  const [notes, setNotes] = useState(initialNotes);
  const [originalNotes, setOriginalNotes] = useState(initialNotes);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const { updateArticleNotes } = useWorkbench();

  // Load existing notes when component mounts
  useEffect(() => {
    setIsLoading(true);
    
    // Get notes from articleDetail prop (should come from WorkbenchContext)
    const existingNotes = articleDetail?.notes || initialNotes || '';
    setNotes(existingNotes);
    setOriginalNotes(existingNotes);
    
    setIsLoading(false);
  }, [initialNotes, articleDetail]);

  useEffect(() => {
    setNotes(initialNotes);
    setOriginalNotes(initialNotes);
  }, [initialNotes]);

  const handleSaveNotes = async () => {
    setIsSaving(true);
    try {
      await updateArticleNotes(articleId, notes, 'group');
      setOriginalNotes(notes); // Update the original notes after successful save
      setIsEditing(false);

      toast({
        title: 'Notes Saved',
        description: 'Your notes have been saved successfully.',
      });
    } catch (error) {
      console.error('Error saving notes:', error);
      toast({
        title: 'Error',
        description: 'Failed to save notes',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Article Notes</h3>
        {!isEditing ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(true)}
            className="gap-2"
          >
            <Edit3 className="w-4 h-4" />
            Edit Notes
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setNotes(originalNotes);
                setIsEditing(false);
              }}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveNotes}
              disabled={isSaving}
              className="gap-2"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving...' : 'Save Notes'}
            </Button>
          </div>
        )}
      </div>

      {isEditing ? (
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add your notes about this article..."
          className="min-h-[400px] font-mono text-sm"
          disabled={isSaving}
        />
      ) : (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-6 min-h-[400px] border border-gray-200 dark:border-gray-700">
          {isLoading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">
              Loading notes...
            </p>
          ) : notes ? (
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {notes}
            </p>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">
              No notes added yet. Click "Edit Notes" to add your thoughts about this article.
            </p>
          )}
        </div>
      )}
    </div>
  );
}