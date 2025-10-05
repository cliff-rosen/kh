import { Suggestion, MultiSelectOption } from './stream-building';

// ============================================================================
// Chat messages (for display)
// ============================================================================

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;

    // AI response elements (only on assistant messages)
    suggestions?: Suggestion[];
    options?: MultiSelectOption[];
    continueButtonText?: string;  // Text for the "Continue" button
    proposedMessage?: string;  // Proposed message for options button
}
