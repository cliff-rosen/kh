import { ChatMessage as ChatMessageType } from './types';
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

interface ChatMessageProps {
  message: ChatMessageType;
  onAddToNotes?: (content: string) => void;
}

export function ChatMessage({ message, onAddToNotes }: ChatMessageProps) {
  return (
    <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div className="flex flex-col items-start max-w-[80%]">
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            message.role === 'user'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
          }`}
        >
          {message.role === 'user' ? (
            // User messages: simple text rendering (they don't typically use markdown)
            <div className="whitespace-pre-wrap">{message.content}</div>
          ) : (
            // Assistant messages: full markdown rendering
            <MarkdownRenderer
              content={message.content}
              compact={true}
              className="text-sm prose-invert"
            />
          )}
          <div className={`text-xs mt-1 opacity-70 ${
            message.role === 'user' ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'
          }`}>
            {message.timestamp.toLocaleTimeString()}
          </div>
        </div>
        
        {/* Add to Notes button for assistant messages */}
        {message.role === 'assistant' && onAddToNotes && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onAddToNotes(message.content)}
            className="mt-1 h-6 px-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <Plus className="w-3 h-3 mr-1" />
            Add to Notes
          </Button>
        )}
      </div>
    </div>
  );
}