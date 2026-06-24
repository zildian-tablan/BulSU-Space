# BulSU Space Login Flow

This document explains in detail how the BulSU Space sign-in (authentication) flow works, covering both the UI component (`src/components/auth/SignIn.tsx`) and the authentication logic in the Auth Context (`src/contexts/AuthContext.tsx`).

---
## High-Level Overview
1. User loads Sign In page.
2. Form state (email/password) may be restored from session (unless intentional logout).
3. User enters ID or email + password; email is normalized/auto-formatted.
4. User submits form -> calls `login()` from AuthContext.
5. Security checks (lockout) and authentication via `AuthService` (Firebase under the hood).
6. On success: presence updated, session flags set, optional graduation prompt, redirect to `/home`.
7. Auth state listener (and Firestore snapshot) finalizes and maintains current user state.

---
## Key Files
| Responsibility | File |
| -------------- | ---- |
| UI form + UX logic | `src/components/auth/SignIn.tsx` |
| Auth state, login, signup, logout | `src/contexts/AuthContext.tsx` |
| Dynamic auth operations wrapper | `src/services/authService` (imported dynamically) |
| Security / lockout logic | `src/utils/securityUtils` (SecurityManager / SecurityLogger) |
| Presence tracking | `src/services/presenceService` |
| Permission validation helper | `src/utils/permissionUtils` |

---
## Session & Local Storage Flags
| Key | Scope | Purpose |
| --- | ----- | ------- |
| `isAuthenticated` | session | Fast gate before Firebase resolves. |
| `currentUser` | session | Cached serialized user object for instant reload rendering. |
| `loginSuccess` | session | Prevents redundant redirect loops immediately after login. |
| `loginTimestamp` | session | Timestamp (ms) of last successful login (for timing window). |
| `intentionalLogout` | session | Suppresses auto re-login persistence after user explicitly logs out. |
| `logoutTimestamp` | session | Paired with above; time to block auto-restore. |
| `forceStayOnSignIn` | session | If set, blocks auto-redirect when already authenticated. |
| `isAuthenticating` | session | Indicates in-progress login to suppress conflicting checks. |
| `isLoggingOut` | session | Prevents race conditions with auth listener during logout. |
| `authTimestamp` | session | Timestamp used to detect stale sessions. |
| `graduation-prompted-<uid>` | local | Avoid re-prompting alumni graduation modal. |
| `bulsu-login-form` | session | Temporary form persistence (email/password while typing). |

---
## Detailed UI Flow (`SignIn.tsx`)
1. **Initialization**
   - Reads temporary form data from `sessionStorage` (unless `intentionalLogout` is active).
   - Sets internal state: `email`, `password`, `showPassword`, `isLoading`, etc.
2. **Auto Redirect Effect**
   - If `currentUser` exists and NOT `forceStayOnSignIn`, navigates to `/home` (with a 5s suppression window after a fresh login using `loginSuccess/loginTimestamp`).
3. **Logout Cleanup Effect**
   - If `intentionalLogout` flag present → clears form + resets loading, then removes flag.
4. **Lockout Parsing Effect**
   - If `error` contains phrase `Try again in`, extracts `M:SS`, initializes `lockoutSeconds` countdown.
5. **Countdown Effect**
   - Decrements `lockoutSeconds` each second; auto-clears related error when it hits 0.
6. **Form Persistence Effect**
   - Writes `{ email, password }` into `bulsu-login-form` in `sessionStorage` on every change.
7. **Email Field Behavior**
   - Accepts raw ID (with/without hyphen) OR BulSU Space email.
   - On blur: transforms raw ID / `@bulsu.edu.ph` domain → normalized `@bulsuspace.com`.
8. **Submit (`handleSubmit`)**
   - Normalizes email (ID → email, domain replacement) and determines enrollment year (first 4 digits of ID) for alumni prompt logic (<= 2020).
   - Clears redirection-prevention flags.
   - Calls `login(formattedEmail, password)` from context.
   - On success: if year <= 2020 and not previously prompted → open graduation modal; else set auth flags + redirect immediately.
9. **Graduation Modal**
   - If user indicates graduated: updates Firestore user (`role: 'alumni'`, `graduationBatch`).
   - Else sets/ensures `role: 'student'`.
   - Sets `graduation-prompted-<uid>` localStorage marker and redirects.
10. **Error Clearing While Typing**
    - Field modification clears `error` via `setError(null)`.

---
## Authentication Logic (`AuthContext.tsx`)
### 1. State Bootstrapping
- On reload, uses `sessionStorage.currentUser` + `isAuthenticated` to skip initial loading spinner for faster UX.

### 2. Auth State Listener
- Registered via `AuthService.monitorAuthState`. On Firebase user present:
  - Fetches Firestore user document (`users/<uid>`). If missing, creates a minimal default record.
  - Writes user object into state + `sessionStorage`.
- On no user:
  - Clears auth flags unless in a protected reload grace period.

### 3. Real-Time User Doc Listener
- `onSnapshot` on `users/<uid>` keeps `currentUser` live (e.g., restriction changes).

### 4. `login(email, password)` Steps
1. Check lockout: `SecurityManager.isAccountLocked`. If locked → compute remaining time, set formatted error, log `login_attempt_blocked`.
2. Clear previous error, set loading + 10s safety timeout.
3. Dynamic import `AuthService`; attempt `AuthService.login`.
4. On failure: set `error`, clear loading (timeout canceled), return false.
5. On success:
   - Log `login_success` via `SecurityLogger` (with device fingerprint).
   - Brief delay (300ms) → `updateUserOnlineStatus(uid)` (presence system).
   - Clear loading, return true. Auth state listener will fully populate the user.

> Note: A legacy fallback block (using direct `signInWithEmailAndPassword`) remains below in the file but is no longer executed because the function returns earlier. It can be safely removed after audit.

### 5. Security / Lockout
- Each failed attempt (in legacy block) calls `SecurityManager.recordLoginAttempt` and may trigger detection logic `detectSuspiciousActivity`.
- Current (primary) path relies on `AuthService` to raise errors which then feed the user-facing messaging.

### 6. Presence Integration
- After successful AuthService login, `updateUserOnlineStatus(uid)` marks user online (RTDB/Firestore depending on implementation of presence service).

### 7. Logout (Summary)
- Confirms via `window.confirm`.
- Calls `setUserOffline` (fallback: `directWriteUserStatus`).
- Uses `AuthService.logout` (or Firebase fallback), clears storage, sets `intentionalLogout`, redirects to `/signin`.

---
## Alumni Graduation Prompt Logic
| Condition | Trigger |
| --------- | ------- |
| Enrollment year (first 4 digits of ID) <= 2020 | Potential alumni → show modal unless `graduation-prompted-<uid>` already set |
| User chooses Graduated + selects batch | Firestore: role → `alumni`, store `graduationBatch` |
| User chooses Not Graduated | Firestore: role → `student` (ensured) |

---
## Lockout Countdown Logic
1. AuthContext sets `error` like: `Account temporarily locked ... Try again in M:SS.`
2. SignIn parses substring after `Try again in` → converts to seconds.
3. Displays dynamic countdown (minutes:seconds) updating every second.
4. When it hits 0, clears `lockoutSeconds` & (if still same error) calls `setError(null)`.

---
## Data & State Flow Diagram (Textual)
User Input → SignIn local state → Submit → AuthContext.login → (Security / Lockout) → AuthService (Firebase) → Success → Presence update → Firebase Auth state event → Firestore user fetch → Set `currentUser` + session cache → SignIn redirect (unless blocked) → Real-time user updates via snapshot.

---
## Common Edge Cases
| Scenario | Handling |
| -------- | -------- |
| Reload right after logout | `intentionalLogout` + `logoutTimestamp` block auto rehydrate; forced sign-out again if needed. |
| Firebase slow to initialize on reload | Temporary reuse of cached session; timeout clears stale state if Firebase never confirms. |
| Lockout active | Submit disabled, countdown shown. |
| Missing Firestore doc | Minimal user object created and Firestore attempt to seed. |
| Restricted user | Allowed to sign in; downstream UI expected to gate features / show modal. |
| Alumni prompt dismissed by choosing status | Stored locally to prevent re-prompt. |

---
## Opportunities for Cleanup / Improvement
1. Remove unreachable legacy portion in `login()` to reduce confusion.
2. Centralize flag names in a constants module to avoid typos.
3. Replace ad-hoc `window.confirm` in logout with a unified modal (already a component exists elsewhere: `LogoutConfirmModal` imported but unused here).
4. Add unit tests for: email normalization, alumni prompt trigger, lockout parsing.
5. Consider debouncing form persistence to reduce sessionStorage writes.

---
## Quick Reference (Developer)
- Call `useAuth()` anywhere inside provider to access `currentUser`, `login`, `logout`.
- Adding new post-login side effects? Prefer hooking into the auth state listener (after user is known) rather than inside `login()`.
- To simulate lockout: invoke `SecurityManager.recordLoginAttempt(email, false)` repeatedly until threshold reached.

---
## Removal of Legacy Code (Suggested Patch Sketch – NOT yet applied)
Inside `login()` remove the second large `try { ... } catch` block after the initial AuthService pathway. Ensure tests (if any) reference only the modern flow.

---
## Summary
The login system prioritizes fast perceived authentication (session bootstrap), resilience (timeouts & defensive flags), security (lockout & device logging), and contextual UX (alumni role confirmation). Presence and permission checks integrate seamlessly post-auth while storage flags orchestrate correct redirection behavior.

---
_Last updated: 2025-08-17_
