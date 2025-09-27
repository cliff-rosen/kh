import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  disabled: boolean;
  placeholder?: string;
}

export function ChatInput({ onSendMessage, disabled, placeholder = "Ask about this article..." }: ChatInputProps) {
  const [currentMessage, setCurrentMessage] = useState('');

  const handleSend = () => {
    if (!currentMessage.trim() || disabled) return;
    onSendMessage(currentMessage.trim());
    setCurrentMessage('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex gap-2">
      <Input
        placeholder={placeholder}
        value={currentMessage}
        onChange={(e) => setCurrentMessage(e.target.value)}
        onKeyPress={handleKeyPress}
        disabled={disabled}
        className="flex-1"
      />
      <Button
        onClick={handleSend}
        disabled={!currentMessage.trim() || disabled}
        size="sm"
        className="px-3"
      >
        <Send className="w-4 h-4" />
      </Button>
    </div>
  );
}