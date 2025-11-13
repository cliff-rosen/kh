# Modular Chat Architecture Specification

**Status**: Proposed
**Author**: System Design
**Date**: 2025-01-15
**Version**: 1.0

## Table of Contents

1. [Overview](#overview)
2. [Problem Statement](#problem-statement)
3. [Design Goals](#design-goals)
4. [Architecture](#architecture)
5. [Frontend Design](#frontend-design)
6. [Backend Design](#backend-design)
7. [Implementation Guide](#implementation-guide)
8. [Example: Adding a New Page](#example-adding-a-new-page)
9. [Migration Path](#migration-path)
10. [Trade-offs and Considerations](#trade-offs-and-considerations)

---

## Overview

This specification proposes a modular, registry-based architecture for the general-purpose chat system that allows pages to declaratively define their chat behaviors, context requirements, and payload handlers without modifying core chat components.

### Key Concepts

- **Page Registration**: Pages register their chat capabilities with a central registry
- **Prompt Builders**: Backend uses page-specific prompt builders selected by page ID
- **Payload Handlers**: Pages define how to render and handle different payload types
- **Context Builders**: Pages define what context to send to the backend

---

## Problem Statement

### Current Issues

1. **Tight Coupling**
   - `EditStreamPage` hardcodes `onSchemaProposalAccepted` handler
   - `ChatTray` has page-specific logic for schema proposals
   - New pages require modifying core chat components

2. **Scattered Page Detection**
   - Backend checks for `current_page === "edit_research_stream"` inline
   - No central registry of supported pages
   - Difficult to discover what pages have chat support

3. **Manual Payload Wiring**
   - Each new payload type requires:
     - Adding parsing logic to `_parse_llm_response`
     - Adding rendering logic to `ChatTray`
     - Adding handler logic to each page
   - No type registry or abstraction

4. **Prompt Logic Embedded**
   - System prompts built inline in `_build_system_prompt`
   - Difficult to test or modify page-specific prompts
   - No separation between generic and page-specific logic

### Impact

- Adding chat support to a new page requires changes in 3+ files
- High risk of breaking existing pages when adding new features
- Difficult to test chat behaviors in isolation
- Poor developer experience for extending chat functionality

---

## Design Goals

1. **Modularity**: Each page's chat behavior is self-contained
2. **Declarative**: Pages declare what they need, not how to get it
3. **Extensibility**: Adding new pages/payloads requires minimal changes
4. **Type Safety**: TypeScript ensures correct handler signatures
5. **Testability**: Components can be tested independently
6. **Discoverability**: Easy to see what pages have chat support
7. **Maintainability**: Changes to one page don't affect others

---

## Architecture

### High-Level Flow

```
┌──────────────────────────────────────────────────────────────┐
│                         Frontend                              │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Page Component (EditStreamPage)                             │
│         │                                                     │
│         ├──→ Import chat config (registers automatically)    │
│         │                                                     │
│         └──→ useChatPage(pageId, pageState)                  │
│                   │                                           │
│                   ├──→ ChatPageRegistry.getConfig()          │
│                   │                                           │
│                   ├──→ buildContext(pageState)               │
│                   │                                           │
│                   └──→ returns { context, handlePayload }    │
│                                                               │
│  ChatTray (Generic)                                          │
│         │                                                     │
│         ├──→ Receives context, onPayload                     │
│         │                                                     │
│         └──→ onPayload(type, data)                           │
│                   │                                           │
│                   └──→ Returns { render, onAccept, onReject }│
│                                                               │
│  PayloadRenderer (Generic)                                   │
│         │                                                     │
│         └──→ Renders payload using handler.render()          │
│                                                               │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                         Backend                               │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  GeneralChatService                                          │
│         │                                                     │
│         ├──→ _build_system_prompt(context)                   │
│         │         │                                           │
│         │         └──→ PromptBuilderRegistry.get_builder()   │
│         │                   │                                 │
│         │                   └──→ EditStreamPromptBuilder     │
│         │                         or GenericPromptBuilder    │
│         │                                                     │
│         └──→ _parse_llm_response(response_text)              │
│                   │                                           │
│                   └──→ PayloadParserRegistry.parse_all()     │
│                         │                                     │
│                         └──→ SchemaProposalParser            │
│                               ReportInsightsParser           │
│                               etc.                            │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### Key Components

#### Frontend

1. **ChatPageRegistry**: Central registry of page configurations
2. **ChatPageConfig**: Interface defining page's chat capabilities
3. **useChatPage**: Hook that integrates page with chat system
4. **PayloadHandler**: Interface for rendering and handling payloads
5. **ChatTray**: Generic, reusable chat component

#### Backend

1. **PromptBuilderRegistry**: Registry of page-specific prompt builders
2. **PromptBuilder**: Abstract base class for building prompts
3. **PayloadParserRegistry**: Registry of payload type parsers
4. **PayloadParser**: Abstract base class for parsing payloads
5. **GeneralChatService**: Coordinator using registries

---

## Frontend Design

### 1. Type Definitions

```typescript
// frontend/src/lib/chat/types.ts

export interface ChatPageConfig {
  /** Unique identifier for this page (e.g., 'edit_research_stream') */
  pageId: string;

  /** Build context object to send to backend */
  buildContext: (pageState: any) => Record<string, any>;

  /** Handlers for different payload types this page supports */
  payloadHandlers: Record<string, PayloadHandler>;

  /** Optional: Custom styling or behavior overrides */
  options?: ChatPageOptions;
}

export interface PayloadHandler {
  /** Render the payload component */
  render: (payload: any, callbacks: PayloadCallbacks) => React.ReactNode;

  /** Handle user accepting the payload */
  onAccept?: (payload: any, pageState: any) => void;

  /** Handle user rejecting the payload */
  onReject?: (payload: any) => void;

  /** Optional: Custom panel width, position, etc. */
  renderOptions?: RenderOptions;
}

export interface PayloadCallbacks {
  onAccept: () => void;
  onReject: () => void;
}

export interface ChatPageOptions {
  /** Whether to show chat button */
  showChatButton?: boolean;

  /** Custom chat button position */
  chatButtonPosition?: 'bottom-left' | 'bottom-right';
}

export interface RenderOptions {
  /** Panel width (default: 500px) */
  panelWidth?: string;

  /** Panel position relative to chat tray */
  panelPosition?: 'right' | 'left';

  /** Whether to show panel header */
  showHeader?: boolean;
}
```

### 2. Chat Page Registry

```typescript
// frontend/src/lib/chat/chatPageRegistry.ts

import { ChatPageConfig } from './types';

class ChatPageRegistry {
  private configs: Map<string, ChatPageConfig> = new Map();

  /**
   * Register a page's chat configuration.
   * Typically called when importing a page's chat config.
   */
  register(config: ChatPageConfig): void {
    if (this.configs.has(config.pageId)) {
      console.warn(`Chat config for page '${config.pageId}' already registered. Overwriting.`);
    }
    this.configs.set(config.pageId, config);
  }

  /**
   * Get a page's chat configuration by page ID.
   */
  getConfig(pageId: string): ChatPageConfig | undefined {
    return this.configs.get(pageId);
  }

  /**
   * Check if a page has chat support.
   */
  hasConfig(pageId: string): boolean {
    return this.configs.has(pageId);
  }

  /**
   * Get all registered page IDs.
   */
  getRegisteredPages(): string[] {
    return Array.from(this.configs.keys());
  }

  /**
   * Clear all registrations (useful for testing).
   */
  clear(): void {
    this.configs.clear();
  }
}

export const chatPageRegistry = new ChatPageRegistry();
```

### 3. useChatPage Hook

```typescript
// frontend/src/hooks/useChatPage.ts

import { useMemo, useCallback } from 'react';
import { chatPageRegistry } from '../lib/chat/chatPageRegistry';
import { PayloadCallbacks } from '../lib/chat/types';

export interface UseChatPageResult {
  /** Context to send to backend */
  context: Record<string, any>;

  /** Handle a payload from the backend */
  handlePayload: (payloadType: string, payload: any) => PayloadHandlerResult | null;

  /** List of payload types this page supports */
  supportedPayloadTypes: string[];
}

export interface PayloadHandlerResult {
  render: (callbacks: PayloadCallbacks) => React.ReactNode;
  onAccept: () => void;
  onReject: () => void;
  renderOptions?: any;
}

/**
 * Hook to integrate a page with the chat system.
 *
 * @param pageId - Unique identifier for this page
 * @param pageState - Current page state (form data, selections, etc.)
 * @returns Context and payload handler for ChatTray
 *
 * @example
 * ```tsx
 * const { context, handlePayload } = useChatPage('edit_research_stream', {
 *   form,
 *   setForm,
 *   stream
 * });
 *
 * return (
 *   <>
 *     <ChatTray context={context} onPayload={handlePayload} />
 *   </>
 * );
 * ```
 */
export function useChatPage(pageId: string, pageState: any): UseChatPageResult {
  const config = chatPageRegistry.getConfig(pageId);

  if (!config) {
    throw new Error(
      `No chat config registered for page: ${pageId}. ` +
      `Make sure to import the page's chat config file.`
    );
  }

  // Build context for backend (recompute when pageState changes)
  const context = useMemo(
    () => config.buildContext(pageState),
    [config, pageState]
  );

  // Create payload handler
  const handlePayload = useCallback(
    (payloadType: string, payload: any): PayloadHandlerResult | null => {
      const handler = config.payloadHandlers[payloadType];

      if (!handler) {
        console.warn(
          `No handler registered for payload type '${payloadType}' on page '${pageId}'`
        );
        return null;
      }

      return {
        render: (callbacks: PayloadCallbacks) => handler.render(payload, callbacks),
        onAccept: () => handler.onAccept?.(payload, pageState),
        onReject: () => handler.onReject?.(payload),
        renderOptions: handler.renderOptions
      };
    },
    [config, pageId, pageState]
  );

  return {
    context,
    handlePayload,
    supportedPayloadTypes: Object.keys(config.payloadHandlers)
  };
}
```

### 4. Page Chat Config Example

```typescript
// frontend/src/pages/EditStreamPage.chatConfig.ts

import { ChatPageConfig } from '../lib/chat/types';
import { chatPageRegistry } from '../lib/chat/chatPageRegistry';
import SchemaProposalCard from '../components/SchemaProposalCard';

export const editStreamPageChatConfig: ChatPageConfig = {
  pageId: 'edit_research_stream',

  buildContext: (pageState) => {
    const { form, stream } = pageState;

    return {
      current_page: 'edit_research_stream',
      entity_type: 'research_stream',
      entity_id: stream?.stream_id,
      stream_name: stream?.stream_name,
      current_schema: {
        stream_name: form.stream_name,
        purpose: stream?.purpose || '',
        semantic_space: form.semantic_space
      }
    };
  },

  payloadHandlers: {
    'schema_proposal': {
      render: (payload, callbacks) => (
        <SchemaProposalCard
          proposal={payload}
          onAccept={callbacks.onAccept}
          onReject={callbacks.onReject}
        />
      ),

      onAccept: (payload, pageState) => {
        const { setForm, form } = pageState;
        const updatedForm = { ...form };

        // Apply proposed changes
        Object.entries(payload.proposed_changes).forEach(([key, value]) => {
          if (key === 'stream_name') {
            updatedForm.stream_name = value as string;
          } else if (key.startsWith('semantic_space.')) {
            const path = key.replace('semantic_space.', '').split('.');
            let target: any = updatedForm.semantic_space;

            for (let i = 0; i < path.length - 1; i++) {
              if (!target[path[i]]) {
                target[path[i]] = {};
              }
              target = target[path[i]];
            }

            target[path[path.length - 1]] = value;
          }
        });

        setForm(updatedForm);
        alert('Schema changes have been applied to the form. Click "Save Changes" to persist them.');
      },

      onReject: (payload) => {
        console.log('Schema proposal rejected:', payload);
      },

      renderOptions: {
        panelWidth: '500px',
        panelPosition: 'right',
        showHeader: true
      }
    }
  }
};

// Auto-register when this module is imported
chatPageRegistry.register(editStreamPageChatConfig);
```

### 5. Updated ChatTray Component

```typescript
// frontend/src/components/ChatTray.tsx

import { useState, useRef, useEffect } from 'react';
import { XMarkIcon, ChatBubbleLeftRightIcon, PaperAirplaneIcon } from '@heroicons/react/24/solid';
import { useGeneralChat } from '../hooks/useGeneralChat';
import { InteractionType } from '../types/chat';
import { PayloadHandlerResult } from '../hooks/useChatPage';

interface ChatTrayProps {
  /** Context to send to backend */
  context: Record<string, any>;

  /** Handler for processing payloads from backend */
  onPayload: (type: string, data: any) => PayloadHandlerResult | null;
}

export default function ChatTray({ context, onPayload }: ChatTrayProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { messages, sendMessage, isLoading, streamingText } = useGeneralChat(context);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [activePayload, setActivePayload] = useState<{
    handler: PayloadHandlerResult;
    data: any;
  } | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText]);

  // Detect new payloads and activate handler
  useEffect(() => {
    const latestMessage = messages[messages.length - 1];
    if (latestMessage?.payload) {
      const handler = onPayload(latestMessage.payload.type, latestMessage.payload.data);
      if (handler) {
        setActivePayload({ handler, data: latestMessage.payload.data });
      }
    }
  }, [messages, onPayload]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      sendMessage(input.trim(), InteractionType.TEXT_INPUT);
      setInput('');
    }
  };

  const handleValueSelect = (value: string) => {
    sendMessage(value, InteractionType.VALUE_SELECTED);
  };

  const handleActionClick = async (action: any) => {
    if (action.handler === 'client') {
      console.log('Client action:', action);
      if (action.action === 'close') {
        setIsOpen(false);
      }
    } else {
      await sendMessage(
        action.label,
        InteractionType.ACTION_EXECUTED,
        {
          action_identifier: action.action,
          action_data: action.data
        }
      );
    }
  };

  return (
    <>
      {/* Toggle Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 left-6 z-50 p-4 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-all hover:scale-110"
          aria-label="Open chat"
        >
          <ChatBubbleLeftRightIcon className="h-6 w-6" />
        </button>
      )}

      {/* Chat Tray */}
      <div
        className={`fixed top-0 left-0 h-full w-96 bg-white dark:bg-gray-900 shadow-2xl transform transition-transform duration-300 ease-in-out z-50 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <div className="flex items-center gap-2">
              <ChatBubbleLeftRightIcon className="h-5 w-5 text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Chat Assistant
              </h3>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
              aria-label="Close chat"
            >
              <XMarkIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-900">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 dark:text-gray-400 mt-8">
                <ChatBubbleLeftRightIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Ask me anything about the application</p>
              </div>
            )}

            {messages.map((message, idx) => (
              <div key={idx}>
                <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-lg px-4 py-2 ${
                      message.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow'
                    }`}
                  >
                    <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                    <p className="text-xs opacity-70 mt-1">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>

                {/* Suggested Values */}
                {message.suggested_values && message.suggested_values.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3 ml-2">
                    {message.suggested_values.map((suggestion, sIdx) => (
                      <button
                        key={sIdx}
                        onClick={() => handleValueSelect(suggestion.value)}
                        disabled={isLoading}
                        className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full text-sm hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {suggestion.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Suggested Actions */}
                {message.suggested_actions && message.suggested_actions.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3 ml-2">
                    {message.suggested_actions.map((action, aIdx) => (
                      <button
                        key={aIdx}
                        onClick={() => handleActionClick(action)}
                        disabled={isLoading}
                        className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          action.style === 'primary'
                            ? 'bg-green-600 hover:bg-green-700 text-white'
                            : action.style === 'warning'
                            ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                            : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white'
                        }`}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Payload Indicator (generic) */}
                {message.payload && (
                  <div className="mt-3 ml-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <p className="text-sm text-blue-800 dark:text-blue-200 flex items-center gap-2">
                      <span className="font-medium">📋 {message.payload.type} ready</span>
                      <span className="text-xs opacity-75">(see panel to the right)</span>
                    </p>
                  </div>
                )}
              </div>
            ))}

            {/* Streaming message */}
            {streamingText && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-lg px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow">
                  <div className="text-sm whitespace-pre-wrap">{streamingText}</div>
                  <div className="flex items-center gap-1 mt-1">
                    <div className="animate-pulse flex gap-1">
                      <div className="w-1 h-1 bg-blue-600 rounded-full"></div>
                      <div className="w-1 h-1 bg-blue-600 rounded-full"></div>
                      <div className="w-1 h-1 bg-blue-600 rounded-full"></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {isLoading && !streamingText && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-gray-800 rounded-lg px-4 py-2 shadow">
                  <div className="flex items-center gap-2">
                    <div className="animate-pulse flex gap-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                    </div>
                    <span className="text-sm text-gray-600 dark:text-gray-400">Thinking...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your message..."
                disabled={isLoading}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <PaperAirplaneIcon className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Overlay when open */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-25 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Generic Floating Payload Panel */}
      {activePayload && (
        <div
          className="fixed top-0 left-96 h-full bg-white dark:bg-gray-800 shadow-2xl z-50 border-l border-gray-200 dark:border-gray-700"
          style={{ width: activePayload.handler.renderOptions?.panelWidth || '500px' }}
        >
          <div className="flex flex-col h-full">
            {/* Header (if enabled) */}
            {activePayload.handler.renderOptions?.showHeader !== false && (
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/20">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <span>📋</span>
                  Proposal
                </h3>
                <button
                  onClick={() => setActivePayload(null)}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                  aria-label="Close proposal"
                >
                  <XMarkIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                </button>
              </div>
            )}

            {/* Scrollable Payload Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {activePayload.handler.render({
                onAccept: () => {
                  activePayload.handler.onAccept();
                  setActivePayload(null);
                },
                onReject: () => {
                  activePayload.handler.onReject();
                  setActivePayload(null);
                }
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

### 6. Updated Page Component

```typescript
// frontend/src/pages/EditStreamPage.tsx

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useResearchStream } from '../context/ResearchStreamContext';
import { useChatPage } from '../hooks/useChatPage';
import ChatTray from '../components/ChatTray';

// Import chat config to auto-register
import './EditStreamPage.chatConfig';

export default function EditStreamPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { researchStreams, loadResearchStreams, updateResearchStream } = useResearchStream();

  const [stream, setStream] = useState<any>(null);
  const [form, setForm] = useState({
    stream_name: '',
    // ... other fields
  });

  // Load stream data
  useEffect(() => {
    loadResearchStreams();
  }, [loadResearchStreams]);

  useEffect(() => {
    if (id && researchStreams.length > 0) {
      const foundStream = researchStreams.find(s => s.stream_id === Number(id));
      if (foundStream) {
        setStream(foundStream);
        setForm({ /* ... */ });
      }
    }
  }, [id, researchStreams]);

  // Get chat integration (declarative!)
  const { context, handlePayload } = useChatPage('edit_research_stream', {
    form,
    setForm,
    stream
  });

  const handleSubmit = async (e: React.FormEvent) => {
    // ... submit logic
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col max-w-7xl mx-auto">
      {/* Page content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {/* Form, tabs, etc. */}
      </div>

      {/* Chat Tray - simple integration! */}
      <ChatTray context={context} onPayload={handlePayload} />
    </div>
  );
}
```

---

## Backend Design

### 1. Prompt Builder Interface

```python
# backend/services/chat/prompt_builder.py

from abc import ABC, abstractmethod
from typing import Dict, Any

class PromptBuilder(ABC):
    """Abstract base class for page-specific prompt builders."""

    @abstractmethod
    def can_handle(self, page_id: str) -> bool:
        """
        Check if this builder can handle the given page.

        Args:
            page_id: The page identifier from context

        Returns:
            True if this builder should be used for this page
        """
        pass

    @abstractmethod
    def build_system_prompt(self, context: Dict[str, Any]) -> str:
        """
        Build the system prompt for this page.

        Args:
            context: The context object from the frontend

        Returns:
            The system prompt string
        """
        pass

    @abstractmethod
    def get_supported_payloads(self) -> list[str]:
        """
        Return list of payload types this builder supports.

        Returns:
            List of payload type identifiers (e.g., ['schema_proposal'])
        """
        pass

    def get_page_description(self) -> str:
        """
        Optional: Return a human-readable description of this page's chat capabilities.
        Useful for documentation and debugging.
        """
        return "No description provided"
```

### 2. Prompt Builder Registry

```python
# backend/services/chat/prompt_builder_registry.py

from typing import Optional, List
from .prompt_builder import PromptBuilder
import logging

logger = logging.getLogger(__name__)

class PromptBuilderRegistry:
    """Central registry for page-specific prompt builders."""

    def __init__(self):
        self.builders: List[PromptBuilder] = []

    def register(self, builder: PromptBuilder) -> None:
        """
        Register a prompt builder.

        Args:
            builder: The prompt builder to register
        """
        self.builders.append(builder)
        logger.info(
            f"Registered prompt builder: {builder.__class__.__name__} "
            f"(supports: {', '.join(builder.get_supported_payloads())})"
        )

    def get_builder(self, page_id: str) -> Optional[PromptBuilder]:
        """
        Get the appropriate builder for a page.

        Args:
            page_id: The page identifier

        Returns:
            The matching prompt builder, or None if no match found
        """
        for builder in self.builders:
            if builder.can_handle(page_id):
                logger.debug(f"Selected builder {builder.__class__.__name__} for page '{page_id}'")
                return builder

        logger.debug(f"No specific builder found for page '{page_id}', will use generic prompt")
        return None

    def list_registered_pages(self) -> List[str]:
        """
        Get list of all page IDs that have registered builders.
        Useful for documentation and debugging.
        """
        pages = set()
        for builder in self.builders:
            # This is a simplification - builders would need to expose their page IDs
            pages.add(builder.get_page_description())
        return list(pages)

# Global singleton instance
prompt_builder_registry = PromptBuilderRegistry()
```

### 3. Example Prompt Builder

```python
# backend/services/chat/builders/edit_research_stream_builder.py

from ..prompt_builder import PromptBuilder
from typing import Dict, Any

class EditResearchStreamPromptBuilder(PromptBuilder):
    """Prompt builder for the edit research stream page."""

    def can_handle(self, page_id: str) -> bool:
        return page_id == "edit_research_stream"

    def build_system_prompt(self, context: Dict[str, Any]) -> str:
        current_schema = context.get("current_schema", {})

        # Extract current values
        stream_name = current_schema.get("stream_name", "Not set")
        purpose = current_schema.get("purpose", "Not set")
        semantic_space = current_schema.get("semantic_space", {})
        domain = semantic_space.get("domain", {})
        domain_name = domain.get("name", "Not set")
        domain_description = domain.get("description", "Not set")

        topics = semantic_space.get("topics", [])
        topics_summary = f"{len(topics)} topics defined" if topics else "No topics defined yet"

        return f"""You are a helpful AI assistant for Knowledge Horizon, helping the user configure a research stream.

The user is editing a research stream. Current values:
- Stream Name: {stream_name}
- Purpose: {purpose}
- Domain Name: {domain_name}
- Domain Description: {domain_description}
- Topics: {topics_summary}

RESEARCH STREAM SCHEMA FIELDS:

1. stream_name: Short, clear name for the research stream (e.g., "Alzheimer's Clinical Trials")

2. purpose: High-level explanation of why this stream exists (e.g., "Track emerging treatments for competitive intelligence")

3. semantic_space.domain.name: The domain this research covers (e.g., "Neurodegenerative Disease Research")

4. semantic_space.domain.description: Detailed description of what the domain encompasses

5. semantic_space.topics: Array of topics to track, each with:
   - topic_id: Unique identifier (snake_case, e.g., "phase_3_trials")
   - name: Display name (e.g., "Phase 3 Clinical Trials")
   - description: What this topic covers
   - importance: "critical" | "important" | "relevant"
   - rationale: Why this topic matters

6. semantic_space.context.business_context: Business context (e.g., "Defense litigation support", "Competitive intelligence")

7. semantic_space.context.decision_types: What decisions this informs (array of strings)

8. semantic_space.context.stakeholders: Who uses this information (array of strings)

YOUR ROLE:
- Answer questions about these fields and help the user understand what to enter
- When the user describes what they want to track, ask clarifying questions to gather complete information
- When the user explicitly requests recommendations or proposals, AND you have enough context from the conversation, propose concrete values using the format below
- Use the conversation history to understand what the user wants

RESPONSE FORMAT:

Always start with a conversational message:
MESSAGE: [Your response to the user]

Optional elements:
SUGGESTED_VALUES: [Comma-separated quick reply options]
SUGGESTED_ACTIONS: [Actions in format: label|action|handler|style]

When proposing schema values (ONLY when user asks for it and you have enough info):
SCHEMA_PROPOSAL: {{
  "proposed_changes": {{
    "stream_name": "value",
    "purpose": "value",
    "semantic_space.domain.name": "value",
    "semantic_space.domain.description": "value",
    "semantic_space.context.business_context": "value",
    "semantic_space.topics": [
      {{
        "topic_id": "unique_id",
        "name": "Display Name",
        "description": "What this covers",
        "importance": "critical",
        "rationale": "Why this matters"
      }}
    ]
  }},
  "confidence": "high",
  "reasoning": "Based on our conversation, you mentioned X, Y, and Z, so I'm suggesting..."
}}

IMPORTANT:
- Only propose SCHEMA_PROPOSAL when the user has asked for recommendations/proposals
- If you don't have enough information, ask clarifying questions instead
- You can propose some or all fields - only propose what you're confident about
- Use conversation history to inform your proposals
- Be helpful and conversational
"""

    def get_supported_payloads(self) -> list[str]:
        return ["schema_proposal"]

    def get_page_description(self) -> str:
        return "Edit Research Stream - Schema-aware assistant for configuring research streams"
```

### 4. Payload Parser Interface

```python
# backend/services/chat/payload_parser.py

from abc import ABC, abstractmethod
from typing import Optional, Dict, Any

class PayloadParser(ABC):
    """Abstract base class for payload parsers."""

    @abstractmethod
    def get_marker(self) -> str:
        """
        Return the marker string that identifies this payload type.

        Returns:
            The marker string (e.g., 'SCHEMA_PROPOSAL:')
        """
        pass

    @abstractmethod
    def parse(self, response_text: str) -> Optional[Dict[str, Any]]:
        """
        Parse the payload from the LLM response.

        Args:
            response_text: The full LLM response text

        Returns:
            Parsed payload dict with 'type' and 'data' keys, or None if parsing fails
        """
        pass

    def validate(self, payload: Dict[str, Any]) -> bool:
        """
        Optional: Validate the parsed payload.

        Args:
            payload: The parsed payload

        Returns:
            True if valid, False otherwise
        """
        return True
```

### 5. Payload Parser Registry

```python
# backend/services/chat/payload_parser_registry.py

from typing import Optional, Dict, Any, List
from .payload_parser import PayloadParser
import logging

logger = logging.getLogger(__name__)

class PayloadParserRegistry:
    """Central registry for payload parsers."""

    def __init__(self):
        self.parsers: Dict[str, PayloadParser] = {}

    def register(self, parser: PayloadParser) -> None:
        """
        Register a payload parser.

        Args:
            parser: The payload parser to register
        """
        marker = parser.get_marker()
        if marker in self.parsers:
            logger.warning(f"Parser for marker '{marker}' already registered. Overwriting.")

        self.parsers[marker] = parser
        logger.info(f"Registered payload parser: {parser.__class__.__name__} (marker: {marker})")

    def parse_all(self, response_text: str) -> Optional[Dict[str, Any]]:
        """
        Try all registered parsers to extract a payload.
        Returns the first successful parse.

        Args:
            response_text: The LLM response text

        Returns:
            Parsed payload or None
        """
        for marker, parser in self.parsers.items():
            if marker in response_text:
                logger.debug(f"Found marker '{marker}', attempting parse with {parser.__class__.__name__}")
                try:
                    payload = parser.parse(response_text)
                    if payload and parser.validate(payload):
                        return payload
                except Exception as e:
                    logger.error(f"Error parsing payload with {parser.__class__.__name__}: {e}")

        return None

    def get_supported_markers(self) -> List[str]:
        """Get list of all registered markers."""
        return list(self.parsers.keys())

# Global singleton instance
payload_parser_registry = PayloadParserRegistry()
```

### 6. Example Payload Parser

```python
# backend/services/chat/parsers/schema_proposal_parser.py

from ..payload_parser import PayloadParser
from typing import Optional, Dict, Any
import json
import logging

logger = logging.getLogger(__name__)

class SchemaProposalParser(PayloadParser):
    """Parser for SCHEMA_PROPOSAL payloads."""

    def get_marker(self) -> str:
        return "SCHEMA_PROPOSAL:"

    def parse(self, response_text: str) -> Optional[Dict[str, Any]]:
        """
        Parse SCHEMA_PROPOSAL JSON from response.
        Uses brace counting to extract complete JSON object.
        """
        lines = response_text.split('\n')
        proposal_lines = []
        in_proposal = False
        brace_count = 0

        for line in lines:
            stripped = line.strip()

            if stripped.startswith("SCHEMA_PROPOSAL:"):
                in_proposal = True
                brace_count = 0
                # Get content after marker
                content = stripped.replace("SCHEMA_PROPOSAL:", "").strip()
                if content:
                    proposal_lines.append(content)
                    brace_count += content.count('{') - content.count('}')

            elif in_proposal:
                # Stop if we hit another marker
                if any(stripped.startswith(m) for m in ["MESSAGE:", "SUGGESTED_VALUES:", "SUGGESTED_ACTIONS:"]):
                    break

                proposal_lines.append(line.rstrip())
                brace_count += line.count('{') - line.count('}')

                # If braces balanced, we're done
                if brace_count == 0 and len(proposal_lines) > 0:
                    break

        if not proposal_lines:
            return None

        try:
            json_str = "\n".join(proposal_lines).strip()
            data = json.loads(json_str)

            return {
                "type": "schema_proposal",
                "data": data
            }
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse SCHEMA_PROPOSAL JSON: {e}")
            return None

    def validate(self, payload: Dict[str, Any]) -> bool:
        """Validate that required fields are present."""
        if not payload.get("data"):
            return False

        data = payload["data"]

        # Check for required top-level fields
        if "proposed_changes" not in data:
            logger.warning("SCHEMA_PROPOSAL missing 'proposed_changes' field")
            return False

        if "reasoning" not in data:
            logger.warning("SCHEMA_PROPOSAL missing 'reasoning' field")
            return False

        return True
```

### 7. Updated Chat Service

```python
# backend/services/general_chat_service.py

from typing import Dict, Any, AsyncGenerator
from sqlalchemy.orm import Session
import anthropic
import os
import logging

from schemas.general_chat import (
    ChatRequest, ChatResponse, ChatPayload,
    ChatAgentResponse, ChatStatusResponse
)
from services.chat.prompt_builder_registry import prompt_builder_registry
from services.chat.payload_parser_registry import payload_parser_registry

logger = logging.getLogger(__name__)

CHAT_MODEL = "claude-sonnet-4-20250514"
CHAT_MAX_TOKENS = 2000


class GeneralChatService:
    def __init__(self, db: Session, user_id: int):
        self.db = db
        self.user_id = user_id
        self.client = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))
        self.prompt_registry = prompt_builder_registry
        self.payload_registry = payload_parser_registry

    async def stream_chat_message(self, request: ChatRequest) -> AsyncGenerator[str, None]:
        """
        Stream a chat message response with status updates via SSE.
        """
        try:
            # Build system prompt using registry
            system_prompt = self._build_system_prompt(request.context)

            # Build user prompt
            user_prompt = self._build_user_prompt(
                request.message,
                request.context,
                request.interaction_type
            )

            # Build message history
            messages = [
                {"role": msg.role, "content": msg.content}
                for msg in request.conversation_history
            ]
            messages.append({"role": "user", "content": user_prompt})

            # Send status update
            status_response = ChatStatusResponse(
                status="Thinking...",
                payload={"context": request.context.get("current_page", "unknown")},
                error=None,
                debug=None
            )
            yield status_response.model_dump_json()

            # Call Claude API with streaming
            collected_text = ""

            stream = self.client.messages.stream(
                model=CHAT_MODEL,
                max_tokens=CHAT_MAX_TOKENS,
                temperature=0.0,
                system=system_prompt,
                messages=messages
            )

            with stream as stream_manager:
                for text in stream_manager.text_stream:
                    collected_text += text
                    token_response = ChatAgentResponse(
                        token=text,
                        response_text=None,
                        payload=None,
                        status="streaming",
                        error=None,
                        debug=None
                    )
                    yield token_response.model_dump_json()

            # Parse the LLM response using registry
            parsed = self._parse_llm_response(collected_text)

            # Build final payload
            final_payload = ChatPayload(
                message=parsed["message"],
                suggested_values=parsed.get("suggested_values"),
                suggested_actions=parsed.get("suggested_actions"),
                payload=parsed.get("payload")
            )

            # Send final response
            final_response = ChatAgentResponse(
                token=None,
                response_text=None,
                payload=final_payload,
                status="complete",
                error=None,
                debug=None
            )
            yield final_response.model_dump_json()

        except Exception as e:
            logger.error(f"Error in chat service: {str(e)}", exc_info=True)
            error_response = ChatAgentResponse(
                token=None,
                response_text=None,
                payload=None,
                status=None,
                error=f"Service error: {str(e)}",
                debug={"error_type": type(e).__name__}
            )
            yield error_response.model_dump_json()

    def _build_system_prompt(self, context: Dict[str, Any]) -> str:
        """Build system prompt using registry."""
        page_id = context.get("current_page", "unknown")

        # Try to get page-specific builder
        builder = self.prompt_registry.get_builder(page_id)
        if builder:
            return builder.build_system_prompt(context)

        # Fall back to generic prompt
        return self._build_generic_prompt(context)

    def _build_generic_prompt(self, context: Dict[str, Any]) -> str:
        """Build generic conversational prompt."""
        current_page = context.get("current_page", "unknown")

        return f"""You are a helpful AI assistant for Knowledge Horizon,
        a biomedical research intelligence platform.

        The user is currently on: {current_page}

        Your responses should be structured in this format:

        MESSAGE: [Your conversational response to the user]
        SUGGESTED_VALUES: [Optional comma-separated values user can select]
        SUGGESTED_ACTIONS: [Optional actions with format: label|action|handler|style]

        SUGGESTED_VALUES are clickable chips that send a message back to continue conversation.
        Example: SUGGESTED_VALUES: Yes, No, Tell me more

        SUGGESTED_ACTIONS are buttons that execute actions (client or server).
        Format: label|action|handler|style (separated by semicolons for multiple actions)
        Style must be one of: primary, secondary, warning
        Example: SUGGESTED_ACTIONS: View Results|view_results|client|primary; Close|close|client|secondary

        Client actions (no backend call): close, cancel, navigate, copy
        Server actions (processed by backend): create_stream, execute_search

        For now, keep responses simple and conversational.
        Help users understand what they can do in the application.
        """

    def _build_user_prompt(
        self,
        message: str,
        context: Dict[str, Any],
        interaction_type: str
    ) -> str:
        """Build user prompt with context."""
        context_summary = "\n".join([f"{k}: {v}" for k, v in context.items()])

        return f"""User's current context:
        {context_summary}

        Interaction type: {interaction_type}

        User's message: {message}

        Respond with MESSAGE and optional SUGGESTED_VALUES or SUGGESTED_ACTIONS."""

    def _parse_llm_response(self, response_text: str) -> Dict[str, Any]:
        """
        Parse LLM response using payload parser registry.
        """
        import json

        result = {
            "message": "",
            "suggested_values": None,
            "suggested_actions": None,
            "payload": None
        }

        lines = response_text.split('\n')
        message_lines = []
        in_message = False

        for line in lines:
            stripped = line.strip()

            if stripped.startswith("MESSAGE:"):
                in_message = True
                content = stripped.replace("MESSAGE:", "").strip()
                if content:
                    message_lines.append(content)

            elif in_message and not any(stripped.startswith(marker) for marker in
                ["SUGGESTED_VALUES:", "SUGGESTED_ACTIONS:"] + self.payload_registry.get_supported_markers()):
                message_lines.append(line.rstrip())

            elif stripped.startswith("SUGGESTED_VALUES:"):
                in_message = False
                values_str = stripped.replace("SUGGESTED_VALUES:", "").strip()
                if values_str:
                    result["suggested_values"] = [
                        {"label": v.strip(), "value": v.strip()}
                        for v in values_str.split(",")
                    ]

            elif stripped.startswith("SUGGESTED_ACTIONS:"):
                in_message = False
                actions_str = stripped.replace("SUGGESTED_ACTIONS:", "").strip()
                if actions_str:
                    actions = []
                    for action_str in actions_str.split(";"):
                        parts = action_str.split("|")
                        if len(parts) >= 3:
                            handler = parts[2].strip()
                            if handler not in ["client", "server"]:
                                logger.warning(f"Invalid handler '{handler}' in action, skipping")
                                continue

                            action = {
                                "label": parts[0].strip(),
                                "action": parts[1].strip(),
                                "handler": handler
                            }
                            if len(parts) > 3:
                                style = parts[3].strip()
                                if style in ["primary", "secondary", "warning"]:
                                    action["style"] = style
                            if len(parts) > 4:
                                try:
                                    action["data"] = json.loads(parts[4])
                                except:
                                    pass
                            actions.append(action)
                    result["suggested_actions"] = actions

        # Join message lines
        if message_lines:
            result["message"] = "\n".join(message_lines).strip()

        # Try all registered payload parsers
        payload = self.payload_registry.parse_all(response_text)
        if payload:
            result["payload"] = payload

        # If no message was extracted, use the whole response
        if not result["message"]:
            result["message"] = response_text

        return result
```

### 8. Registry Initialization

```python
# backend/services/chat/__init__.py

"""
Chat service module with registry-based architecture.

To register a new page's chat capabilities:

1. Create a PromptBuilder in builders/ directory
2. Create a PayloadParser in parsers/ directory (if needed)
3. Register both in this __init__.py file

The registries will automatically be available to the GeneralChatService.
"""

from .prompt_builder_registry import prompt_builder_registry
from .payload_parser_registry import payload_parser_registry

# Import and register all builders
from .builders.edit_research_stream_builder import EditResearchStreamPromptBuilder

# Import and register all parsers
from .parsers.schema_proposal_parser import SchemaProposalParser

# Register builders
prompt_builder_registry.register(EditResearchStreamPromptBuilder())

# Register parsers
payload_parser_registry.register(SchemaProposalParser())

# Export registries
__all__ = ['prompt_builder_registry', 'payload_parser_registry']
```

---

## Implementation Guide

### Phase 1: Backend Infrastructure (2-3 hours)

1. Create base classes
   - [ ] `backend/services/chat/prompt_builder.py`
   - [ ] `backend/services/chat/payload_parser.py`

2. Create registries
   - [ ] `backend/services/chat/prompt_builder_registry.py`
   - [ ] `backend/services/chat/payload_parser_registry.py`

3. Create directories
   - [ ] `backend/services/chat/builders/`
   - [ ] `backend/services/chat/parsers/`

4. Migrate existing logic
   - [ ] Extract edit stream prompt to `EditResearchStreamPromptBuilder`
   - [ ] Extract schema proposal parsing to `SchemaProposalParser`
   - [ ] Update `GeneralChatService` to use registries

5. Create initialization module
   - [ ] `backend/services/chat/__init__.py` with registration

### Phase 2: Frontend Infrastructure (2-3 hours)

1. Create type definitions
   - [ ] `frontend/src/lib/chat/types.ts`

2. Create registry
   - [ ] `frontend/src/lib/chat/chatPageRegistry.ts`

3. Create hook
   - [ ] `frontend/src/hooks/useChatPage.ts`

4. Update ChatTray
   - [ ] Make ChatTray generic (accept context and onPayload props)
   - [ ] Remove page-specific logic

### Phase 3: Migrate Existing Page (1-2 hours)

1. Create EditStreamPage chat config
   - [ ] `frontend/src/pages/EditStreamPage.chatConfig.ts`

2. Update EditStreamPage
   - [ ] Import chat config
   - [ ] Use `useChatPage` hook
   - [ ] Simplify to pass context and handlePayload to ChatTray

3. Test end-to-end
   - [ ] Verify schema proposals still work
   - [ ] Verify all handlers work correctly

### Phase 4: Documentation (1 hour)

1. Update README
   - [ ] Document how to add a new page
   - [ ] Document how to add a new payload type

2. Add JSDoc comments
   - [ ] Document all public APIs
   - [ ] Add examples

---

## Example: Adding a New Page

Let's say we want to add chat support to the Reports page with a custom "report insights" payload.

### Step 1: Create Frontend Chat Config

```typescript
// frontend/src/pages/ReportsPage.chatConfig.ts

import { ChatPageConfig } from '../lib/chat/types';
import { chatPageRegistry } from '../lib/chat/chatPageRegistry';
import ReportInsightsCard from '../components/ReportInsightsCard';

export const reportsPageChatConfig: ChatPageConfig = {
  pageId: 'reports_page',

  buildContext: (pageState) => {
    const { selectedReport, filters, dateRange } = pageState;

    return {
      current_page: 'reports_page',
      selected_report_id: selectedReport?.id,
      current_filters: filters,
      date_range: dateRange
    };
  },

  payloadHandlers: {
    'report_insights': {
      render: (payload, callbacks) => (
        <ReportInsightsCard
          insights={payload.insights}
          suggestedFilters={payload.suggested_filters}
          onApply={callbacks.onAccept}
          onDismiss={callbacks.onReject}
        />
      ),

      onAccept: (payload, pageState) => {
        const { setFilters } = pageState;
        setFilters(payload.suggested_filters);
      },

      onReject: (payload) => {
        console.log('Report insights rejected');
      },

      renderOptions: {
        panelWidth: '600px'
      }
    }
  }
};

chatPageRegistry.register(reportsPageChatConfig);
```

### Step 2: Create Backend Prompt Builder

```python
# backend/services/chat/builders/reports_page_builder.py

from ..prompt_builder import PromptBuilder
from typing import Dict, Any

class ReportsPagePromptBuilder(PromptBuilder):
    """Prompt builder for the reports page."""

    def can_handle(self, page_id: str) -> bool:
        return page_id == "reports_page"

    def build_system_prompt(self, context: Dict[str, Any]) -> str:
        selected_report_id = context.get("selected_report_id")
        current_filters = context.get("current_filters", {})

        return f"""You are a helpful AI assistant for Knowledge Horizon, helping analyze reports.

Current context:
- Selected Report: {selected_report_id or "None"}
- Active Filters: {current_filters}

Your role is to help users understand reports and suggest insights.

When the user asks for analysis or insights, respond with:

MESSAGE: [Your analysis and explanation]

REPORT_INSIGHTS: {{
  "insights": [
    "Key insight 1",
    "Key insight 2"
  ],
  "suggested_filters": {{
    "date_range": "last_30_days",
    "topic_filter": ["relevant_topic"]
  }},
  "confidence": "high",
  "reasoning": "Based on the patterns in the report..."
}}

Only provide REPORT_INSIGHTS when explicitly asked for analysis or insights.
"""

    def get_supported_payloads(self) -> list[str]:
        return ["report_insights"]

    def get_page_description(self) -> str:
        return "Reports Page - Analysis and insight recommendations"
```

### Step 3: Create Backend Payload Parser

```python
# backend/services/chat/parsers/report_insights_parser.py

from ..payload_parser import PayloadParser
from typing import Optional, Dict, Any
import json
import logging

logger = logging.getLogger(__name__)

class ReportInsightsParser(PayloadParser):
    """Parser for REPORT_INSIGHTS payloads."""

    def get_marker(self) -> str:
        return "REPORT_INSIGHTS:"

    def parse(self, response_text: str) -> Optional[Dict[str, Any]]:
        lines = response_text.split('\n')
        insights_lines = []
        in_insights = False
        brace_count = 0

        for line in lines:
            stripped = line.strip()

            if stripped.startswith("REPORT_INSIGHTS:"):
                in_insights = True
                brace_count = 0
                content = stripped.replace("REPORT_INSIGHTS:", "").strip()
                if content:
                    insights_lines.append(content)
                    brace_count += content.count('{') - content.count('}')

            elif in_insights:
                if any(stripped.startswith(m) for m in ["MESSAGE:", "SUGGESTED_VALUES:", "SUGGESTED_ACTIONS:"]):
                    break

                insights_lines.append(line.rstrip())
                brace_count += line.count('{') - line.count('}')

                if brace_count == 0 and len(insights_lines) > 0:
                    break

        if not insights_lines:
            return None

        try:
            json_str = "\n".join(insights_lines).strip()
            data = json.loads(json_str)

            return {
                "type": "report_insights",
                "data": data
            }
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse REPORT_INSIGHTS JSON: {e}")
            return None
```

### Step 4: Register in Backend

```python
# backend/services/chat/__init__.py

from .builders.reports_page_builder import ReportsPagePromptBuilder
from .parsers.report_insights_parser import ReportInsightsParser

# Add to registrations
prompt_builder_registry.register(ReportsPagePromptBuilder())
payload_parser_registry.register(ReportInsightsParser())
```

### Step 5: Use in Page

```typescript
// frontend/src/pages/ReportsPage.tsx

import { useState } from 'react';
import { useChatPage } from '../hooks/useChatPage';
import ChatTray from '../components/ChatTray';

// Import to auto-register
import './ReportsPage.chatConfig';

export default function ReportsPage() {
  const [selectedReport, setSelectedReport] = useState(null);
  const [filters, setFilters] = useState({});

  // Get chat integration
  const { context, handlePayload } = useChatPage('reports_page', {
    selectedReport,
    filters,
    setFilters
  });

  return (
    <div>
      {/* Page content */}

      <ChatTray context={context} onPayload={handlePayload} />
    </div>
  );
}
```

**That's it!** The new page now has full chat support with custom payloads.

---

## Migration Path

### Option 1: Big Bang (Recommended for small codebases)

1. Implement all infrastructure in one PR
2. Migrate EditStreamPage as proof of concept
3. Test thoroughly
4. Deploy

**Pros**: Clean, no temporary code
**Cons**: Larger PR, more risk

### Option 2: Incremental (Recommended for production)

**Phase 1**: Backend Infrastructure
- Add registries alongside existing code
- Keep existing code working
- Deploy and monitor

**Phase 2**: Frontend Infrastructure
- Add registry and hook
- Keep existing ChatTray working
- Deploy and monitor

**Phase 3**: Migrate EditStreamPage
- Update to use new architecture
- Remove old page-specific code from ChatTray
- Deploy and monitor

**Phase 4**: Clean up
- Remove deprecated code
- Update documentation

**Pros**: Lower risk, easier to rollback
**Cons**: Temporary duplication

---

## Trade-offs and Considerations

### Pros

1. **Modularity**: Each page's chat behavior is self-contained
2. **Maintainability**: Changes to one page don't affect others
3. **Discoverability**: Easy to see what pages have chat support
4. **Extensibility**: Adding new pages is straightforward
5. **Testability**: Each component can be tested in isolation
6. **Type Safety**: TypeScript prevents many runtime errors

### Cons

1. **Complexity**: More abstractions to understand
2. **Indirection**: Need to look in multiple files to understand behavior
3. **Boilerplate**: Each new page requires several files
4. **Learning Curve**: Developers need to understand the registry pattern

### Performance Considerations

- **Registry lookups**: O(n) where n = number of registered builders/parsers
  - For small n (< 20), this is negligible
  - Could optimize with Map if needed

- **Context building**: Runs on every render
  - Already memoized in useChatPage hook

- **Payload parsing**: Runs once per LLM response
  - Minimal impact

### Scalability

- **Number of pages**: Scales linearly, no issues up to 100+ pages
- **Number of payload types**: Scales linearly, no issues up to 50+ types
- **Code organization**: Clear structure prevents spaghetti code

### Alternative Approaches Considered

#### 1. Configuration-based (no code)

Define chat behavior in JSON/YAML:

```yaml
# chat-configs/edit_research_stream.yaml
pageId: edit_research_stream
contextFields:
  - field: stream_name
    source: form.stream_name
  - field: purpose
    source: stream.purpose
```

**Pros**: No code, easier to edit
**Cons**: Less flexible, no TypeScript safety

#### 2. Decorator-based

Use decorators to mark pages:

```typescript
@ChatEnabled({
  pageId: 'edit_research_stream',
  handlers: {...}
})
export class EditStreamPage extends React.Component {
  ...
}
```

**Pros**: Collocated with component
**Cons**: Requires experimental decorators, less clear separation

#### 3. Higher-Order Component

Wrap pages with HOC:

```typescript
export default withChat({
  pageId: 'edit_research_stream',
  ...
})(EditStreamPage);
```

**Pros**: React-idiomatic
**Cons**: HOCs are being phased out in favor of hooks

**Decision**: Chose registry + hooks for flexibility and type safety.

---

## Future Enhancements

### 1. Auto-generate Documentation

```python
# backend/scripts/generate_chat_docs.py

from services.chat import prompt_builder_registry, payload_parser_registry

def generate_docs():
    """Generate markdown docs for all registered pages."""
    for builder in prompt_builder_registry.builders:
        print(f"## {builder.get_page_description()}")
        print(f"Supported payloads: {', '.join(builder.get_supported_payloads())}")
```

### 2. Visual Registry Browser

Create a debug page showing all registered pages and their capabilities.

### 3. Payload Type Validation

Add JSON schema validation for payload data:

```python
class SchemaProposalParser(PayloadParser):
    SCHEMA = {
        "type": "object",
        "required": ["proposed_changes", "reasoning"],
        ...
    }

    def validate(self, payload: Dict[str, Any]) -> bool:
        return jsonschema.validate(payload["data"], self.SCHEMA)
```

### 4. Analytics

Track which pages use chat most, which payload types are common:

```python
class AnalyticsMiddleware:
    def on_payload_parsed(self, page_id: str, payload_type: str):
        # Log to analytics
        pass
```

### 5. Testing Utilities

```typescript
// frontend/src/lib/chat/testing.ts

export function createMockChatPage(pageId: string, overrides?: Partial<ChatPageConfig>) {
  return {
    pageId,
    buildContext: () => ({}),
    payloadHandlers: {},
    ...overrides
  };
}
```

---

## Conclusion

This modular architecture provides a scalable, maintainable foundation for extending chat functionality across the application. While it adds some upfront complexity, it dramatically simplifies the process of adding chat support to new pages and ensures consistency across the codebase.

The registry pattern is well-suited to this use case because:
- The number of pages is bounded and knowable
- Each page's requirements are unique
- We want compile-time type safety
- We value explicit over implicit registration

For a production implementation, we recommend the **incremental migration path** to minimize risk while gaining the benefits of the new architecture.
