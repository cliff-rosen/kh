import React, { useRef, useEffect } from 'react';
import { Send } from 'lucide-react';

interface ChatInputProps {
    input: string;
    setInput: (value: string) => void;
    onSendMessage: () => void;
    isLoading: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
    input,
    setInput,
    onSendMessage,
    isLoading
}) => {
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSendMessage();
        }
    };

    const handleSendClick = () => {
        onSendMessage();
        // Use setTimeout to ensure focus happens after the DOM updates
        setTimeout(() => {
            inputRef.current?.focus();
        }, 0);
    };

    return (
        <div className="flex-shrink-0 p-4 border-t dark:border-gray-700">
            <div className="flex items-center space-x-2">
                <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Type a message..."
                    className="flex-1 p-2 border dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                    disabled={isLoading}
                />
                <button
                    onClick={handleSendClick}
                    disabled={isLoading || !input.trim()}
                    className="p-2 text-blue-500 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
                >
                    <Send className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
}; 