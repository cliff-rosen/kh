import { Suggestion, MultiSelectOption } from './stream-building';

// ============================================================================
// Stream Wizard Chat Messages
// ============================================================================

/**
 * Message type for the stream builder wizard chat interface.
 * Different from the main ChatMessage - includes wizard-specific fields.
 */
export interface WizardMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;

    // AI response elements (only on assistant messages)
    suggestions?: Suggestion[];
    options?: MultiSelectOption[];
    continueButtonText?: string;  // Text for the "Continue" button
    proposedMessage?: string;  // Proposed message for options button
}

// Backwards compatibility
/** @deprecated Use WizardMessage instead */
export type ChatMessage = WizardMessage;
