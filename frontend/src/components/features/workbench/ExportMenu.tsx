import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { 
  Download, 
  Copy, 
  FileText, 
  Database, 
  FileJson,
  ChevronDown
} from 'lucide-react';

interface ExportMenuProps {
  onExport: (format: 'csv' | 'json') => Promise<void>;
  onCopyToClipboard: (format: 'csv' | 'json' | 'text') => Promise<void>;
  articleCount: number;
  disabled?: boolean;
}

export function ExportMenu({ 
  onExport, 
  onCopyToClipboard, 
  articleCount, 
  disabled = false 
}: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleExport = async (format: 'csv' | 'json') => {
    if (isProcessing) return;
    
    setIsOpen(false);
    setIsProcessing(true);
    try {
      await onExport(format);
      toast({
        title: 'Export Started',
        description: `Downloading ${articleCount} articles as ${format.toUpperCase()}`,
      });
    } catch (error) {
      toast({
        title: 'Export Failed',
        description: error instanceof Error ? error.message : 'Failed to export collection',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopy = async (format: 'csv' | 'json' | 'text') => {
    if (isProcessing) return;
    
    setIsOpen(false);
    setIsProcessing(true);
    try {
      await onCopyToClipboard(format);
      toast({
        title: 'Copied to Clipboard',
        description: `${articleCount} articles copied as ${format.toUpperCase()}`,
      });
    } catch (error) {
      toast({
        title: 'Copy Failed',
        description: error instanceof Error ? error.message : 'Failed to copy to clipboard',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (articleCount === 0 || disabled) {
    return (
      <Button variant="outline" disabled className="gap-2">
        <Download className="w-4 h-4" />
        Export
      </Button>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <Button 
        variant="outline" 
        disabled={isProcessing} 
        className="gap-2"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Download className="w-4 h-4" />
        Export
        <ChevronDown className="w-4 h-4" />
      </Button>
      
      {isOpen && (
        <Card className="absolute top-full right-0 mt-1 w-56 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg">
          <div className="p-2">
            <div className="px-2 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-600 mb-2">
              Export {articleCount} articles
            </div>
            
            {/* Export to file */}
            <div className="px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
              Download Files
            </div>
            <button 
              className="w-full text-left px-2 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center gap-2 disabled:opacity-50"
              onClick={() => handleExport('csv')} 
              disabled={isProcessing}
            >
              <Database className="w-4 h-4" />
              Export as CSV
            </button>
            <button 
              className="w-full text-left px-2 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center gap-2 disabled:opacity-50"
              onClick={() => handleExport('json')} 
              disabled={isProcessing}
            >
              <FileJson className="w-4 h-4" />
              Export as JSON
            </button>
            
            <div className="border-t border-gray-200 dark:border-gray-600 my-2"></div>
            
            {/* Copy to clipboard */}
            <div className="px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
              Copy to Clipboard
            </div>
            <button 
              className="w-full text-left px-2 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center gap-2 disabled:opacity-50"
              onClick={() => handleCopy('text')} 
              disabled={isProcessing}
            >
              <FileText className="w-4 h-4" />
              Copy as Text
            </button>
            <button 
              className="w-full text-left px-2 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center gap-2 disabled:opacity-50"
              onClick={() => handleCopy('csv')} 
              disabled={isProcessing}
            >
              <Copy className="w-4 h-4" />
              Copy as CSV
            </button>
            <button 
              className="w-full text-left px-2 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center gap-2 disabled:opacity-50"
              onClick={() => handleCopy('json')} 
              disabled={isProcessing}
            >
              <Copy className="w-4 h-4" />
              Copy as JSON
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}