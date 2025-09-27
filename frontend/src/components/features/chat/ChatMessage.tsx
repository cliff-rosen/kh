import React from 'react';
import type { ChatMessage } from '@/types/chat';
import { MessageRole } from '@/types/chat';
import { MarkdownRenderer } from '../../common/MarkdownRenderer';

interface ChatMessageItemProps {
    message: ChatMessage;
    onCollabClick: (messageId: string) => void;
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({
    message
}) => {
    const getMessageStyles = () => {
        switch (message.role) {
            case MessageRole.USER:
                return 'p-3 bg-blue-500 text-white';
            case MessageRole.SYSTEM:
                return 'p-3 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-500';
            case MessageRole.STATUS:
                return 'px-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-300 border border-gray-100 dark:border-gray-700/50';
            default:
                return 'p-3 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200';
        }
    };

    const getMessageAlignment = () => {
        return message.role === MessageRole.USER ? 'justify-end' : 'justify-start';
    };

    return (
        <div className={`flex ${getMessageAlignment()}`}>
            <div className={`max-w-[80%] rounded-lg ${getMessageStyles()}`}>
                <MarkdownRenderer
                    content={message.content}
                    compact={message.role === MessageRole.STATUS}
                    className={message.role === MessageRole.STATUS ? '' : 'prose-sm'}
                />
                <div className="flex items-center justify-between mt-1">
                    {message.message_metadata?.type && (
                        <div className="text-xs opacity-75">
                            {message.message_metadata.type}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}; 