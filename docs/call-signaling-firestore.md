# Video-call signaling (Firestore)

The video-call flow uses **Firestore** as the signaling channel for WebRTC (offer/answer/ICE). Core logic lives in `src/logic/CallProvider.tsx` and `src/logic/callSignalingFirestore.ts`.

## Firestore document structure

- **Collection:** `calls`
- **Document ID:** `callerUid` (one active call per caller)

**Document fields:**

| Field      | Type   | Description                          |
|-----------|--------|--------------------------------------|
| `caller`  | string | UID of the user who started the call |
| `callee`  | string | UID of the user being called         |
| `status`  | string | `'calling'` \| `'oncall'` \| `'decline'` \| `'timeout'` |
| `offer`   | map    | Optional; `{ type, sdp }` (SDP offer from caller) |
| `answer`  | map    | Optional; `{ type, sdp }` (SDP answer from callee) |
| `updatedAt` | number | Optional; timestamp (ms)             |

**Subcollections (ICE candidates):**

- `calls/{callerUid}/callerCandidates/{docId}` — each doc = one ICE candidate (fields from `RTCIceCandidate.toJSON()`).
- `calls/{callerUid}/calleeCandidates/{docId}` — same for callee.

Security: read/write allowed only when `request.auth.uid` is the document’s `caller` or `callee`. See `firestore.rules` for the full `match /calls/...` block.

## Connection flow (checks to pass)

1. **getUserMedia OK** → caller gets local stream before writing anything.
2. **Caller:** write `calls/{callerUid}` with `caller`, `callee`, `status: 'calling'`; create `RTCPeerConnection`, add tracks, create offer, then **send offer** (write `offer` to Firestore).
3. **Callee:** sees incoming call (e.g. `watchIncomingCalls`), presses Accept → **getUserMedia** → then **markOnCall** (update `status: 'oncall'`).
4. **Remote receives offer** → callee creates PC, sets remote description from offer, creates answer, **sends answer** (write `answer` to Firestore).
5. **Local receives answer** → caller sets remote description from answer.
6. **ICE candidates exchanged** via `callerCandidates` and `calleeCandidates` subcollections.
7. **ontrack** fires on both sides when remote media arrives.
8. **UI becomes Connected** only when both (a) `iceConnectionState` is `connected` or `completed`, and (b) at least one remote track has been received (ontrack fired). See `CallProvider` `createPeer` and `checkConnected`.

If one user accepts late or has a slow network, the connection should still succeed; after a reasonable retry period (see `CONNECTING_TIMEOUT_MS` and signaling retries in `callSignalingFirestore.ts`), the UI shows a clear error and the call ends.

## Manual verification steps

1. **Two browsers (or one incognito + one normal):** log in as two different users (e.g. from Messaging).
2. **Caller:** start a video call to the other user. Confirm:
   - Camera/mic permission requested and granted.
   - “Calling…” appears; no remote video yet.
3. **Callee:** accept the call. Confirm:
   - “Connecting…” appears; then “Connected” and timer only after both see remote video (or at least one remote track + ICE connected).
4. **Both:** verify two-way audio/video; hang up and confirm “Call ended” and cleanup.
5. **Late accept:** caller starts call, callee waits ~10s then accepts — connection should still establish or show a clear error after the connecting timeout.
6. **Decline:** caller starts, callee declines — caller sees “Call was declined”.
7. **Visibility:** during a call, switch tab or minimize (visibility hidden) — call should clean up (optional behavior; see `CallProvider` visibility listener).

## Unit / integration test examples

- **Signaling helpers:** mock Firestore and assert `writeCallingRecord`, `writeOffer`, `writeAnswer` write the expected `calls/{callerUid}` shape; assert `waitForOffer` retries and resolves when `offer` appears.
- **CallProvider (integration):** with a fake Firestore and fake `RTCPeerConnection`/`getUserMedia`, run “start call” then “accept” and assert state moves to `phase: 'connected'` only after both ICE connected and ontrack fired; assert cleanup on `endCall` (no duplicate listeners, PC closed, tracks stopped).
- **Guards:** `validateCallTargetFirestore` returns an error when the target is already in a call (e.g. existing `calls` doc where target is caller or callee).

Example (pseudo) for signaling:

```ts
// Example: test that writeOffer writes the expected structure
await writeOffer('caller-uid', { type: 'offer', sdp: 'v=0...' });
const snap = await getDoc(doc(db, 'calls', 'caller-uid'));
expect(snap.data().offer).toEqual({ type: 'offer', sdp: 'v=0...' });
```

Example for connection gating:

```ts
// Simulate ICE connected then ontrack; assert CONNECTED only after both
// (mock pc.iceConnectionState = 'connected', then fire ontrack, then expect dispatch CONNECTED)
```
