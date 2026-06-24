# BulSU Space Messaging Flow

Covers one-to-one & group chat lifecycle: chat retrieval, message composition, moderation, sending (transaction + queue + retry), read receipts, reactions, archiving, blocking, notifications, and UI synchronization.

---
## High-Level User Journey
1. User opens Messaging page → chats list + optionally the last selected chat load.
2. Real-time listeners attach for chat metadata & messages (paginated / lazy load for history).
3. User selects or creates chat (direct or group). `ensureDirectChat` or `createChat` is used.
4. User types message; local profanity & AI moderation gating occurs on send attempt.
5. `sendMessage` (or `sendMessageWithRetry`) executes:
   - Validates content & block status.
   - Firestore transaction writes message + updates chat document (lastMessage, unread counts, unarchives recipients, timestamps).
   - Notification & sound dispatch for recipients.
6. UI shows optimistic message (localStatus sending) → replaced/confirmed after transaction completion.
7. Recipients' clients mark messages read when visible → batched read receipt updates.
8. Optional edits, deletes, forwards, reactions, archive/unarchive operations mutate message/chat documents.

---
## Core Files
| Responsibility | File |
| -------------- | ---- |
| Page container & UI logic | `src/pages/MessagingPage.tsx` |
| Message/service operations | `src/services/messageService.ts` |
| Offline/Retry queue (alt) | `src/services/messageQueue.ts` |
| Moderation (AI + profanity) | `src/services/aiModerationService.ts`, `src/utils/profanityFilter.ts` |
| Block checks & user data | `src/services/userService.ts` |
| Call features (voice/video) | `src/services/callService.ts` |
| Network reachability | `src/services/networkService.ts` |
| Notifications | `notifyNewMessage` (inside messageService or related triggers) |

---
## Data Model (Simplified)
### Chat
```ts
interface Chat {
  id: string;
  participants: string[];           // UIDs
  isGroupChat: boolean;
  name?: string;
  lastMessage?: {
    messageId: string;
    content: string;
    senderId: string;
    createdAt: Timestamp;
    type: MessageType;
    status: 'sent' | 'delivered' | 'read';
    readBy: string[];               // UIDs
  };
  unreadCount: Record<string, number>; // per user counts
  archived?: Record<string, boolean>;  // per user archive flag
  theme?: string;                      // UI theme key
  updatedAt: Timestamp;
}
```

### Message
```ts
interface Message {
  id: string;
  chatId: string;
  senderId: string;
  content: string;            // trimmed
  type: 'text' | 'image' | 'file' | 'video' | 'audio' | 'system';
  status: 'sent' | 'delivered' | 'read';
  createdAt: Timestamp;       // client Timestamp.now() then server resolves timestamps in chat.lastMessage
  attachments?: string[] | null; // filenames/URLs (when not text)
  replyTo?: string | null;    // referenced message id
  readBy: string[];           // includes sender at creation
  edited: boolean;
  reactions?: Record<string, { userId: string; type: 'heart' | 'like' | 'sad' | 'anger'; timestamp: Timestamp }>;
  deletedForEveryone?: boolean;
  deletedForMe?: string[];    // userIds who self-deleted view
}
```

---
## Message Composition & Moderation
1. User types in `MessageInput` (state: `messageText`).
2. On submit:
   - Trim & length constraints (implicit UI guard).
   - `detectProfanity(messageText)` → if words found open `ProfanityModal` (confirm or block flow).
   - `moderateWithOpenAI` (secondary AI moderation). If flagged → block and show error.
3. After passing moderation → proceed to send.

Fail-open: AI moderation errors (network/model loading) do not block sending; warnings logged.

---
## Sending Logic
### Primary Path: `sendMessage`
Steps inside `messageService.sendMessage`:
1. Validate `chatId`, `senderId`, non-empty content.
2. Fetch chat document → ensure exists.
3. For direct chats, check block status via `checkMutualBlock(senderId, otherUserId)`. If mutual/blocked, throw with user-friendly message.
4. Prepare `messageData` with local Timestamp and initial status 'sent'.
5. Start Firestore transaction:
   - Read chat doc.
   - Build new `unreadCount`: increment for recipients, zero for sender.
   - Detect archived recipients; mark for unarchive.
   - Set new message doc with generated ID (include ID inside doc body for convenience).
   - Update chat doc: `lastMessage`, `unreadCount`, `updatedAt`, reset archived flags for recipients who were auto-unarchived.
6. Commit transaction.
7. Post-transaction:
   - If recipients include current authenticated user (as a receiver on another client) play immediate sound throttle (3s per sender) using sessionStorage keys.
   - Trigger `notifyNewMessage(participantId, senderId, message.id)` for each recipient (failures caught & logged).
8. Return the newly constructed message object.

### Retry Path: `sendMessageWithRetry`
1. Attempt `sendMessage`.
2. On failure → queue message via `addToMessageQueue` (lightweight queue). Returns `queueId` to the UI.
3. Queue processor periodically retries until success or max attempts reached; emits DOM CustomEvents (`messageSuccess`, `messageFailed`).

### Offline Queue (Alternate Service: `messageQueue.ts`)
- Maintains persistent queue in localStorage (`messageQueue`).
- Exponential backoff on retries (1s * 2^retries) up to max (default 3).
- Processes automatically when network returns (listens to `online`/`offline`).
- Exposes `getPendingMessages()` for UI introspection.

---
## Optimistic UI
- Page may append a local message with `localStatus: 'sending'` before confirm.
- On success, replaces with server-confirmed message (matching ID) or updates status.
- On queue failure: mark message as `failed` (UI may allow manual retry).

---
## Read Receipts
Mechanism:
1. When user views a chat, visible messages trigger `queueReadReceipt(chatId, userId, messageId)`.
2. Batcher groups message IDs for (chatId, userId) key for a short delay (`READ_RECEIPT_BATCH_DELAY`).
3. `processReadReceiptBatch` calls `markMessagesAsRead(chatId, userId, messageIds[])`.
4. Success emits `readReceiptSuccess` custom event; UI can update per-message `readBy`.
5. Failed batches re-queued (with age guard < 60s).

Unread Count Logic:
- Transaction sets sender’s unread 0, increments recipients’ unread.
- Separate logic (not shown here) decrements when read receipts commit.

---
## Reactions
- Functions `addMessageReaction` / `removeMessageReaction` mutate a message's reactions map keyed by userId.
- UI aggregates counts & highlights user’s reaction.

---
## Editing & Deletion
| Action | Behavior |
| ------ | -------- |
| Edit | Updates message content, sets `edited: true`. Validation & (optionally) re-moderation should occur. |
| Delete for Everyone | Flags `deletedForEveryone` (content hidden for all). |
| Delete for Me | Adds userId to `deletedForMe` array; only hidden for that user. |
| Hide Message | Similar personalized concealment; may be separate from simple delete. |

---
## Archiving & Auto-Unarchive
- User action sets `archived.<userId> = true` in chat doc.
- Incoming message transaction auto-unarchives for recipients by setting `archived.<recipientId> = false` when new message arrives.

---
## Blocking
- Direct chat send path prevents sending if either side has an active block (two granular flags detected by `checkMutualBlock`).
- Error messages differentiate: "You have blocked" vs. "You cannot send because they blocked you.".

---
## Notifications & Sounds
| Mechanism | Trigger |
| --------- | ------- |
| Immediate in-page sound | After successful send if current tab is recipient's client & throttled (>=3s) per sender. |
| Notification record | `notifyNewMessage` invoked per recipient excluding sender. |
| (Potential) system push | Implementation dependent on notification service wiring. |

Throttle Strategy: `sessionStorage` key `last_msg_sound_<senderId>` stores last playback timestamp.

---
## Network Resilience
| Feature | Description |
| ------- | ----------- |
| Immediate attempt + fallback queue | `sendMessageWithRetry` pattern. |
| Persistent offline queue | `messageQueue` service with localStorage persistence. |
| Exponential backoff | In `messageQueue` (1s * 2^retries). |
| Event hooks | `messageSuccess`, `messageFailed`, `readReceiptSuccess`. |

---
## Security & Moderation
| Concern | Mitigation |
| ------- | ---------- |
| Harassment / Spam | Block checks + potential future rate limiting. |
| Offensive content | Profanity + AI moderation gate on send UI layer. |
| Unauthorized message injection | Firestore security rules (assumed); transaction verifies chat existence & participants. |
| Replay / duplication | ID generated client-side but authoritative write in transaction ensures atomic context. |

---
## Potential Improvements
1. **Server-Side Enforcement**: Mirror moderation & block logic in Firebase security rules / Cloud Functions.
2. **Delivery Status**: Add intermediate 'delivered' status once all recipients get snapshot (currently simplified).
3. **Typing Indicators**: Add ephemeral RTDB/Firestore presence node per chat.
4. **Attachment Handling**: Integrate upload + progress bars (current `attachments` assume pre-known URLs/names).
5. **End-to-End Encryption**: Client-side encrypt content before `sendMessage`, store ciphertext & per-recipient keys.
6. **Rate Limiting**: Prevent rapid spam by measuring message frequency per user.
7. **Retry UI**: Expose failed queued messages with manual resend action.
8. **Search Index**: Add content indexing for message search (maybe Algolia / Firestore composite queries). |
9. **Pinned Messages**: Enhance with a pinned messages collection and ordering (partial support via `pinnedDetails?`).

---
## Quick Developer Reference
| Action | Function |
| ------ | -------- |
| List chats | `getUserChats(userId)` |
| Ensure direct chat | `ensureDirectChat(userA, userB)` |
| Load messages (initial) | `getChatMessages(chatId, limit)` or pagination variant |
| Paginate older messages | `getPaginatedMessages(chatId, pageSize, cursor)` |
| Send | `sendMessage(chatId, senderId, content, type, attachments?, replyTo?)` |
| Send w/ retry | `sendMessageWithRetry(...)` |
| Edit | `editMessage(chatId, messageId, newContent)` |
| Delete (everyone) | `deleteMessage(chatId, messageId, true)` |
| Delete (me) | `deleteMessage(chatId, messageId)` (implementation-specific flag) |
| Reaction add/remove | `addMessageReaction(...)` / `removeMessageReaction(...)` |
| Read receipts | `markMessagesAsRead(chatId, userId, messageIds[])` (batched helper exists) |
| Forward | `forwardMessage(sourceChatId, messageId, targetChatIds[])` |
| Archive/Unarchive chat | `archiveChat(chatId, userId)` / `unarchiveChat(chatId, userId)` |

---
## Text Sequence (Direct Message Send)
```
User -> UI: type message
User -> UI: press send
UI -> ProfanityFilter: scan
ProfanityFilter --> UI: ok
UI -> AIModeration: moderate
AIModeration --> UI: ok
UI -> messageService.sendMessage
messageService -> Firestore(tx): read chat
Firestore(tx) --> messageService: chat snapshot
messageService -> Firestore(tx): set message doc
messageService -> Firestore(tx): update chat (lastMessage, unreadCount)
Firestore(tx) --> messageService: commit ok
messageService -> Notifications: notify recipients
messageService -> UI: return sent message
UI -> UI: update optimistic message status
```

---
_Last updated: 2025-08-17_
