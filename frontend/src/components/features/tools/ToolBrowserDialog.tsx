import { ToolBrowser } from '@/components/features/tools';
import Dialog from '@/components/common/Dialog';
import { ToolDefinition } from '@/types/tool';

interface ToolBrowserDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectTool?: (tool: ToolDefinition) => void;
}

export default function ToolBrowserDialog({ isOpen, onClose, onSelectTool }: ToolBrowserDialogProps) {
    const handleSelectTool = (tool: ToolDefinition | null) => {
        if (tool) {
            console.log('Selected tool:', tool);
            // Don't close the dialog - let users view the tool details
            // If parent component provided onSelectTool, call it but don't close
            onSelectTool?.(tool);
        }
    };

    return (
        <Dialog isOpen={isOpen} onClose={onClose} title="Tool Browser" maxWidth="6xl">
            <div className="w-full h-[90vh] flex flex-col px-4">
                {/* Content - takes up all available space */}
                <div className="flex-1 min-h-0">
                    <ToolBrowser onSelectTool={handleSelectTool} />
                </div>

                {/* Footer with Close button */}
                <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                    <div className="flex justify-end">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </Dialog>
    );
} 