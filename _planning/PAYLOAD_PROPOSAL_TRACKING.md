# Payload Proposal Tracking Enhancement

## Problem

The current payload proposal system in KH has no central tracking. Each page defines `payloadHandlers` with `onAccept`/`onReject` callbacks that fire once with no lifecycle management. This leads to:

- **No mutual exclusion**: Multiple proposals can arrive and overwrite each other
- **No lifecycle tracking**: No progress states (pending/running/done)
- **No backend resolution**: No record of whether a proposal was accepted or dismissed
- **No history restoration**: Proposals lost on page refresh
- **No operation-level tracking**: Can't show per-item progress for multi-operation proposals

## Reference Implementation: Table-That

The `tabletaht` codebase (C:\code\tabletaht) has a robust two-phase proposal system worth adopting.

### Architecture

**Two-level state management:**

1. **ChatContext level** — tracks pending proposals globally:
   ```typescript
   interface PendingProposal {
     kind: 'data' | 'schema' | 'schema_create';
     payloadType: string;
     data: unknown;
     messageIndex: number;
     messageId?: number;  // DB ID when loaded from history
   }
   ```
   - Only one proposal active at a time (mutual exclusion via ref)
   - New proposals blocked while one is pending
   - On history load, scans messages for unresolved proposals and restores them

2. **Hook level** (`useTableProposal`) — tracks execution state:
   ```typescript
   phase: 'idle' | 'running' | 'done'
   checkedOps: boolean[]     // Which items user selected
   opResults: OpResult[]     // Per-operation: pending/running/success/error
   ```

### Proposal Lifecycle

```
AI sends payload → ChatContext detects → pendingProposal set
    → Page hook picks up → User reviews → Accept/Dismiss
    → If accept: phase=running → per-op execution → phase=done
    → resolveProposal() called → backend marks message resolved
    → Chat informed via follow-up message
```

### Backend Resolution

```python
# PATCH /messages/{message_id}/resolve-proposal
# Body: { outcome: 'accepted' | 'dismissed' }
# Updates message.extras.custom_payload with:
#   resolved: true
#   outcome: 'accepted' | 'dismissed'
```

This allows history reload to skip resolved proposals and restore unresolved ones.

### Key Patterns

| Pattern | Detail |
|---------|--------|
| Mutual exclusion | `pendingProposalRef.current === null` check before setting |
| Message coupling | Each proposal tied to `messageIndex`/`messageId` |
| Phase machine | idle → running → done → dismissed |
| Per-op progress | Individual operation status tracking |
| Backend sync | `resolveProposal()` persists outcome after UI completes |
| History restore | Scan messages for `custom_payload.resolved !== true` |

## Adaptation Plan for KH

1. Add `pendingProposal` state + ref to `ChatContext`
2. Add `classifyProposal()` to map KH payload types to proposal kinds
3. Add resolve endpoint to chat API (`PATCH /messages/{id}/resolve-proposal`)
4. Create `useStreamProposal` hook (equivalent to `useTableProposal`) for stream config pages
5. Update `ChatTray` to block new proposals while one is pending
6. Update page-level payload handlers to bridge through the proposal system
7. Add history restoration logic to `ChatContext.loadChat()`

## Files to Reference

- `C:\code\tabletaht\frontend\src\context\ChatContext.tsx` — pendingProposal state
- `C:\code\tabletaht\frontend\src\hooks\useTableProposal.ts` — execution tracking hook
- `C:\code\tabletaht\frontend\src\pages\TableViewPage.tsx` — page-level bridging
- `C:\code\tabletaht\backend\services\chat_service.py` — resolve_proposal method
- `C:\code\tabletaht\backend\routers\chat.py` — resolve endpoint
