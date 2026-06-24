# BulSU Space - Academic Social Platform

A social platform for Bulacan State University students, faculty, and alumni with Firebase integration.

## Features

- User authentication with role-based access (student, faculty, alumni)
- Feed with posts, announcements, events, and academic resources
- File and media sharing
- Real-time updates using Firebase
- Responsive design for all screen sizes
- Improved UI usability with selective text selection prevention

## UI Usability Features

### Text Selection Prevention

The application implements selective text selection prevention to improve user experience:

- UI containers, buttons, cards, and layout elements have text selection disabled to prevent accidental text highlighting
- Text content (paragraphs, headings, labels, etc.) remains selectable for normal copy-paste functionality
- Two utility components are provided:
  - `<SelectableText>` - Makes its children selectable
  - `<NonSelectableContainer>` - Makes its children non-selectable

#### Example Usage

```tsx
import { SelectableText, NonSelectableContainer } from './components/ui';

// In your component:
<NonSelectableContainer className="p-4 rounded-lg bg-gray-800">
  <h2>Card Title</h2>
  <SelectableText>
    This text will be selectable even though it's within a non-selectable container
  </SelectableText>
</NonSelectableContainer>
```

## Technology Stack

- Frontend: React, TypeScript, Tailwind CSS
- Backend: Node.js, Express
- Database: Firebase Firestore
- Authentication: Firebase Authentication
- Storage: Firebase Storage

## Environment Variables

This project uses environment variables for secure management of API keys and other sensitive configuration.

1. Copy `.env.example` to a new file named `.env`
2. Fill in the required values for your Firebase project and other services
3. **IMPORTANT:** Never commit the `.env` file to version control

For detailed information about secrets management, see [SECRETS_MANAGEMENT.md](./docs/SECRETS_MANAGEMENT.md).

## Security Configuration

For proper security setup, please refer to [SECURITY_SETUP.md](./SECURITY_SETUP.md) before proceeding with installation. This contains critical information on:

- Setting up Firebase service account credentials securely
- Managing API keys and sensitive information
- Security best practices for development and deployment

## Setup Instructions

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)
- Firebase account

### Frontend Setup

1. Install dependencies:
   ```
   cd academic-social-platform
   npm install
   ```

2. Create a `.env` file in the root directory with your Firebase configuration:
   ```
   REACT_APP_FIREBASE_API_KEY=your-api-key
   REACT_APP_FIREBASE_AUTH_DOMAIN=your-auth-domain
   REACT_APP_FIREBASE_PROJECT_ID=your-project-id
   REACT_APP_FIREBASE_STORAGE_BUCKET=your-storage-bucket
  # REACT_APP_FIREBASE_MESSAGING_SENDER_ID removed (Firebase Cloud Messaging not used)
   REACT_APP_FIREBASE_APP_ID=your-app-id
   ```

3. Start the frontend development server:
   ```
   npm start
   ```

### Backend Setup

1. Install dependencies:
   ```
   cd server
   npm install
   ```

2. Create a `serviceAccountKey.json` file in the server directory with your Firebase Admin SDK credentials. You can download this from your Firebase project settings.

3. Start the backend server:
   ```
   cd server
   npm run dev
   ```

## Running the Application

1. Start the backend server:
   ```
   cd server
   npm run dev
   ```

2. In a separate terminal, start the frontend:
   ```
   npm start
   ```

3. Access the application at `http://localhost:3000`

## Firebase Migration

This application has been migrated from using local JSON storage to Firebase. The migration includes:

1. User authentication with Firebase Auth
2. Data storage with Firestore
3. Media storage with Firebase Storage
4. Real-time updates

## Sample Users

For testing purposes, you can use the following accounts:

- **Student**:
  - Email: student@bulsu.edu.ph
  - Password: password123
  - ID: S-123456

- **Faculty**:
  - Email: faculty@bulsu.edu.ph
  - Password: password123
  - ID: F-123456

- **Alumni**:
  - Email: alumni@bulsu.edu.ph
  - Password: password123
  - ID: A-123456

## Folder Structure

- `/src` - Frontend source code
  - `/components` - React components
  - `/contexts` - Context providers
  - `/firebase` - Firebase configuration and services
  - `/services` - API services
  - `/types` - TypeScript type definitions
- `/server` - Backend code
  - `/routes` - API routes
  - `/scripts` - Utility scripts

## License

This project is for educational purposes only.

---

## System Design & Defense Q&A

This section answers the comprehensive evaluation questions about BulSU Space.

### A. System Purpose and Scope
1. Problems solved vs MS Teams / Gmail / Facebook:
  - Unified academic social feed blending announcements, events, peer interaction, and moderated discussions (Teams is course/meeting centric, Facebook lacks academic governance, Gmail is asynchronous and non-social).
  - Role‑aware visibility (students, faculty, alumni, admins, super admins) embedded in Firestore rules; mainstream platforms cannot enforce campus‑specific academic roles at content level.
  - Real‑time presence (online/away/offline with connection quality) and activity auditing for academic integrity & moderation—missing in Gmail/Facebook academically.
  - Fine‑grained moderation + security telemetry (login_attempts, account_locks, admin_actions) to handle abuse, lockouts, revoked users.
  - Integrated groups & academic events plus job openings in one interface, reducing fragmentation among multiple tools.
  - Privacy & data locality: Firestore rules restrict write paths; no advertising / external data mining typical of public social networks.
2. Target users & design accommodations:
  - Students: Infinite scrolling feed, messaging, groups, events, lightweight presence. Optimized for fast reload with sessionStorage pre‑hydration.
  - Faculty: Ability to post announcements, manage groups, moderate comments/reactions (rules allow privileged deletions), and track faculty access requests.
  - Admins/Super Admins: Elevated Firestore rule overrides, user deletion endpoint, security monitoring routes (/api/auth/security/*), lockout management, scheduled cleanup tasks, revoked user auto‑deletion.
  - Alumni: Continued networking & job openings (`job_openings` collection & provider context).
  - Accessibility/performance: Offline Firestore cache, reduced presence write frequency, debounced navigation loops.
3. Identified limitations:
  - Temporary overly permissive read rule (`match /{document=**} allow read: if true;`) used for troubleshooting—needs tightening.
  - No grades or deeply sensitive academic records implemented; schema not yet extended to transcript data.
  - Last‑write‑wins concurrency (limited transactional logic); no optimistic conflict UI.
  - Presence heartbeat could become costly at very large scale without adaptive throttling.
  - Inconsistent field naming (`user_id` vs `userId`) adds maintenance friction.
  - Limited automated test coverage and no formal backup script in repo.
  - Vendor lock‑in (Firebase); migration abstraction minimal.

### B. Database and Data Management
4. Schema design (document & subcollection oriented): Key entities: users, posts (sub: comments, reactions, likes), spacePosts, groups, group_posts, group_members, chats, messages, notifications, friendRequests, friends, events, acadCalendar, job_openings, reports, faculty_access_requests, faculty_request_history, tutorial_status, device, login_attempts, account_locks, admin_actions, activity_logs. Emphasis on:
  - Denormalization for feed rendering (user snapshot fields in post docs).
  - Subcollections for high‑cardinality (comments, reactions) to isolate hot paths.
  - Security segmentation via path‑based Firestore rules.
5. Handling sensitive info:
  - Passwords managed by Firebase Auth (Google‑managed hashing/salting; no plaintext stored).
  - Personal fields (email, idNumber) protected by Firestore rules; HTTPS/TLS in transit; Firebase encryption at rest.
  - Helmet + CSP + XSS middleware reduce exposure of PII via reflected attacks.
  - No grades stored yet; bcrypt dependency exists server‑side (reserved for potential future hashing tasks) but current credential handling defers to Firebase.
  - Session tokens not persisted long‑term (session persistence chosen over local by default).
6. Scaling to 50k students:
  - Firestore automatic sharding; rely on indexed queries (add composite indexes for combined filters).
  - Pagination & infinite scroll (react-window) limit read volume.
  - Use FieldValue.increment for counters to avoid read‑modify‑write loops.
  - Presence intervals already optimized (10–30s); could add adaptive backoff for idle users.
  - Offload heavy aggregation (future: Cloud Functions / Firestore event triggers) and TTL/archival for login_attempts & activity_logs.

### C. Technical Implementation
7. Technology choices rationale:
  - React + TypeScript: Component modularity, static typing reduces runtime errors, ecosystem maturity.
  - Firebase (Auth, Firestore, RTDB, Storage): Managed real‑time & auth; minimized ops; RTDB chosen specifically for low‑latency presence.
  - Express server: Security middleware layering, custom lockout logic, administrative endpoints, potential future integration hub.
  - Tailwind + MUI + Headless UI: Rapid consistent UI + accessible primitives; mix of utility-first and component library for velocity.
  - Socket.io (planned / signaling server) for future real‑time features beyond Firestore (e.g., WebRTC signaling).
8. Authentication flow (student login example):
  - Client pre-login: optional `/api/auth/pre-login-check` for lockout status.
  - Firebase `signInWithEmailAndPassword` executed client-side; session flags `isAuthenticating` set.
  - On success: Firestore `users/{uid}` fetched, user object cached in sessionStorage (instant reload resilience).
  - Presence initialization (RTDB status doc + connection tracking).
  - Client posts `/api/auth/login-result` with success for audit + lockout counter reset; server records attempt, updates lock state collections.
  - Scheduled token refresh every 30 min; failure thresholds trigger sign-out.
9. Security issue mitigation:
  - SQL Injection: Not applicable (No SQL / parameterized SDK calls only).
  - XSS: DOMPurify library for rich text; Helmet sets security headers; custom CSP with nonces; server sanitization middlewares (xssProtection, no sniff, frameguard); `reflectedDownloadProtection` and parameter pollution prevention.
  - CSRF/cookie scope: CORS whitelist & credential scoping; tokens usually in headers (Bearer) not cookies.
  - Rate limiting & slow down defeat brute force (authLimiter + speedLimiter + custom lockout).
  - Firestore rules enforce per-document authorization; restricted update fields diff checks.
10. Layered architecture:
  - Presentation (React components/pages + contexts) ↔ Service layer (authService, presenceService, jobService) ↔ Backend API (Express routes for auth/posts/users/email/moderation) ↔ Data (Firestore/RTDB/Storage via Firebase SDK & firebase-admin on server). Server augments security & admin tasks, but many CRUD ops go direct from client to Firestore under rules.

### D. Features and Functionality
11. Real-time updates:
  - Firestore snapshot listeners for posts, comments, messages, notifications.
  - Realtime Database for presence & heartbeat fields.
  - Potential Socket.io signaling (signaling-server.js) for future peer features (e.g., live collaboration / calls).
12. Concurrent updates:
  - Firestore last-write-wins; atomic increments for counters reduce race conditions.
  - Rules restrict specific field updates (e.g., allow only reactionCount/commentCount changes) to limit conflict surface.
  - Future enhancement: batched writes / transactions for multi-document invariants.
13. Offline access:
  - Firestore multi-tab persistence enables cached reads & queued writes offline.
  - Presence & server-only security endpoints require online state; presence degrades gracefully.
  - Messaging/history readable from cache; new messages delayed until reconnection.

### E. Scalability and Maintenance
14. University-wide multi-campus scaling:
  - Introduce campus or org partition key in user/posts/groups documents; composite indexes for campus-scoped queries.
  - Potential multi-tenant Firestore structure: `/campuses/{campusId}/posts/*` for isolation, or separate Firebase projects per region if compliance requires.
  - Deploy CDN caching for static build; scale Express behind load balancer or convert admin/API to Cloud Functions.
15. Backup & recovery strategy:
  - Firebase provides replication & point-in-time restore (if enabled via backups/exports); recommended scheduled export using Cloud Scheduler + gcloud firestore export to GCS (future script).
  - Daily/weekly export of security-critical collections (users, posts metadata, login_attempts) plus Storage object lifecycle rules.
16. Maintainability:
  - TypeScript types centralize contracts; context separation clarifies concerns.
  - Documentation: `docs/` (security, MFA fingerprinting, flows), `flow/` (LOGIN_FLOW.md, POSTING_FLOW.md, etc.).
  - Need: stronger lint/test enforcement and naming consistency refactor; overall code organized for incremental onboarding.

### F. Testing and Evaluation
17. Testing performed:
  - Unit/component: React Testing Library (deps in root `package.json`).
  - Scripted manual tests: `test-*.js` & presence/debug HTML pages for auth/presence/reactions.
  - Security scenario scripts (e.g., `debug-auth-presence-flow.js`, server security-check routes) used for manual penetration-style checks.
  - Load/behavioral: Simplified scanning scripts (`server/quick-scan.js`, `comprehensive-scan.js`).
18. Common bugs & resolutions:
  - Auth redirect loops → Added NavigationGuard + timestamp gating.
  - Stale session after logout → Introduced `intentionalLogout` flag & logout timestamp checks.
  - Presence flapping / excessive writes → Tuned intervals, sequence tokens, debounced activity updates.
  - Firestore rule mismatches (write denials) → Adjusted diff-based allowedKeys logic.
  - Inconsistent field names causing missing data in UI → Began gradual normalization plan (still pending full cleanup).
19. Feedback collection:
  - Pilot usage with representative student/faculty accounts (simulated via seeded test users) observing usage logs (activity_logs, login_attempts) & manual interviews (process external to repo).
  - Faculty access request flow provided qualitative input on onboarding friction.
  - NOTE: No formal automated feedback form yet—future enhancement.

### G. Future Improvements
20. Planned/desired features:
  - Tightened Firestore read rules (remove global allow read), field-level encryption for sensitive PII.
  - Campus-wide analytics dashboard & moderation queue with AI-assisted classification.
  - Offline-first messaging with local queueing & conflict resolution.
  - Push notifications (FCM) & email digest summaries.
  - Role-based scheduled announcements, polls, LMS-grade integration.
  - Plugin architecture for departmental modules (e.g., library, registrar, internship portal).
21. Integration strategy with official systems:
  - SSO via SAML/OAuth2 bridging institutional identity provider → map claims to roles.
  - Secure REST or Pub/Sub bridge: Cloud Functions that consume registrar/student portal events to sync enrollment (auto group membership, course announcements).
  - Webhooks for status changes; nightly reconciliation job for enrollment/roles.
  - Use signed service account credentials stored in secret manager; adopt event-driven ingestion to keep Firestore normalized caches current.

### Assumptions & Transparency
Where repository code was silent (e.g., exact feedback channels, future deployment specifics), answers note intentions or recommended patterns rather than claiming completed implementation.

---
