import { useState, useEffect, useRef } from 'react';
import { MessageRole } from '@/types/chat';
import { useJamBot } from '@/context/JamBotContext';
import { ChatHeader } from './ChatHeader';
import { ChatMessageItem } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { ChatLoadingIndicator } from './ChatLoadingIndicator';

export default function Chat() {
    const { state, sendMessage, createMessage } = useJamBot();
    const { currentMessages, currentStreamingMessage, isProcessing } = state;

    const [input, setInput] = useState('');
    const [showStatusMessages, setShowStatusMessages] = useState(true);
    const [userScrolled, setUserScrolled] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const previousMessageCount = useRef(currentMessages.length);

    // Filter messages based on showStatusMessages state
    const filteredMessages = showStatusMessages
        ? currentMessages
        : currentMessages.filter(message => message.role !== MessageRole.STATUS);

    const scrollToBottom = (behavior: 'auto' | 'smooth' = 'auto') => {
        messagesEndRef.current?.scrollIntoView({ behavior });
    };

    const checkIfUserScrolled = () => {
        if (!messagesContainerRef.current) return;
        
        const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 10; // 10px threshold
        setUserScrolled(!isAtBottom);
    };

    // Only auto-scroll when new messages are added and user hasn't manually scrolled
    useEffect(() => {
        const messageCountChanged = currentMessages.length !== previousMessageCount.current;
        
        if (messageCountChanged && !userScrolled) {
            // Use instant scroll for new messages to avoid jarring animation
            scrollToBottom('auto');
        }
        
        previousMessageCount.current = currentMessages.length;
    }, [currentMessages, userScrolled]);

    // Handle streaming message updates with smooth scroll only for new streaming content
    useEffect(() => {
        if (currentStreamingMessage && !userScrolled) {
            scrollToBottom('smooth');
        }
    }, [currentStreamingMessage, userScrolled]);

    const handleSendMessage = async () => {
        if (!input.trim() || isProcessing) return;
        setInput('');

        const userMessage = createMessage(input, MessageRole.USER);

        await sendMessage(userMessage);
    };

    return (
        <div className="h-full flex flex-col bg-white dark:bg-gray-800 shadow-sm">
            <ChatHeader
                showStatusMessages={showStatusMessages}
                onToggleStatusMessages={() => setShowStatusMessages(!showStatusMessages)}
            />

            {/* Messages Area */}
            <div 
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto p-4 space-y-4"
                onScroll={checkIfUserScrolled}
            >
                {filteredMessages.map((message) => (
                    <ChatMessageItem
                        key={message.id}
                        message={message}
                        onCollabClick={() => { }}
                    />
                ))}

                {isProcessing && <ChatLoadingIndicator />}
                <div ref={messagesEndRef} />
            </div>

            <ChatInput
                input={input}
                setInput={setInput}
                onSendMessage={handleSendMessage}
                isLoading={isProcessing}
            />
        </div>
    );
} 