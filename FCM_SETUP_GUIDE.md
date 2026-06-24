# Firebase Cloud Messaging (FCM) Setup Guide

## ✅ What's Been Implemented

The push notification system has been successfully added to your project without affecting any existing functionality.

### New Files Created:
- ✅ `src/services/fcmTokenService.ts` - FCM token management
- ✅ Updated `src/firebase/config.ts` - FCM initialization
- ✅ Updated `src/contexts/NotificationContext.tsx` - FCM integration
- ✅ Updated `public/firebase-messaging-sw.js` - Service worker with FCM support

### Existing Files (Unchanged):
- ✅ `src/services/notificationService.ts` - Already exists
- ✅ `src/services/notificationTriggers.ts` - Already exists
- ✅ `functions/src/index.ts` - Cloud Function already exists

---

## 🔧 Required Setup Steps

### Step 1: Add Environment Variables

Add these to your `.env` file:

```bash
# Firebase Messaging Configuration
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=842036796128
REACT_APP_FIREBASE_MESSAGING_VAPID_KEY=YOUR_VAPID_KEY_HERE
```

### Step 2: Generate VAPID Key

1. Go to Firebase Console: https://console.firebase.google.com
2. Select your project: **bulsuspace**
3. Navigate to: **Project Settings** → **Cloud Messaging** tab
4. Under **Web Push certificates**, click **Generate key pair**
5. Copy the generated key
6. Paste it in your `.env` file as `REACT_APP_FIREBASE_MESSAGING_VAPID_KEY`

**Example:**
```bash
REACT_APP_FIREBASE_MESSAGING_VAPID_KEY=BKxyz123abc...your-actual-key-here
```

### Step 3: Deploy Cloud Function (If Not Already Deployed)

The Cloud Function `sendNotificationOnCreate` already exists in `functions/src/index.ts`.

If not deployed yet:

```bash
cd functions
npm install
firebase deploy --only functions:sendNotificationOnCreate
```

### Step 4: Create Firestore Indexes

The system needs these Firestore indexes:

```json
{
  "indexes": [
    {
      "collectionGroup": "notifications",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "clientTimestamp", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "notifications",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "type", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "notifications",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "read", "order": "ASCENDING" }
      ]
    }
  ]
}
```

Deploy indexes:
```bash
firebase deploy --only firestore:indexes
```

### Step 5: Restart Development Server

After adding environment variables:

```bash
npm start
```

---

## 🧪 Testing the Implementation

### Test 1: Check FCM Initialization

1. Open browser console
2. Login to the app
3. Look for these logs:
   - `[Firebase Config] FCM initialized`
   - `[FCM] Service worker registered`
   - `[FCM] Token registered successfully`

### Test 2: Grant Notification Permission

When you login, the browser will ask for notification permission. Click **Allow**.

### Test 3: Verify Token Storage

1. Go to Firebase Console → Firestore Database
2. Check the `fcmTokens` collection
3. You should see a document with your userId containing:
   - `token`: FCM token string
   - `platform`: "web"
   - `updatedAt`: timestamp
   - `userAgent`: browser info

### Test 4: Trigger a Notification

Create a test notification in Firestore manually:

```javascript
// In Firebase Console → Firestore → notifications collection
{
  userId: "YOUR_USER_ID",
  type: "message",
  message: "Test push notification",
  relatedId: "test123",
  timestamp: [current timestamp],
  clientTimestamp: Date.now(),
  read: false
}
```

You should:
- See a browser notification (if tab is not focused)
- Hear a notification sound
- See it in the notifications list

### Test 5: Background Notifications

1. Login to the app
2. Minimize or switch to another tab
3. Create a notification (as in Test 4)
4. You should see a system notification pop up

---

## 🔍 Troubleshooting

### Issue: "VAPID key not configured" error

**Solution:** Add `REACT_APP_FIREBASE_MESSAGING_VAPID_KEY` to your `.env` file

### Issue: "Messaging not supported in this environment"

**Possible causes:**
- Not using HTTPS (required for service workers)
- Browser doesn't support service workers
- Running in incognito/private mode

**Solution:** Use HTTPS or localhost (both work)

### Issue: No notifications appearing

**Check:**
1. Browser notification permission is granted
2. FCM token is stored in Firestore (`fcmTokens` collection)
3. Cloud Function is deployed
4. Firestore indexes are created
5. Check browser console for errors

### Issue: Service worker not registering

**Solution:**
1. Clear browser cache
2. Unregister old service workers:
   - Chrome DevTools → Application → Service Workers → Unregister
3. Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

### Issue: Notifications work in foreground but not background

**Check:**
1. Service worker is active (Chrome DevTools → Application → Service Workers)
2. Firebase config in `public/firebase-messaging-sw.js` matches your project
3. Browser console in service worker scope for errors

---

## 📊 How It Works

### Flow Diagram:

```
1. User logs in
   ↓
2. FCM token is registered
   ↓
3. Token stored in Firestore (fcmTokens/{userId})
   ↓
4. When notification is created in Firestore:
   ↓
5. Cloud Function triggers (sendNotificationOnCreate)
   ↓
6. Function fetches FCM token
   ↓
7. Sends push notification via FCM
   ↓
8. Client receives notification:
   - If app is open: Foreground handler → Sound + In-app notification
   - If app is closed: Service worker → System notification
```

### Notification Types Supported:

- `message` - Direct messages
- `message_request` - Message requests
- `reaction` - Post reactions
- `comment` - Post comments
- `announcement` - Admin announcements
- `space_post` - Space posts
- `friend_post` - Friend posts
- `warn` - Admin warnings
- `takedown` - Post takedowns

---

## 🎯 Features Included

✅ **Automatic token registration** on login  
✅ **Token cleanup** for invalid/expired tokens  
✅ **Foreground notifications** with custom sounds  
✅ **Background notifications** via service worker  
✅ **Smart notification display** (no duplicates when app is open)  
✅ **Click handling** (navigates to /notifications)  
✅ **Sound deduplication** (won't play same notification twice)  
✅ **Grouped notifications** (multiple reactions/comments merged)  
✅ **Browser notification API** integration  
✅ **Offline support** (Firestore persistence)  

---

## 🚀 Next Steps (Optional Enhancements)

1. **Add notification preferences UI** - Let users customize which notifications they receive
2. **Add quiet hours** - Don't send notifications during certain times
3. **Add notification batching** - Group multiple notifications
4. **Add rich notifications** - Include images, action buttons
5. **Add analytics** - Track notification delivery rates
6. **Add retry logic** - Retry failed FCM sends

---

## 📝 Important Notes

1. **Service Worker Config:** The Firebase config in `public/firebase-messaging-sw.js` is hardcoded because service workers can't access environment variables. If you change Firebase projects, update this file.

2. **HTTPS Required:** Push notifications require HTTPS in production. Localhost works for development.

3. **Browser Support:** FCM works in Chrome, Firefox, Edge, Opera. Safari has limited support.

4. **Token Refresh:** FCM tokens can expire. The system automatically handles this.

5. **Rate Limits:** Firebase has rate limits. For high-volume apps, consider batching.

---

## ✅ Verification Checklist

Before going to production:

- [ ] VAPID key added to `.env`
- [ ] Cloud Function deployed
- [ ] Firestore indexes created
- [ ] Service worker registered successfully
- [ ] FCM tokens being stored in Firestore
- [ ] Test notifications working (foreground)
- [ ] Test notifications working (background)
- [ ] Notification sounds playing
- [ ] Click handling working (navigates to /notifications)
- [ ] No console errors
- [ ] HTTPS enabled in production

---

## 🆘 Support

If you encounter issues:

1. Check browser console for errors
2. Check Cloud Function logs in Firebase Console
3. Verify Firestore security rules allow token writes
4. Test in incognito mode to rule out cache issues
5. Check that all environment variables are set

---

**Implementation Date:** 2025-10-10  
**Version:** 3.2.1  
**Status:** ✅ Ready for testing
