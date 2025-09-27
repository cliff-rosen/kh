import React from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface ChatHeaderProps {
    showStatusMessages: boolean;
    onToggleStatusMessages: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
    showStatusMessages,
    onToggleStatusMessages
}) => {
    return (
        <div className="flex-shrink-0 px-4 py-3 border-b dark:border-gray-700 flex justify-between items-center">
            <h2 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Chat
            </h2>
            <button
                onClick={onToggleStatusMessages}
                className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title={showStatusMessages ? "Hide status messages" : "Show status messages"}
            >
                {showStatusMessages ? (
                    <Eye className="w-4 h-4" />
                ) : (
                    <EyeOff className="w-4 h-4" />
                )}
            </button>
        </div>
    );
}; 