# Environment Variables for FCM

Add these to your `.env` file:

```bash
# ============================================
# Firebase Cloud Messaging (FCM) Configuration
# ============================================

# Messaging Sender ID (already in your Firebase config)
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=842036796128

# VAPID Key - Generate this from Firebase Console
# Go to: Firebase Console → Project Settings → Cloud Messaging → Web Push certificates → Generate key pair
REACT_APP_FIREBASE_MESSAGING_VAPID_KEY=YOUR_VAPID_KEY_HERE

```

## How to Get Your VAPID Key:

1. Open Firebase Console: https://console.firebase.google.com
2. Select project: **bulsuspace**
3. Click the gear icon → **Project Settings**
4. Go to **Cloud Messaging** tab
5. Scroll to **Web Push certificates** section
6. Click **Generate key pair** button
7. Copy the generated key (starts with "B...")
8. Replace `YOUR_VAPID_KEY_HERE` with your actual key

## Example:

```bash
REACT_APP_FIREBASE_MESSAGING_VAPID_KEY=BKxyz123abc456def789ghi012jkl345mno678pqr901stu234vwx567yza890bcd123efg456hij789klm012nop345qrs678tuv901wxy234zab567cde890fgh123
```

**Note:** The VAPID key is a long string starting with "B" and is about 88 characters long.

---

## Real-time Call Signaling

If you need voice or video calling while developing locally, point the client to a reachable Socket.IO signaling host. Add the following variables to `.env.local`:

```bash
# Primary signaling endpoint used by callService
REACT_APP_SOCKET_SERVER_URL=https://your-dev-signal-server.example.com

# Optional fallback (still opt-in to avoid unexpected CORS noise)
REACT_APP_SOCKET_SERVER_FALLBACK_URL=https://your-secondary-signal-server.example.com
```

- Omit `REACT_APP_SOCKET_SERVER_URL` to keep the default `http://localhost:3001` used by the local signaling server.
- Omit the fallback variable unless you truly have a second server; leaving it empty prevents the app from spamming unreachable hosts (the source of the previous CORS errors).
