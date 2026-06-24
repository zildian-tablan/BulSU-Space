# BulSU Space Posting Flow

This document explains how a user creates a post, how the UI component orchestrates validation and tagging, how media is (or would be) uploaded, and how the backend Firestore structures are written & observed.

---
## High-Level Sequence
1. User visits a feed (e.g. `HomePage` -> `Feed` component) or a group page.
2. `CreatePost` component renders (role‑aware visibility + banners).
3. User enters text, optionally (when enabled) adds media, tags friends or (for super admin) user groups.
4. On submit: client-side profanity + AI moderation checks run.
5. If clean, `createPost()` service builds metadata & uploads media (parallel) → Firestore `posts` collection.
6. Activity log + (if admin role) announcement notifications triggered.
7. Real-time listeners (`getPostsRealtime` or pagination fetch) surface new post; optimistic state optionally used.

---
## Core Files
| Responsibility | File |
| -------------- | ---- |
| UI form & UX states | `src/components/feed/CreatePost.tsx` |
| Feed retrieval / realtime | `src/components/feed/Feed.tsx` |
| Post service (CRUD, sharing, media) | `src/services/postService.ts` |
| Activity logging | `src/services/activityLogService.ts` |
| Notifications (reactions/comments/admin) | `src/services/notificationTriggers.ts` |
| Friend relationships & tagging | `src/services/friendService.ts` |
| AI moderation | `src/services/aiModerationService.ts` |
| Profanity filtering | `src/utils/profanityFilter.ts` |

---
## Data Model (Simplified Post Shape)
```ts
interface Post {
  id: string;                // Firestore doc ID
  userId: string;            // Author UID
  userName: string;          // Cached author name
  userProfilePic?: string;   // Cached avatar
  userRole: string;          // Role snapshot at creation
  content: string;           // Text body
  media: MediaItem[];        // Uploaded media descriptors
  visibility: 'public' | 'friends' | 'poshed' | 'fipo' | 'afea' | 'shatmo';
  createdAt: Timestamp;
  updatedAt: Timestamp;
  isPinned: boolean;
  isEdited: boolean;
  commentCount: number;
  reactionCount: number;
  viewCount: number;
  viewedBy: string[];        // (May be used for analytics)
  taggedFriends: string[];   // Friend user IDs
  taggedGroups: string[];    // For super admin group announcements
  isShare: boolean;          // True if derived from another post
  sharedFromPostId?: string;
  sharedFromUserId?: string;
  sharedFromUserName?: string;
  shareCount: number;
  isOptimistic?: boolean;    // Client hint until listener confirms
}
```

### MediaItem
```ts
interface MediaItem {
  type: 'image' | 'video' | 'document';
  url: string;   // Download / proxied URL
  name: string;
  size: number;  // Bytes
}
```

---
## Visibility Rules & Defaults
| Role | Default Visibility | Public Allowed? | Groups Tagging? |
| ---- | ------------------ | --------------- | --------------- |
| Student | `friends` | No | No |
| Faculty | `friends` | No | No |
| Alumni  | `friends` | No | No |
| Admin / Super Admin | `public` (forced) | Yes (forced) | Super Admin can tag user groups |

Department (e.g. POSHED) may appear as an additional scoped visibility option for eligible users.

---
## CreatePost Component: Major States
| State | Purpose |
| ----- | ------- |
| `content` | Post body text. |
| `files` / `previewUrls` | Selected media + local preview (media currently disabled in UI). |
| `visibility` | Selected visibility (role-initialized). |
| `isSubmitting` / `isProcessingContent` | Disable UI during moderation + network. |
| `taggedFriends` / `taggedGroups` | Friend or group tagging (mutually exclusive by role). |
| `showFriendsList` / `showGroupTagging` | Toggles tag selection panes. |
| `contentError` | Validation / moderation feedback messages. |
| `profanityModalOpen` | Blocks submission if profanity detected for user confirmation (modal component). |

---
## Validation & Moderation Pipeline
1. **Profanity Filter (Local)**: `detectProfanity(content)` returns list of flagged words. If any → open `ProfanityModal` and abort submission.
2. **AI Moderation (External / OpenAI wrapper)**: `moderateWithOpenAI(content)` returns:
   - `flagged: boolean`
   - `reason?: string` (may indicate model loading or skip)
   - If `flagged` → show rejection message (`contentError`) and abort.
3. **Graceful Degradation**: Errors or model load delays clear `contentError` so user can still post (fail-open but logged in console).

---
## Submission Flow (UI)
```
handleSubmit()
  set isSubmitting + isProcessingContent
  profanity check → fail => modal; return
  AI moderation check → flagged => show error; return
  snapshot form state (for restore on error)
  build tagging arrays (friends OR groups)
  call createPost(userId, content, files, visibility, currentUser, taggedFriendIds, taggedGroups)
    ↓ returns postId
  fetch created Firestore doc, invoke onPostCreated callback (optimistic feed prepend)
  logPostCreate(postId, visibility)
  reset form + close mobile modal
catch: restore state + show error
finally: clear submitting flags
```

---
## Service Layer: `createPost()` Details
1. Parallel operations:
   - Fetch user document (unless provided in `userData`).
   - `uploadMediaFiles()` for each file:
     - Generate UUID filename → `posts/<uid>/<uuid>_<original>` in Firebase Storage.
     - `uploadBytes` then `getStorageUrlWithCORS` to wrap with proxy if needed.
     - Infer `type` from MIME.
2. Construct `postData` with counts initialized to 0 and `isOptimistic: true`.
3. `addDoc` to `posts` collection.
4. Activity log: `activityLogger.logActivity('post_created', ...)`.
5. If author role is admin / super admin → `notifyAdminAnnouncement` to broadcast.
6. Return new document ID.

> Errors propagate; UI layer handles user feedback & restoring state. Media uploads are atomic per file (no manifest doc for partial failure). If a single upload fails the entire `Promise.all` rejects.

---
## Tagging Logic
| Role | Tagging Mode | Stored Field |
| ---- | ------------ | ------------ |
| Student / Faculty / Alumni | Per-friend multi-select | `taggedFriends: string[]` |
| Super Admin | Fixed group set (Students, Faculties, Alumni, Admins) | `taggedGroups: string[]` |

Display text helpers generate friendly phrasing (e.g., "with Alice and 2 others").

---
## Feed Integration (`Feed.tsx`)
- Initial batch via `getPostsBatch(currentUser.id, currentUser.role, limit)` populates state.
- Real-time or subsequent batch fetches may use `getPostsRealtime` or pagination with `lastVisible`.
- Admin filter "reported" path calls `getReportedPosts`.
- New post insertion: `onPostCreated` callback prepends to existing posts array for instant UI feedback.

---
## Sharing Flow (Brief)
`sharePost(originalPostId, sharingUserId, visibilityOverride?)`:
1. Load original post.
2. Load sharing user.
3. Create a new post document marking `isShare: true` + attribution fields.
4. Increment `shareCount` on original (best-effort; failure ignored).
5. Log `post_shared` activity.

---
## Activity Logging
Examples:
| Event | When |
| ----- | ---- |
| `post_created` | After successful addDoc. |
| `post_shared` | After share duplication. |

Payload includes severity level (`low` / `medium`) plus contextual IDs for later auditing.

---
## Notification Hooks
- Admin / Super Admin posts trigger `notifyAdminAnnouncement(postId, userId, name)`.
- (Elsewhere) Post reactions & comments trigger `notifyPostReaction` / `notifyPostComment` (not detailed here, but housed in same service layer for cohesion).

---
## Error Modes & Resilience
| Failure Point | Outcome |
| ------------- | ------- |
| User not authenticated | UI throws error; submission aborted. |
| User doc missing | Service throws "User not found". |
| Any media upload fails | Entire create rejects; no partial post. |
| Firestore addDoc fails | Rejection; no activity log or notification. |
| Activity log fail | Caught internally; post still succeeds. |
| Announcement notify fail | Logged to console, does not block post. |
| AI moderation unavailable | Warning; posting allowed (fail-open). |

---
## Optimizations & Performance
- Media uploads run in parallel (`Promise.all`).
- Tagging friend list fetched lazily only when user opens tagging UI.
- Role-based defaults reduce user friction (one less click for common case).

---
## Security & Moderation Considerations
| Aspect | Current Behavior |
| ------ | ---------------- |
| Profanity | Local dictionary filter triggers confirm modal. |
| AI Moderation | Secondary layer; can block flagged content. |
| Access Control | `canCreatePost` limits posting to (student | faculty | alumni | admin | super admin). |
| Visibility Enforcement | UI enforces; additional server rules should exist in Firestore security rules (not covered here). |
| Group Tagging | Restricted to super admin to prevent spam amplification. |

---
## Potential Improvements
1. **Transactional Consistency**: Use a batch or a two-phase approach to mark post as complete after media upload & log succeed (with `status` field).
2. **Partial Media Recovery**: Upload first, then if Firestore fails, schedule cleanup of orphaned storage objects.
3. **Optimistic Rendering**: Insert a temporary post before Firestore write resolves (flag `isOptimistic`) then reconcile.
4. **Rate Limiting**: Add per-user post frequency throttle to `postService`.
5. **Attachment Enablement**: Re-enable media UI (currently disabled: file input & button).
6. **Better Moderation Feedback**: Provide inline highlight of problematic words.
7. **Server-Side Validation**: Mirror profanity/AI checks in Cloud Functions to prevent bypass via direct writes.

---
## Quick Developer Reference
| Action | Entry Point |
| ------ | ----------- |
| Create post | `createPost(userId, content, files, visibility, userData?, taggedFriends, taggedGroups)` |
| Share post | `sharePost(originalPostId, sharingUserId, visibilityOverride?)` |
| Update post | `updatePost(postId, userId, content, media?, visibility?)` |
| Listen realtime | `getPostsRealtime(userId, role, callback)` |
| Batch fetch | `getPostsBatch(userId, role, pageSize, cursor)` |

---
## Text Sequence (Create)
```
User -> CreatePost: type content
User -> CreatePost: submit
CreatePost -> ProfanityFilter: scan
ProfanityFilter --> CreatePost: ok
CreatePost -> AIModeration: moderate
AIModeration --> CreatePost: ok
CreatePost -> postService.createPost: data + files + tags
postService -> Storage: upload each file (parallel)
postService -> Firestore(posts): addDoc(postData)
postService -> ActivityLogger: log post_created
postService -> Notifications (if admin): notifyAdminAnnouncement
Firestore(posts) -> Feed listener: onSnapshot(newPost)
Feed -> UI: prepend/render post
```

---
_Last updated: 2025-08-17_
