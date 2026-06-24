/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import { setGlobalOptions } from "firebase-functions";
import * as logger from "firebase-functions/logger";
import { onDocumentCreated, onDocumentDeleted } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import generateMFA_Code from "./utils/generateMFA_Code.js";
import { Resend } from "resend";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { onCall, onRequest, CallableRequest, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import axios from "axios";
import { sendMailGraph } from "./utils/msMailSender.js";
import { getAuth } from "firebase-admin/auth";
import generateResetPasswordToken from "./utils/generateResetPasswordToken.js";
import getSpecialUserMFAEmail from "./utils/getSpecialUserMFAEmail.js";
import crypto from "crypto";
import passwordStrength from "./utils/passwordStrength.js";
import { sendMailNodemailer } from "./utils/googleMailSender.js";
import { forgotPasswordHTML, mfaEmailHTML, newAccountEmailHTML, alumniInviteEmailHTML } from "./utils/emailHTML.js";
import { writeBatch, arrayUnion } from "firebase/firestore";
import { FieldValue } from "firebase-admin/firestore";
import userLocked from "./utils/userLocked.js";
import requestAttempt from "./utils/requestAttempt.js";
import { defineSecret, defineString } from "firebase-functions/params";

const resend = new Resend(process.env.RESEND_API_KEY);

initializeApp();
const db = getFirestore();

const REPORT_REASON_LABELS: Record<string, string> = {
  inappropriate: "Inappropriate content",
  spam: "Spam or misleading",
  harassment: "Harassment or bullying",
  hate_speech: "Hate speech",
  violence: "Violence or dangerous behavior",
  intellectual_property: "Intellectual property violation",
  other: "Other reason",
};

const ALLOWED_REPORT_REASONS = new Set(Object.keys(REPORT_REASON_LABELS));

const ORIGIN_WHITELIST = ["http://localhost:3000", "https://bulsuspace.web.app", "https://bulsuspace.com"];
const ALUMNI_CREATION_LINK = "https://bulsuspace.web.app/alumnicreation";

const sanitizeNameInput = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").replace(/[^A-Za-zÀ-ÖØ-öø-ÿ.' -]/g, "").trim();
};

const titleCaseName = (value: string): string => {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};

const sanitizeStudentNumber = (value?: string): string | null => {
  if (!value) return null;
  const cleaned = value.replace(/[^A-Za-z0-9-]/g, "").toUpperCase().trim();
  return cleaned.length >= 4 ? cleaned : null;
};

const randomAlphaNumeric = (length: number): string => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
};

const generateAlumniPassword = (): string => {
  return `@BSAlu${randomAlphaNumeric(3)}${Math.floor(1000 + Math.random() * 9000)}`;
};

const generateGuestPassword = (): string => {
  return `@BSGuest${randomAlphaNumeric(4)}${Math.floor(100 + Math.random() * 900)}`;
};

const encodeEmailForDocId = (email: string): string => {
  return Buffer.from(email.toLowerCase()).toString("base64").replace(/\//g, "_").replace(/\+/g, "-");
};

const ensureUniqueIdNumber = async (preferred?: string): Promise<string> => {
  const candidate = preferred ? preferred.toUpperCase() : null;
  if (candidate) {
    const existing = await db.collection("users").where("idNumber", "==", candidate).limit(1).get();
    if (existing.empty) return candidate;
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    const autoId = `ALU-${Math.floor(100000 + Math.random() * 900000)}`;
    const clash = await db.collection("users").where("idNumber", "==", autoId).limit(1).get();
    if (clash.empty) return autoId;
  }
  throw new HttpsError("resource-exhausted", "Unable to allocate a unique alumni ID. Please try again later.");
};

const ensureUniqueGuestId = async (): Promise<string> => {
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = `GST-${Math.floor(100000 + Math.random() * 900000)}`;
    const existing = await db.collection("users").where("idNumber", "==", candidate).limit(1).get();
    if (existing.empty) {
      return candidate;
    }
  }
  throw new HttpsError("resource-exhausted", "Unable to allocate a guest ID. Please try again later.");
};

const sanitizeEmailLocalPart = (value: string): string => {
  return (value || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
};

const applyCorsHeaders = (req: any, res: any) => {
  const origin = req.get?.('Origin') || req.headers?.origin || '';
  if (origin && ORIGIN_WHITELIST.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
  }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Vary', 'Origin');
};

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

// Initialize Admin SDK
try {
  admin.initializeApp();
} catch (e) {
  // no-op if already initialized
}

type HuggingFaceResult = Array<Array<{ label: string; score: number }>>;

const huggingFaceApiKey = defineSecret("HUGGINGFACE_API_KEY");
const huggingFaceModelId = defineString("HUGGINGFACE_MODEL_ID", {
  default: "unitary/toxic-bert",
});
const huggingFaceThreshold = defineString("HUGGINGFACE_THRESHOLD", {
  default: "0.7",
});

type ContentModerationResult = {
  flagged: boolean;
  reason?: string;
  skipped?: boolean;
};

const callHuggingFaceModeration = async (rawText: string): Promise<ContentModerationResult> => {
  if (!rawText) {
    return { flagged: false, reason: "AI moderation skipped (no content)", skipped: true };
  }

  const apiKey = process.env.HUGGINGFACE_API_KEY
    || process.env.HF_API_KEY
    || process.env.HUGGING_FACE_API_KEY
    || process.env.HF_TOKEN
    || huggingFaceApiKey.value();

  if (!apiKey) {
    logger.warn("Hugging Face API key not configured; moderation disabled.");
    return { flagged: false, reason: "AI moderation skipped (not configured)", skipped: true };
  }

  const model = process.env.HUGGINGFACE_MODEL_ID
    || huggingFaceModelId.value()
    || "unitary/toxic-bert";
  const thresholdRaw = process.env.HUGGINGFACE_THRESHOLD
    || huggingFaceThreshold.value()
    || "0.7";
  const threshold = Number(thresholdRaw) || 0.7;
  const toxicLabels = ["toxicity", "toxic", "obscene", "insult", "hate", "threat"];

  try {
    const response = await axios.post<HuggingFaceResult>(
      `https://api-inference.huggingface.co/models/${model}`,
      { inputs: rawText },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      },
    );

    const predictions = Array.isArray(response.data) && response.data.length > 0 ? response.data[0] : [];

    if (!Array.isArray(predictions)) {
      return { flagged: false, reason: "AI moderation skipped (unexpected response)", skipped: true };
    }

    for (const result of predictions) {
      const label = result?.label?.toLowerCase?.() || "";
      const score = typeof result?.score === "number" ? result.score : 0;
      if (score > threshold && toxicLabels.some((candidate) => label.includes(candidate))) {
        return { flagged: true, reason: `Content flagged as ${result.label}` };
      }
    }

    return { flagged: false };
  } catch (error: any) {
    const status = error?.response?.status;
    const errorMessage = error?.response?.data?.error || error?.message || String(error);

    if (status === 503) {
      logger.warn("Hugging Face model loading", { model });
      return { flagged: false, reason: "AI moderation skipped (model loading)", skipped: true };
    }

    if (status === 429) {
      logger.warn("Hugging Face rate limited", { model });
      return { flagged: false, reason: "AI moderation skipped (rate limited)", skipped: true };
    }

    logger.error("Hugging Face moderation error", { status, error: errorMessage });
    return { flagged: false, reason: "AI moderation skipped (error occurred)", skipped: true };
  }
};

/**
 * Callable function that proxies Hugging Face moderation to avoid exposing the API key
 * and bypass browser-side CORS restrictions.
 */
export const moderateContent = onCall(
  {
    region: "us-central1",
    cors: ["http://localhost:3000", "https://bulsuspace.web.app"],
    secrets: [huggingFaceApiKey],
  },
  async (request: CallableRequest<{ text?: string }>) => {
  const rawText = typeof request.data?.text === "string" ? request.data.text.trim() : "";
  return callHuggingFaceModeration(rawText);
  },
);

/**
 * Firestore trigger: moderate every newly created post server-side.
 * This keeps posting fast on the client and resilient even if the page closes.
 */
export const moderatePostOnCreate = onDocumentCreated(
  {
    document: "posts/{postId}",
    region: "us-central1",
    secrets: [huggingFaceApiKey],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const post = snap.data() as any;
    const postId = event.params.postId as string;
    const content = typeof post?.content === "string" ? post.content.trim() : "";

    if (!content) return;

    const authorId = typeof post?.authorId === "string"
      ? post.authorId
      : (typeof post?.userId === "string" ? post.userId : null);

    try {
      const result = await callHuggingFaceModeration(content);

      if (!result.flagged) return;

      await snap.ref.update({
        flagged: true,
        flagReason: result.reason || "Inappropriate content detected",
        visible: false,
        moderationTimestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (!authorId) return;

      await admin.firestore()
        .collection("notifications")
        .add({
          userId: authorId,
          type: "post_flagged",
          message: `Your post was removed: ${result.reason || "Inappropriate content detected"}`,
          relatedId: postId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    } catch (err: any) {
      logger.error("[Moderation] Failed for post", {
        postId,
        error: err?.message || String(err),
      });

      await snap.ref.set(
        {
          pendingManualReview: true,
          moderationError: true,
          moderationTimestamp: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  },
);

/**
 * Firestore trigger (v2): send FCM when a new notification is created.
 * Path: notifications/{notificationId}
 * Expects: {userId, type, message, relatedId?}
 * Looks up token in fcmTokens/{userId}
 */
export const sendNotificationOnCreate = onDocumentCreated(
  "notifications/{notificationId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const notification = snap.data() as any;
    const notificationId = event.params.notificationId as string;

    const userId = notification?.userId as string | undefined;
    if (!userId) {
      logger.warn("Notification missing userId", { notificationId });
      return;
    }

    try {
      // Read token
      const tokenDoc = await admin
        .firestore()
        .collection("fcmTokens")
        .doc(userId)
        .get();
      if (!tokenDoc.exists) {
        logger.info("No FCM token for user", { userId });
        return;
      }
      const fcmToken = (tokenDoc.data() || {}).token as
        | string
        | undefined;
      if (!fcmToken) {
        logger.info("Empty FCM token for user", { userId });
        return;
      }

      // Compose WebPush notification
      const title = "BulSUSpace";
      const body = notification?.message || "You have a new notification";
      // Default URL opens notifications center.
      // For moderation notifications, deep-link to the related post by default,
      // and only route to flares when explicitly tagged as flare.
      const type = notification?.type || "general";
      const relatedId = notification?.relatedId || "";
      let url = "/notifications";
      try {
        const entityType = notification?.extra?.entityType || notification?.entityType || null;
        if (relatedId && entityType === 'flare') {
          // Append a deepLink query param so clients can reliably detect navigation came from a push
          url = `/flares/${String(relatedId)}?deepLink=1`;
        } else if (relatedId && (type === 'warn' || type === 'takedown')) {
          // Post moderation notifications should open the warned/taken-down post in feed
          url = `/home?highlight=${encodeURIComponent(String(relatedId))}`;
        }
      } catch (e) {
        // ignore and fall back to /notifications
      }

      const message: admin.messaging.Message = {
        token: fcmToken,
        notification: { title, body },
        data: {
          notificationId,
          userId,
          type: String(type),
          relatedId: String(relatedId),
          url,
        },
        webpush: {
          fcmOptions: { link: url },
          notification: {
            icon: "/images/bulsu-space-logo.png",
            badge: "/images/bulsu-space-logo.png",
            tag: "bulsuspace",
            vibrate: [100, 50, 100],
          },
        },
      };

      const response = await admin.messaging().send(message);
      logger.info("FCM sent", { notificationId, response });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      logger.error("Error sending FCM", { notificationId, error: errorMsg });
      // Clean up invalid tokens
      const code = error?.code || error?.errorInfo?.code;
      const invalidCodes = [
        "messaging/invalid-registration-token",
        "messaging/registration-token-not-registered",
      ];
      if (invalidCodes.includes(code)) {
        try {
          await admin.firestore().collection("fcmTokens").doc(userId).delete();
          logger.info("Deleted invalid FCM token for user", { userId });
        } catch (e) {
          logger.warn("Failed to delete invalid token", { userId });
        }
      }
    }
  }
);

/**
 * Firestore trigger: when a new space post is created, create notification documents
 * for all group members (except the poster). This runs with Admin privileges so
 * it bypasses client-side security rules that would otherwise prevent one user
 * from creating notifications for other users.
 */
export const notifySpacePostOnCreate = onDocumentCreated(
  "spacePosts/{postId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const post = snap.data() as any;
    const postId = event.params.postId as string;
    const groupId = post?.groupId as string | undefined;
    const posterId = post?.userId as string | undefined;
    const posterName = post?.userName || '';

    if (!groupId) {
      console.warn('space post created without groupId', { postId });
      return;
    }

    try {
      const firestore = admin.firestore();

      // Fetch group members
      const membersSnap = await firestore.collection('group_members').where('groupId', '==', groupId).get();
      if (membersSnap.empty) return;

      const docs = membersSnap.docs.map(d => d.data()).filter(Boolean) as any[];

      // Batch writes (max 500 per batch)
      const BATCH_SIZE = 450;
      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const slice = docs.slice(i, i + BATCH_SIZE);
        const batch = firestore.batch();
        for (const m of slice) {
          const uid = m.userId as string | undefined;
          if (!uid) continue;
          if (uid === posterId) continue; // don't notify the poster

          const ref = firestore.collection('notifications').doc();
          batch.set(ref, {
            userId: uid,
            type: 'space_post',
            message: `${posterName} posted in your space`,
            relatedId: postId,
            extra: { posterId, posterName, groupId },
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            clientTimestamp: Date.now(),
            read: false,
          });
        }
        await batch.commit();
      }

      console.log('Created space post notifications for group', { groupId, postId });
    } catch (err: any) {
      console.error('Failed to create space post notifications (server-side)', { postId, err: err?.message || String(err) });
    }
  }
);

const isProgramChairAdmin = (user: FirebaseFirestore.DocumentData | undefined) => {
  if (!user) return false;
  const role = (user.role || '').toLowerCase();
  if (role !== 'admin' && role !== 'super admin') return false;
  if (role === 'super admin') return true;
  const primary = (user.office || '').toLowerCase();
  if (primary === 'program chair') return true;
  const offices: string[] = Array.isArray(user.offices) ? user.offices : [];
  return offices.some((office) => (office || '').toLowerCase() === 'program chair');
};

export const notifyModeratorsPostReported = onCall(
  {
    region: "us-central1",
    cors: ORIGIN_WHITELIST,
  },
  async (request) => {
    const reporterId = request.auth?.uid;
    if (!reporterId) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const postIdRaw = request.data?.postId;
    const reasonRaw = request.data?.reason;
    const detailsRaw = request.data?.details;

    const postId = typeof postIdRaw === 'string' ? postIdRaw.trim() : '';
    const reason = typeof reasonRaw === 'string' ? reasonRaw.trim() : '';
    const details = typeof detailsRaw === 'string' ? detailsRaw.trim() : '';

    if (!postId) {
      throw new HttpsError('invalid-argument', 'postId is required');
    }
    if (!ALLOWED_REPORT_REASONS.has(reason)) {
      throw new HttpsError('invalid-argument', 'Invalid report reason');
    }

    const firestore = admin.firestore();

    const reporterDoc = await firestore.collection('users').doc(reporterId).get();
    const reporterName = reporterDoc.exists ? (reporterDoc.data()?.name || 'A BulSU Space member') : 'A BulSU Space member';

    const usersSnap = await firestore.collection('users').get();
    const recipients = usersSnap.docs.filter((docSnap) => {
      if (docSnap.id === reporterId) return false;
      const data = docSnap.data();
      if ((data.role || '').toLowerCase() === 'super admin') return true;
      return isProgramChairAdmin(data);
    });

    if (recipients.length === 0) {
      return { sent: 0 };
    }

    const reasonLabel = REPORT_REASON_LABELS[reason as keyof typeof REPORT_REASON_LABELS] || 'Reported content';
    const message = `${reporterName} reported a post (${reasonLabel}). Tap to review it in the Reports tab.`;

    const notificationsCol = firestore.collection('notifications');
    const BATCH_SIZE = 400;
    let batch = firestore.batch();
    let counter = 0;
    let sent = 0;

    const extraPayload = {
      reporterId,
      reporterName,
      reason,
      reasonLabel,
      details: details || null,
      targetFilter: 'reported',
    };

    for (const recipient of recipients) {
      const docRef = notificationsCol.doc();
      batch.set(docRef, {
        userId: recipient.id,
        type: 'report_alert',
        message,
        relatedId: postId,
        extra: extraPayload,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        clientTimestamp: Date.now(),
        read: false,
      });
      counter++;
      sent++;
      if (counter >= BATCH_SIZE) {
        await batch.commit();
        batch = firestore.batch();
        counter = 0;
      }
    }

    if (counter > 0) {
      await batch.commit();
    }

    return { sent };
  }
);

/**
 * Firestore trigger: when a flare document is deleted, create a takedown notification
 * for the flare owner so they are informed regardless of how the deletion originated.
 * Path: flares/{flareId}
 */
export const notifyFlareOwnerOnDelete = onDocumentDeleted(
  "flares/{flareId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const old = snap.data() as any;
    const flareId = event.params.flareId as string;
    if (!old || !flareId) return;

    const ownerId = old.userId as string | undefined;
    if (!ownerId) {
      logger.warn("Deleted flare missing userId", { flareId });
      return;
    }

    try {
      const message = (old.description && String(old.description).trim())
        ? `Your flare was removed by an administrator. Preview: "${String(old.description).substring(0,120)}"`
        : `Your flare was removed by an administrator.`;

      // Use a system issuer since the delete may come from console or server-side
      const issuerId = 'system';
      const issuerName = 'Administrator';

      await admin.firestore().collection('notifications').add({
        userId: ownerId,
        type: 'takedown',
        message,
        relatedId: flareId,
        extra: { issuerId, issuerName, entityType: 'flare' },
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      logger.info('Created takedown notification for deleted flare', { flareId, ownerId });
    } catch (err: any) {
      logger.error('Failed to create takedown notification on flare delete', { flareId, error: err?.message || String(err) });
    }
  }
);

/**
 * Firestore trigger: when a reaction is created under a post, create or upsert
 * a grouped notification for the post owner. Runs with Admin privileges so
 * it bypasses client-side security rules.
 */
export const notifyPostReactionOnCreate = onDocumentCreated(
  "posts/{postId}/reactions/{reactionId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const reaction = snap.data() as any;
    const reactorId = reaction.userId || reaction.user || reaction.uid || null;
    const postId = event.params.postId as string;
    if (!reactorId || !postId) return;

    try {
      const firestore = admin.firestore();

      // Fetch post to determine owner
      const postDoc = await firestore.collection('posts').doc(postId).get();
      if (!postDoc.exists) return;
      const postOwnerId = postDoc.data()?.userId as string | undefined;
      if (!postOwnerId || postOwnerId === reactorId) return; // don't notify self

      // Fetch reactor display name
      const reactorDoc = await firestore.collection('users').doc(reactorId).get();
      const reactorName = reactorDoc.exists ? (reactorDoc.data()?.name || 'Someone') : 'Someone';

      const notifCol = firestore.collection('notifications');
      const q = notifCol
        .where('userId', '==', postOwnerId)
        .where('type', '==', 'reaction')
        .orderBy('timestamp', 'desc')
        .limit(20);

      const snapshot = await q.get();

      // Find a target doc: prefer exact relatedId match, otherwise doc with empty/missing relatedId
      let targetDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
      if (!snapshot.empty) {
        for (const d of snapshot.docs) {
          const data = d.data() as any;
          if (data.relatedId === postId) {
            targetDoc = d;
            break;
          }
        }
        if (!targetDoc) {
          for (const d of snapshot.docs) {
            const data = d.data() as any;
            if (!data.relatedId) {
              targetDoc = d;
              break;
            }
          }
        }
        if (!targetDoc) targetDoc = snapshot.docs[0];
      }

      if (!targetDoc) {
        // No existing grouped notification: create one
        await notifCol.add({
          userId: postOwnerId,
          type: 'reaction',
          message: `${reactorName} reacted to your post`,
          relatedId: postId,
          extra: { actors: [{ id: reactorId, name: reactorName }], actorCount: 1, latestActor: { id: reactorId, name: reactorName } },
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          clientTimestamp: Date.now(),
          read: false,
        });
        return;
      }

      // Update existing grouped notification in a transaction
      const docRef = notifCol.doc(targetDoc.id);
      await firestore.runTransaction(async (tx) => {
        const docSnap = await tx.get(docRef);
        if (!docSnap.exists) {
          // fallback: create new
          tx.set(notifCol.doc(), {
            userId: postOwnerId,
            type: 'reaction',
            message: `${reactorName} reacted to your post`,
            relatedId: postId,
            extra: { actors: [{ id: reactorId, name: reactorName }], actorCount: 1, latestActor: { id: reactorId, name: reactorName } },
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            clientTimestamp: Date.now(),
            read: false,
          });
          return;
        }

        const data = docSnap.data() as any;
        const extra = (data.extra && typeof data.extra === 'object') ? data.extra : {};
        const actors: Array<{ id: string; name: string }> = Array.isArray(extra.actors) ? extra.actors.slice() : [];

        const already = actors.find(a => a.id === reactorId);
        if (!already) {
          actors.unshift({ id: reactorId, name: reactorName });
        } else {
          const filtered = actors.filter(a => a.id !== reactorId);
          actors.length = 0;
          actors.push({ id: reactorId, name: reactorName }, ...filtered);
        }

        const MAX_ACTORS = 50;
        if (actors.length > MAX_ACTORS) actors.length = MAX_ACTORS;

        let actorCount: number;
        if (typeof extra.actorCount === 'number' && extra.actorCount > 0) {
          actorCount = extra.actorCount;
          if (!already) actorCount = Math.max(actorCount + 1, actors.length);
          else actorCount = Math.max(actorCount, actors.length);
        } else {
          actorCount = actors.length;
        }

        const first = actors[0];
        const others = Math.max(0, actorCount - 1);
        let message: string;
        if (actorCount === 1) {
          message = `${first.name} reacted to your post`;
        } else if (actorCount === 2 && actors[1]) {
          message = `${first.name} and ${actors[1].name} reacted to your post`;
        } else {
          message = others > 0 ? `${first.name} and ${others} others reacted to your post` : `${first.name} reacted to your post`;
        }

        tx.update(docRef, {
          message,
          extra: { ...extra, actors, actorCount, latestActor: { id: reactorId, name: reactorName } },
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          clientTimestamp: Date.now(),
          read: false,
        });
      });

      // Optionally dedupe other duplicates found in the original snapshot
      try {
        const duplicates = snapshot.docs.filter(d => d.id !== targetDoc!.id).filter(d => {
          const ddata = d.data() as any;
          if (postId) return ddata.relatedId === postId;
          return !ddata.relatedId;
        });
        if (duplicates.length > 0) {
          const batch = firestore.batch();
          duplicates.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
      } catch (err) {
        // non-fatal
        console.warn('Failed to dedupe notifications after upsert', err);
      }
    } catch (err: any) {
      console.error('notifyPostReactionOnCreate failed', { postId, err: err?.message || String(err) });
    }
  }
);

/**
 * Firestore trigger: when a comment is created under a post, create or upsert
 * a grouped notification for the post owner. Similar to reactions trigger.
 */
export const notifyPostCommentOnCreate = onDocumentCreated(
  "posts/{postId}/comments/{commentId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const comment = snap.data() as any;
    const commenterId = comment.userId || comment.user || comment.uid || null;
    const postId = event.params.postId as string;
    if (!commenterId || !postId) return;

    try {
      const firestore = admin.firestore();

      // Fetch post to determine owner
      const postDoc = await firestore.collection('posts').doc(postId).get();
      if (!postDoc.exists) return;
      const postOwnerId = postDoc.data()?.userId as string | undefined;
      if (!postOwnerId || postOwnerId === commenterId) return; // don't notify self

      // Fetch commenter display name
      const commenterDoc = await firestore.collection('users').doc(commenterId).get();
      const commenterName = commenterDoc.exists ? (commenterDoc.data()?.name || 'Someone') : 'Someone';

      const excerpt = typeof comment.text === 'string' ? comment.text.substring(0, 120) : (comment.excerpt || null);

      const notifCol = firestore.collection('notifications');
      const q = notifCol
        .where('userId', '==', postOwnerId)
        .where('type', '==', 'comment')
        .orderBy('timestamp', 'desc')
        .limit(20);

      const snapshot = await q.get();

      let targetDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
      if (!snapshot.empty) {
        for (const d of snapshot.docs) {
          const data = d.data() as any;
          if (data.relatedId === postId) {
            targetDoc = d;
            break;
          }
        }
        if (!targetDoc) {
          for (const d of snapshot.docs) {
            const data = d.data() as any;
            if (!data.relatedId) {
              targetDoc = d;
              break;
            }
          }
        }
        if (!targetDoc) targetDoc = snapshot.docs[0];
      }

      if (!targetDoc) {
        await notifCol.add({
          userId: postOwnerId,
          type: 'comment',
          message: `${commenterName} commented on your post${excerpt ? `: "${excerpt}"` : ''}`,
          relatedId: postId,
          extra: { actors: [{ id: commenterId, name: commenterName }], actorCount: 1, latestActor: { id: commenterId, name: commenterName }, excerpt },
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          clientTimestamp: Date.now(),
          read: false,
        });
        return;
      }

      const docRef = notifCol.doc(targetDoc.id);
      await firestore.runTransaction(async (tx) => {
        const docSnap = await tx.get(docRef);
        if (!docSnap.exists) {
          tx.set(notifCol.doc(), {
            userId: postOwnerId,
            type: 'comment',
            message: `${commenterName} commented on your post${excerpt ? `: "${excerpt}"` : ''}`,
            relatedId: postId,
            extra: { actors: [{ id: commenterId, name: commenterName }], actorCount: 1, latestActor: { id: commenterId, name: commenterName }, excerpt },
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            clientTimestamp: Date.now(),
            read: false,
          });
          return;
        }

        const data = docSnap.data() as any;
        const extra = (data.extra && typeof data.extra === 'object') ? data.extra : {};
        const actors: Array<{ id: string; name: string }> = Array.isArray(extra.actors) ? extra.actors.slice() : [];

        const already = actors.find(a => a.id === commenterId);
        if (!already) {
          actors.unshift({ id: commenterId, name: commenterName });
        } else {
          const filtered = actors.filter(a => a.id !== commenterId);
          actors.length = 0;
          actors.push({ id: commenterId, name: commenterName }, ...filtered);
        }

        const MAX_ACTORS = 50;
        if (actors.length > MAX_ACTORS) actors.length = MAX_ACTORS;

        let actorCount: number;
        if (typeof extra.actorCount === 'number' && extra.actorCount > 0) {
          actorCount = extra.actorCount;
          if (!already) actorCount = Math.max(actorCount + 1, actors.length);
          else actorCount = Math.max(actorCount, actors.length);
        } else {
          actorCount = actors.length;
        }

        const first = actors[0];
        const others = Math.max(0, actorCount - 1);
        let message: string;
        if (excerpt) {
          if (actorCount === 2 && actors[1]) {
            message = `${first.name} and ${actors[1].name} commented on your post: "${excerpt}"`;
          } else {
            message = others > 0 ? `${first.name} and ${others} others commented on your post: "${excerpt}"` : `${first.name} commented on your post: "${excerpt}"`;
          }
        } else {
          if (actorCount === 2 && actors[1]) {
            message = `${first.name} and ${actors[1].name} commented on your post`;
          } else {
            message = others > 0 ? `${first.name} and ${others} others commented on your post` : `${first.name} commented on your post`;
          }
        }

        tx.update(docRef, {
          message,
          extra: { ...extra, actors, actorCount, latestActor: { id: commenterId, name: commenterName }, excerpt: excerpt || extra.excerpt || null },
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          clientTimestamp: Date.now(),
          read: false,
        });
      });

      // Dedupe other docs referencing same relatedId
      try {
        const duplicates = snapshot.docs.filter(d => d.id !== targetDoc!.id).filter(d => {
          const ddata = d.data() as any;
          if (postId) return ddata.relatedId === postId;
          return !ddata.relatedId;
        });
        if (duplicates.length > 0) {
          const batch = firestore.batch();
          duplicates.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
      } catch (err) {
        console.warn('Failed to dedupe comment notifications after upsert', err);
      }
    } catch (err: any) {
      console.error('notifyPostCommentOnCreate failed', { postId, err: err?.message || String(err) });
    }
  }
);


/**
 * Firestore trigger: when a post document is deleted, perform server-side cleanup
 * of related subcollections, notifications, user hidden-post refs, and storage objects.
 * Runs with Admin privileges so it can remove cross-user references reliably.
 */
export const cleanupPostOnDelete = onDocumentDeleted(
  "posts/{postId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const old = snap.data() as any;
    const postId = event.params.postId as string;
    if (!postId) return;

    const firestore = admin.firestore();

    try {
      logger.info('Starting cleanup for deleted post', { postId });

      // Helper to delete all documents in a collection path in batches
      const deleteCollectionPath = async (collectionPath: string) => {
        let shouldContinue = true;
        while (shouldContinue) {
          const batchSnap = await firestore.collection(collectionPath).limit(500).get();
          if (batchSnap.empty) return;
          const batch = firestore.batch();
          batchSnap.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
          if (batchSnap.size < 500) shouldContinue = false;
        }
      };

      // Delete common subcollections under the post
      await Promise.all([
        deleteCollectionPath(`posts/${postId}/comments`),
        deleteCollectionPath(`posts/${postId}/reactions`),
        deleteCollectionPath(`posts/${postId}/likes`),
      ]);

      // Delete notifications that reference this post (try multiple possible fields)
      const notifQueries = [
        firestore.collection('notifications').where('relatedId', '==', postId),
        firestore.collection('notifications').where('postId', '==', postId),
      ];
      for (const q of notifQueries) {
        const s = await q.get();
        if (!s.empty) {
          const batch = firestore.batch();
          s.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }

      // Delete hidden_posts entries across users using collectionGroup query (document id == postId)
      try {
        const hiddenGroup = await firestore.collectionGroup('hidden_posts').where(admin.firestore.FieldPath.documentId(), '==', postId).get();
        if (!hiddenGroup.empty) {
          let batch = firestore.batch();
          let counter = 0;
          for (const docSnap of hiddenGroup.docs) {
            batch.delete(docSnap.ref);
            counter++;
            if (counter >= 450) {
              await batch.commit();
              batch = firestore.batch();
              counter = 0;
            }
          }
          if (counter > 0) await batch.commit();
        }
      } catch (e: any) {
        logger.warn('hidden_posts collectionGroup cleanup failed', { postId, err: e?.message || String(e) });
      }

      // Delete storage objects referenced by the post (if any). We expect post.media to be an array
      // with items that may include a `storagePath` field saved at upload time.
      if (old?.media && Array.isArray(old.media)) {
        for (const item of old.media) {
          try {
            const storagePath = item?.storagePath || null;
            if (storagePath) {
              await admin.storage().bucket().file(storagePath).delete().catch((err: any) => {
                // Ignore not-found errors; log others
                if (!(err && (err.code === 404 || err.code === '404'))) {
                  logger.warn('Failed to delete storage object', { storagePath, err: err?.message || String(err) });
                }
              });
            }
          } catch (err: any) {
            logger.warn('Error deleting storage object for post media', { postId, err: err?.message || String(err) });
          }
        }
      }

      // Record audit entry for the deletion cleanup
      try {
        await firestore.collection('postDeletionAudit').add({
          postId,
          cleanedAt: admin.firestore.FieldValue.serverTimestamp(),
          source: 'cleanupPostOnDelete',
          hadMedia: Array.isArray(old?.media) && old.media.length > 0,
        });
      } catch (auditErr: any) {
        logger.warn('Failed to write postDeletionAudit', { postId, err: auditErr?.message || String(auditErr) });
      }

      logger.info('Post cleanup finished', { postId });
    } catch (err: any) {
      logger.error('Post cleanup failed', { postId, err: err?.message || String(err) });
      try {
        await firestore.collection('postDeletionFailures').add({
          postId,
          error: String(err),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          source: 'cleanupPostOnDelete',
        });
      } catch (logErr: any) {
        logger.error('Failed to log postDeletionFailures', { postId, err: logErr?.message || String(logErr) });
      }
    }
  }
);




// ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

interface ResendCodeData {
  token: string
}

/**
 * @description fetch the url token from https://bulsuspace.com/mfa/:token
 * and compares the token from the users database to send the mfa to that user
 * 
 * @var token is the url token from the client
 * @var urlToken is the hashed value of @var token
 * 
 * 
 */
export const resendCode = onCall(
  { region: "us-central1", timeoutSeconds: 120, memory: "512MiB" },
  async (request: CallableRequest<ResendCodeData>) => {

  try {
    const { token } = request.data;
    const now = new Date();

    // Hash the URL token to compare against DB
    const urlToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const deviceRef = await db.collection("mfa_code").where('token', '==', urlToken).get();
    if (deviceRef.empty) return { success: false, msg: 'Invalid or expired token' };

    const MFA_CODE = generateMFA_Code();
    const expiration = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    let user_uid: string | null = null;
    let isUserLocked = false;
    let requestToSendMFACodeStatus = '';

    // Update the MFA code doc(s)
    for (const doc of deviceRef.docs) {
      user_uid = doc.data().user as string;

      isUserLocked = await userLocked(db, user_uid!);
      if (isUserLocked) break;

      requestToSendMFACodeStatus = await requestAttempt(db, user_uid!, now);
      if (requestToSendMFACodeStatus === 'restricted') break;

      await doc.ref.update({ code: MFA_CODE, expiration });
    }

    if (!user_uid) return { success: false, msg: 'No user found to send the code' };
    if (isUserLocked) return { success: false, locked: true, msg: 'Too many request, Try again later' };
    if (requestToSendMFACodeStatus === 'restricted') return { success: false, locked: true, msg: 'Too many MFA code requests. Try again later' };

    // ── Fetch user email ──────────────────────────────────────────────
    const userSnapshot = await db.collection("users").doc(user_uid).get();

    if (!userSnapshot.exists) return { success: false, msg: 'No user found to send the code' };

    let userEmail = userSnapshot.data()?.email;
    const unformattedEmail = userEmail;

    if (userEmail && userEmail.endsWith("@bulsuspace.com")) {
      userEmail = userEmail.replace("@bulsuspace.com", "@ms.bulsu.edu.ph");
    }

    let formattedEmail = userEmail?.endsWith("@bulsuspace.com")
      ? userEmail.replace("@bulsuspace.com", "@ms.bulsu.edu.ph")
      : userEmail;

    // Check for special-user MFA override email
    const specialUser = await getSpecialUserMFAEmail(db, unformattedEmail);
    if (specialUser && specialUser.mfaEmail) {
      formattedEmail = specialUser.mfaEmail;
    }

    // ── Send email (isolated — failure must NOT block success response) ─
    try {
      if (formattedEmail.endsWith('@ms.bulsu.edu.ph')) {
        await sendMailGraph({
          to: formattedEmail,
          subject: "🔐 BulSU Space Verification Code",
          html: mfaEmailHTML(MFA_CODE),
        });
      } else {
        await sendMailNodemailer({
          to: formattedEmail,
          subject: "🔐 BulSU Space Verification Code",
          html: mfaEmailHTML(MFA_CODE),
        });
      }
    } catch (emailErr: any) {
      console.error("⚠️ Resend email failed:", emailErr?.message || emailErr);
      return { success: true, msg: 'Code generated but email delivery may be delayed. Try again in a moment.' };
    }

    return { success: true, msg: 'Code Resend Successfully' };
  } catch (error: any) {
    console.error("❌ resendCode error:", error?.message || error);
    return { success: false, msg: 'Unexpected Error: ' + (error?.message || 'Unknown') };
  }
  
})



interface MfaRequestData {
  user_uid: string;
}

export const generateMFACodeV2 = onCall(
  { region: "us-central1", timeoutSeconds: 120, memory: "512MiB" },
  async (request: CallableRequest<MfaRequestData>) => {

  try {
    const { user_uid } = request.data;
    if (!user_uid || typeof user_uid !== "string") {
      return { success: false, emailSent: false, msg: "Invalid user reference" };
    }

    const now = new Date();

    // ── 1. Lock & rate-limit check (must be sequential) ──────────────────
    const isUserLocked = await userLocked(db, user_uid);
    if (isUserLocked) return { success: false, locked: true, msg: "Too many request, Try again later" };

    const requestToSendMFACode = await requestAttempt(db, user_uid, now);
    if (requestToSendMFACode === 'restricted') return { success: false, locked: true, msg: "Too many MFA code requests. Try again later" };

    // ── 2. Generate tokens + fetch user email in parallel ────────────────
    const tokens = await generateResetPasswordToken();
    const MFA_CODE = generateMFA_Code();
    const expiration = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Firestore write + user email read can run in parallel
    const [, userSnapshot] = await Promise.all([
      db.collection("mfa_code").doc(user_uid).set({
        user: user_uid,
        code: MFA_CODE,
        createdAt: Timestamp.fromDate(now),
        expiration: Timestamp.fromDate(expiration),
        token: tokens.hashedToken,
      }),
      db.collection("users").doc(user_uid).get(),
    ]);

    // ── 3. Resolve recipient email ──────────────────────────────────────
    const userEmailFromDoc = userSnapshot.exists ? userSnapshot.data()?.email : null;
    const userEmailFromAuth = request.auth?.token?.email;
    let userEmail = userEmailFromDoc || userEmailFromAuth;

    if (!userEmail) {
      return { success: false, emailSent: false, msg: "Unable to resolve recipient email" };
    }
    const unformattedEmail = userEmail;

    if (userEmail && userEmail.endsWith("@bulsuspace.com")) {
      userEmail = userEmail.replace("@bulsuspace.com", "@ms.bulsu.edu.ph");
    }

    let formattedEmail = userEmail?.endsWith("@bulsuspace.com")
      ? userEmail.replace("@bulsuspace.com", "@ms.bulsu.edu.ph")
      : userEmail;

    // Check for special-user MFA override email
    const specialUser = await getSpecialUserMFAEmail(db, unformattedEmail);
    if (specialUser && specialUser.mfaEmail) {
      formattedEmail = specialUser.mfaEmail;
    }

    // ── 4. Send email (isolated — failure must NOT block token return) ──
    let emailSent = true;
    try {
      if (formattedEmail.endsWith('@ms.bulsu.edu.ph')) {
        await sendMailGraph({
          to: formattedEmail,
          subject: "🔐 BulSU Space Verification Code",
          html: mfaEmailHTML(MFA_CODE),
        });
      } else {
        console.log('MFA Gmail send')
        await sendMailNodemailer({
          to: formattedEmail,
          subject: "🔐 BulSU Space Verification Code",
          html: mfaEmailHTML(MFA_CODE),
        });
      }
    } catch (emailErr: any) {
      console.error("⚠️ MFA email send failed (token still returned):", emailErr?.message || emailErr);
      emailSent = false;
      return { success: false, emailSent, msg: 'Code generated but email delivery may be delayed. Try again in a moment.', locked: false, token: tokens.rawToken };
    }

    return { success: true, emailSent, locked: false, token: tokens.rawToken };

  } catch (error: any) {
    console.error("MFA generation error:", error?.message || error);
    return { success: false, emailSent: false, msg: error.message + 'waza' };
  }
});


export const verifyMFACode = onCall(
  { region: "us-central1" },
  async (request: CallableRequest<{ code: string; device_id: string, token: string, deviceName: string, browserName: string }>) => {

    try {
      const { code, device_id, token, deviceName, browserName } = request.data;

      let fetchedUserUID = null

      // if (!request.auth) throw new Error("Unauthorized");
      if (!code || !token) return {success: false, message: 'Missing Data'}

      // Keep verification functional even if the client failed to send a device fingerprint.
      const normalizedDeviceId =
        typeof device_id === "string" && device_id.trim().length > 0
          ? device_id.trim()
          : `fallback_${crypto.createHash("sha256").update(token).digest("hex").slice(0, 24)}`;

      const now = new Date();

      // 🔹 Step 1: Check MFA code validity

      // hash the token url from the client
      const hashToCompare = crypto
          .createHash("sha256")
          .update(token)
          .digest("hex");

      // fetch the doc in the db where hashToken === dbToken
      const snapshot = await db.collection("mfa_code").where("token", "==", hashToCompare).get();
      if (snapshot.empty) return { success: false, message: "Invalid or expired token session" };

      snapshot.forEach((doc) => {
        const data = doc.data();

        fetchedUserUID = data.user
      });
      
      if (!fetchedUserUID) return { success: false, message: "No user found for user." };

      // 🔹 Step 2: Check lock
      const lockRef = db.collection("mfa_user_lock").doc(fetchedUserUID);
      const lockDoc = await lockRef.get();

      if (lockDoc.exists) {
        const { lockUntil } = lockDoc.data()!;
        if (lockUntil && lockUntil.toDate() > now) {
          const unlockTime = lockUntil.toDate().toLocaleString();
          return {
            success: false,
            message: `You are temporarily locked. Try again after ${unlockTime}.`,
            locked: true,
          };
        }
      }

      let isValid = false;
      let isExpired = false
      
      // validates the client code to DB code
      // validates the expiration date
      snapshot.forEach((doc) => {
        const data = doc.data();

        if (data.code.toString() === code.toString()) {
        
          if (data.expiration.toDate() <= now) {
            isExpired = true
            return
          }
          isValid = true
        }
      });

      if (isExpired) return { success: false, message: "Invalid or expired token session" };

      if (!isValid) {
        // 🔹 Step 3: Handle wrong code attempts
        const attemptData = lockDoc.exists ? lockDoc.data() : { attemptCount: 0, lockUntil: null, user: fetchedUserUID };
        let newCount = (attemptData?.attemptCount || 0) + 1;
        const updates: any = { attemptCount: newCount, user: fetchedUserUID };

        if (newCount >= 3) {
          const lockUntil = Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000)); // ⏳ Lock for 1 day
          updates.lockUntil = lockUntil;
          updates.attemptCount = 0;
          await lockRef.set(updates);
          return { success: false, message: "Too many wrong attempts. You are locked for 1 day.", locked: true };
        }

        await lockRef.set(updates, { merge: true });
        return { success: false, message: `Wrong code. You have ${3 - newCount} attempts left.` };
      }

      // 🔹 Step 4: Reset attempts on success
      await lockRef.set({ attemptCount: 0, lockUntil: null, user: fetchedUserUID });

      // 🔹 Step 5: Update device info
      const normalizeText = (value: unknown, fallback: string): string => {
        if (typeof value !== "string") return fallback;
        const normalized = value.trim();
        return normalized.length > 0 ? normalized : fallback;
      };

      const normalizeDeviceEntry = (
        entry: any,
      ): { device_id: string; device_name: string; browser_name: string } | null => {
        if (typeof entry === "string") {
          const normalized = entry.trim();
          if (!normalized) return null;
          return {
            device_id: normalized,
            device_name: "Unknown Device",
            browser_name: "Unknown Browser",
          };
        }

        if (!entry || typeof entry !== "object") return null;

        const deviceId = typeof entry.device_id === "string" ? entry.device_id.trim() : "";
        if (!deviceId) return null;

        return {
          device_id: deviceId,
          device_name: normalizeText(entry.device_name, "Unknown Device"),
          browser_name: normalizeText(entry.browser_name, "Unknown Browser"),
        };
      };

      const incomingDevice = {
        device_id: normalizedDeviceId,
        device_name: normalizeText(deviceName, "Unknown Device"),
        browser_name: normalizeText(browserName, "Unknown Browser"),
      };

      const deviceQuery = await db.collection("device").where("user", "==", fetchedUserUID).get();
      const consolidatedDevices = new Map<string, { device_id: string; device_name: string; browser_name: string }>();

      deviceQuery.forEach((deviceDoc) => {
        const rawDevices = deviceDoc.data()?.device_id;
        if (!Array.isArray(rawDevices)) return;

        rawDevices.forEach((entry: any) => {
          const normalized = normalizeDeviceEntry(entry);
          if (normalized) {
            consolidatedDevices.set(normalized.device_id, normalized);
          }
        });
      });

      consolidatedDevices.set(incomingDevice.device_id, incomingDevice);

      // Canonicalize to device/{uid} so client-side rules/read paths remain stable.
      await db.collection("device").doc(fetchedUserUID).set(
        {
          user: fetchedUserUID,
          device_id: Array.from(consolidatedDevices.values()),
        },
        { merge: true },
      );

      const customToken = await getAuth().createCustomToken(fetchedUserUID);

      // reset mfa_user_lock value
      const requestLimitRef = db.collection("mfa_user_lock").doc(fetchedUserUID);
      const requestLimitDoc = await requestLimitRef.get();

      if (requestLimitDoc.exists) {
        await requestLimitRef.update({
          requestCount: 0
        });
      }

      return { success: true, message: "Code verified successfully.", token: customToken };

    } catch (error) {
      console.error("MFA verification error:", error);
      throw new Error((error as Error).message || "Internal server error");
    }
  }
);

/**
 * Send newly created account credentials to mapped @ms.bulsu.edu.ph emails
 * Input: { users: Array<{ email: string; password: string; name?: string; idNumber?: string }> }
 * For each user.email like 1234567890@bulsuspace.com, send to 1234567890@ms.bulsu.edu.ph
 */
export const sendNewAccountCredentialsBatch = onCall(
  {
    region: "us-central1",
    timeoutSeconds: 540,
    memory: "256MiB" as any,
    // Explicitly allow local dev and production origins to satisfy browser preflight
    cors: ["http://localhost:3000", "https://bulsuspace.web.app"],
  },
  async (
    request: CallableRequest<{
      users: Array<{ email: string; password: string; name?: string; idNumber?: string; mfaEmail?: string }>;
    }>
  ) => {
    try {
      const users = (request.data?.users || []).filter(Boolean);
      if (!Array.isArray(users) || users.length === 0) {
        return { success: false, message: "No users provided" };
      }

      // Safety cap
      const MAX_USERS = 1000;
      if (users.length > MAX_USERS) {
        return { success: false, message: `Too many users in one request (max ${MAX_USERS})` };
      }

      let sent = 0;
      const failures: Array<{ email: string; error: string }> = [];
      const portalLink = "https://bulsuspace.web.app";

      for (const u of users) {
        try {
          const bulsuSpaceEmail = (u.email || '').trim();
          const password = (u.password || '').trim();
          const name = u.name?.trim();
          if (!bulsuSpaceEmail || !password) {
            failures.push({ email: bulsuSpaceEmail || '(missing)', error: 'Missing email or password' });
            continue;
          }

          // Determine recipient email: prefer provided mfaEmail, else map to @ms.bulsu.edu.ph
          const providedMfa = (u as any).mfaEmail ? String((u as any).mfaEmail).trim() : '';
          let msEmail = providedMfa || bulsuSpaceEmail.replace('@bulsuspace.com', '@ms.bulsu.edu.ph');
          if (!providedMfa && msEmail.endsWith('@bulsu.edu.ph')) {
            msEmail = msEmail.replace('@bulsu.edu.ph', '@ms.bulsu.edu.ph');
          }

          const html = newAccountEmailHTML({
            name,
            bulsuSpaceEmail,
            msEmail,
            password,
            portalLink,
          });

          if (msEmail.endsWith('@ms.bulsu.edu.ph')) {
            await sendMailGraph({ to: msEmail, subject: 'Your BulSU Space Account Credentials', html });
          } else {
            // Fallback for any non-tenant address
            await sendMailNodemailer({ to: msEmail, subject: 'Your BulSU Space Account Credentials', html });
          }
          sent++;
        } catch (err: any) {
          failures.push({ email: u.email || '(unknown)', error: err?.message || String(err) });
        }
      }

      return { success: true, sent, failed: failures.length, failures };
    } catch (error: any) {
      return { success: false, message: error?.message || 'Unexpected error' };
    }
  }
);

/**
 * HTTP fallback with explicit CORS for environments where callable CORS is blocked or outdated.
 * POST body: { users: Array<{ email, password, name?, idNumber? }> }
 * Responds with: { success, sent, failed, failures }
 */
export const sendNewAccountCredentialsBatchHttp = onRequest(
  {
    region: "us-central1",
    timeoutSeconds: 540,
    memory: "256MiB" as any,
    cors: ["http://localhost:3000", "https://bulsuspace.web.app"],
  },
  async (req, res) => {
    // Allow only POST (OPTIONS handled by framework when cors option is set)
    if (req.method !== "POST") {
      res.status(405).set("Allow", "POST, OPTIONS").json({ success: false, message: "Method Not Allowed" });
      return;
    }

    try {
      const body = (req.body || {}) as {
        users?: Array<{ email: string; password: string; name?: string; idNumber?: string; mfaEmail?: string }>;
      };
      const users = Array.isArray(body.users) ? body.users.filter(Boolean) : [];

      if (users.length === 0) {
        res.status(400).json({ success: false, message: "No users provided" });
        return;
      }

      const MAX_USERS = 1000;
      if (users.length > MAX_USERS) {
        res.status(400).json({ success: false, message: `Too many users in one request (max ${MAX_USERS})` });
        return;
      }

      let sent = 0;
      const failures: Array<{ email: string; error: string }> = [];
      const portalLink = "https://bulsuspace.web.app";

      for (const u of users) {
        try {
          const bulsuSpaceEmail = (u.email || '').trim();
          const password = (u.password || '').trim();
          const name = u.name?.trim();
          if (!bulsuSpaceEmail || !password) {
            failures.push({ email: bulsuSpaceEmail || '(missing)', error: 'Missing email or password' });
            continue;
          }

          const providedMfa = (u as any).mfaEmail ? String((u as any).mfaEmail).trim() : '';
          let msEmail = providedMfa || bulsuSpaceEmail.replace('@bulsuspace.com', '@ms.bulsu.edu.ph');
          if (!providedMfa && msEmail.endsWith('@bulsu.edu.ph')) {
            msEmail = msEmail.replace('@bulsu.edu.ph', '@ms.bulsu.edu.ph');
          }

          const html = newAccountEmailHTML({
            name,
            bulsuSpaceEmail,
            msEmail,
            password,
            portalLink,
          });

          if (msEmail.endsWith('@ms.bulsu.edu.ph')) {
            await sendMailGraph({ to: msEmail, subject: 'Your BulSU Space Account Credentials', html });
          } else {
            await sendMailNodemailer({ to: msEmail, subject: 'Your BulSU Space Account Credentials', html });
          }
          sent++;
        } catch (err: any) {
          failures.push({ email: u.email || '(unknown)', error: err?.message || String(err) });
        }
      }

      res.status(200).json({ success: true, sent, failed: failures.length, failures });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error?.message || 'Unexpected error' });
    }
  }
);

type AlumniInviteInput = {
  email: string;
  invitedBy?: string;
  invitedByName?: string;
  sourceFile?: string;
};

const ALUMNI_INVITE_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const MAX_ALUMNI_INVITES = 1000;

const processAlumniInvites = async (rawInvites: AlumniInviteInput[] | undefined) => {
  const invites = Array.isArray(rawInvites) ? rawInvites.filter(Boolean) : [];
  const failures: Array<{ email: string; error: string }> = [];
  const normalized: AlumniInviteInput[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  if (invites.length === 0) {
    return { success: false, sent: 0, failed: 0, skipped: 0, failures, message: "No invites provided" };
  }

  for (const invite of invites) {
    const email = (invite?.email || '').trim().toLowerCase();
    if (!email) {
      failures.push({ email: '(missing)', error: 'Missing email' });
      continue;
    }
    if (!ALUMNI_INVITE_EMAIL_REGEX.test(email)) {
      failures.push({ email, error: 'Invalid email format' });
      continue;
    }
    if (seen.has(email)) {
      skipped++;
      continue;
    }
    seen.add(email);
    normalized.push({
      email,
      invitedBy: invite?.invitedBy?.trim() || undefined,
      invitedByName: invite?.invitedByName?.trim() || undefined,
      sourceFile: invite?.sourceFile?.trim() || undefined,
    });
  }

  if (normalized.length === 0) {
    return { success: false, sent: 0, failed: failures.length, skipped, failures, message: "No valid invite emails found" };
  }

  if (normalized.length > MAX_ALUMNI_INVITES) {
    return {
      success: false,
      sent: 0,
      failed: failures.length,
      skipped,
      failures,
      message: `Too many invites in one request (max ${MAX_ALUMNI_INVITES})`,
    };
  }

  let sent = 0;
  for (const invite of normalized) {
    try {
      const html = alumniInviteEmailHTML({ actionLink: ALUMNI_CREATION_LINK, invitedBy: invite.invitedByName });
      const subject = 'You are invited to BulSU Space';
      if (invite.email.endsWith('@ms.bulsu.edu.ph')) {
        await sendMailGraph({ to: invite.email, subject, html });
      } else {
        await sendMailNodemailer({ to: invite.email, subject, html });
      }

      await db.collection('alumni_invites').add({
        email: invite.email,
        invitedBy: invite.invitedBy || null,
        invitedByName: invite.invitedByName || null,
        sourceFile: invite.sourceFile || null,
        status: 'sent',
        sentAt: FieldValue.serverTimestamp(),
        actionLink: ALUMNI_CREATION_LINK,
      });
      sent++;
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      failures.push({ email: invite.email, error: errorMsg });
      try {
        await db.collection('alumni_invites').add({
          email: invite.email,
          invitedBy: invite.invitedBy || null,
          invitedByName: invite.invitedByName || null,
          sourceFile: invite.sourceFile || null,
          status: 'failed',
          error: errorMsg,
          sentAt: FieldValue.serverTimestamp(),
          actionLink: ALUMNI_CREATION_LINK,
        });
      } catch (logErr: any) {
        logger.error('Failed to log alumni invite failure', { email: invite.email, error: logErr?.message || String(logErr) });
      }
    }
  }

  return { success: failures.length === 0, sent, failed: failures.length, skipped, failures };
};

export const sendAlumniInvitesBatch = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 300,
    memory: '256MiB' as any,
    cors: ["http://localhost:3000", "https://bulsuspace.web.app"],
  },
  async (request: CallableRequest<{ invites: AlumniInviteInput[] }>) => {
    try {
      const result = await processAlumniInvites(request.data?.invites);
      return {
        success: result.success,
        sent: result.sent,
        failed: result.failed,
        skipped: result.skipped,
        failures: result.failures,
        message: result.message,
      };
    } catch (error: any) {
      logger.error('sendAlumniInvitesBatch callable failed', { error: error?.message || String(error) });
      return { success: false, message: error?.message || 'Unexpected error' };
    }
  }
);

export const sendAlumniInvitesBatchHttp = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 300,
    memory: '256MiB' as any,
    cors: ["http://localhost:3000", "https://bulsuspace.web.app"],
  },
  async (req, res) => {
    applyCorsHeaders(req, res);

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).set('Allow', 'POST, OPTIONS').json({ success: false, message: 'Method Not Allowed' });
      return;
    }

    try {
      const body = req.body as { invites?: AlumniInviteInput[] };
      const result = await processAlumniInvites(body?.invites);
      if (result.success || result.sent > 0) {
        res.status(200).json(result);
        return;
      }
      const status = result.message ? 400 : 200;
      res.status(status).json(result);
    } catch (error: any) {
      logger.error('sendAlumniInvitesBatchHttp failed', { error: error?.message || String(error) });
      res.status(500).json({ success: false, message: error?.message || 'Unexpected error' });
    }
  }
);

type AlumniAccountInput = {
  firstName?: string;
  lastName?: string;
  email?: string;
  studentNumber?: string;
};

type GuestAccountInput = {
  firstName?: string;
  lastName?: string;
  email?: string;
};

const resolveCallerIp = (rawRequest: any): string => {
  const header = rawRequest?.headers?.['x-forwarded-for'];
  const forwardedValue = Array.isArray(header) ? header[0] : header;
  return forwardedValue?.split(',')[0]?.trim() || rawRequest?.ip || 'unknown';
};

const performAlumniAccountCreation = async (
  payload: AlumniAccountInput,
  options: { callerIp?: string } = {}
) => {
  const rawFirst = sanitizeNameInput(payload?.firstName);
  const rawLast = sanitizeNameInput(payload?.lastName);
  const rawEmail = typeof payload?.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const sanitizedStudent = sanitizeStudentNumber(payload?.studentNumber || undefined);

  if (!rawFirst) {
    throw new HttpsError('invalid-argument', 'First name is required');
  }
  if (!rawLast) {
    throw new HttpsError('invalid-argument', 'Last name is required');
  }
  if (!rawEmail || !ALUMNI_INVITE_EMAIL_REGEX.test(rawEmail)) {
    throw new HttpsError('invalid-argument', 'A valid email address is required');
  }

  const displayFirst = titleCaseName(rawFirst);
  const displayLast = titleCaseName(rawLast);
  const displayName = `${displayFirst} ${displayLast}`.trim();
  const contactEmail = rawEmail;
  const callerIp = options.callerIp || 'unknown';

  const existingContact = await db.collection('users').where('contactEmail', '==', contactEmail).limit(1).get();
  if (!existingContact.empty) {
    throw new HttpsError('already-exists', 'An account is already associated with this email address.');
  }

  try {
    await admin.auth().getUserByEmail(contactEmail);
    throw new HttpsError('already-exists', 'This email is already registered.');
  } catch (err: any) {
    if (err?.code !== 'auth/user-not-found') {
      throw new HttpsError('internal', err?.message || 'Failed to validate email');
    }
  }

  const requestDocId = encodeEmailForDocId(contactEmail);
  const requestDocRef = db.collection('alumni_account_requests').doc(requestDocId);
  const existingRequest = await requestDocRef.get();
  if (existingRequest.exists) {
    const data = existingRequest.data();
    const completed = data?.status === 'completed';
    const lastAttempt = data?.lastAttempt?.toDate ? data.lastAttempt.toDate() : null;
    if (completed) {
      throw new HttpsError('already-exists', 'This email already completed the alumni onboarding process.');
    }
    if (lastAttempt && Date.now() - lastAttempt.getTime() < 2 * 60 * 1000) {
      throw new HttpsError('resource-exhausted', 'Please wait before submitting another request.');
    }
  }

  await requestDocRef.set({
    email: contactEmail,
    lastAttempt: FieldValue.serverTimestamp(),
    lastIp: callerIp,
    attemptCount: FieldValue.increment(1),
    status: 'pending',
    firstName: displayFirst,
    lastName: displayLast,
    studentNumber: sanitizedStudent || null,
  }, { merge: true });

  const finalIdNumber = await ensureUniqueIdNumber(sanitizedStudent || undefined);
  const firstLocal = sanitizeEmailLocalPart(displayFirst);
  const lastLocal = sanitizeEmailLocalPart(displayLast);
  const nameBasedLocal = [firstLocal, lastLocal].filter(Boolean).join('.');
  let baseLocalPart = nameBasedLocal || (sanitizedStudent ? sanitizedStudent.replace(/[^A-Za-z0-9]/g, '').toLowerCase() : '') || `alumni${randomAlphaNumeric(6).toLowerCase()}`;
  baseLocalPart = baseLocalPart.slice(0, 32);

  const password = generateAlumniPassword();
  let createdUser: admin.auth.UserRecord | null = null;
  let loginEmail = '';
  for (let attempt = 0; attempt < 10; attempt++) {
    const emailLocal = attempt === 0 ? baseLocalPart : `${baseLocalPart}${attempt}`;
    loginEmail = `${emailLocal}@bulsuspace.com`;
    try {
      createdUser = await admin.auth().createUser({
        email: loginEmail,
        password,
        displayName,
      });
      break;
    } catch (err: any) {
      if (err?.code === 'auth/email-already-exists') {
        continue;
      }
      throw new HttpsError('internal', err?.message || 'Failed to create alumni account');
    }
  }

  if (!createdUser) {
    throw new HttpsError('internal', 'Unable to provision alumni account at this time.');
  }

  await db.collection('users').doc(createdUser.uid).set({
    email: loginEmail,
    name: displayName,
    firstName: displayFirst,
    lastName: displayLast,
    idNumber: finalIdNumber,
    pastStudentNumber: sanitizedStudent || null,
    contactEmail,
    mfaEmail: contactEmail,
    role: 'alumni',
    profile_pic: `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=1E293B&color=fff`,
    isNewUser: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    registrationSource: 'alumni_self_service',
  }, { merge: false });

  await db.collection('device').doc(createdUser.uid).set({ user: createdUser.uid, device_id: [] }, { merge: true });

  try {
    const inviteMatches = await db.collection('alumni_invites').where('email', '==', contactEmail).limit(5).get();
    const batch = db.batch();
    inviteMatches.docs.forEach((docSnap) => {
      batch.update(docSnap.ref, {
        status: 'completed',
        completedAt: FieldValue.serverTimestamp(),
        createdUserId: createdUser?.uid,
      });
    });
    if (!inviteMatches.empty) {
      await batch.commit();
    }
  } catch (err) {
    logger.warn('Failed to update alumni invite status', { email: contactEmail, error: err });
  }

  try {
    const html = newAccountEmailHTML({
      name: displayName,
      bulsuSpaceEmail: loginEmail,
      msEmail: contactEmail,
      password,
      portalLink: 'https://bulsuspace.web.app/signin',
    });
    if (contactEmail.endsWith('@ms.bulsu.edu.ph')) {
      await sendMailGraph({ to: contactEmail, subject: 'Your BulSU Space Alumni Credentials', html });
    } else {
      await sendMailNodemailer({ to: contactEmail, subject: 'Your BulSU Space Alumni Credentials', html });
    }
  } catch (err) {
    logger.error('Failed to send alumni credential email', { email: contactEmail, error: err });
  }

  await requestDocRef.set({
    status: 'completed',
    completedAt: FieldValue.serverTimestamp(),
    createdUserId: createdUser.uid,
    loginEmail,
    idNumber: finalIdNumber,
  }, { merge: true });

  return {
    success: true,
    loginEmail,
    idNumber: finalIdNumber,
    contactEmail,
  };
};

const performGuestAccountCreation = async (
  payload: GuestAccountInput,
  options: { callerIp?: string } = {}
) => {
  const rawFirst = sanitizeNameInput(payload?.firstName);
  const rawLast = sanitizeNameInput(payload?.lastName);
  const rawEmail = typeof payload?.email === 'string' ? payload.email.trim().toLowerCase() : '';

  if (!rawFirst) {
    throw new HttpsError('invalid-argument', 'First name is required');
  }
  if (!rawLast) {
    throw new HttpsError('invalid-argument', 'Last name is required');
  }
  if (!rawEmail || !ALUMNI_INVITE_EMAIL_REGEX.test(rawEmail)) {
    throw new HttpsError('invalid-argument', 'A valid email address is required');
  }

  const displayFirst = titleCaseName(rawFirst);
  const displayLast = titleCaseName(rawLast);
  const displayName = `${displayFirst} ${displayLast}`.trim();
  const contactEmail = rawEmail;
  const callerIp = options.callerIp || 'unknown';

  const existingByContact = await db.collection('users').where('contactEmail', '==', contactEmail).limit(1).get();
  if (!existingByContact.empty) {
    throw new HttpsError('already-exists', 'An account is already associated with this email address.');
  }

  const existingByEmail = await db.collection('users').where('email', '==', contactEmail).limit(1).get();
  if (!existingByEmail.empty) {
    throw new HttpsError('already-exists', 'This email is already registered.');
  }

  try {
    await admin.auth().getUserByEmail(contactEmail);
    throw new HttpsError('already-exists', 'This email is already registered.');
  } catch (err: any) {
    if (err?.code !== 'auth/user-not-found') {
      throw new HttpsError('internal', err?.message || 'Failed to validate email');
    }
  }

  const requestDocRef = db.collection('guest_account_requests').doc(encodeEmailForDocId(contactEmail));
  const existingRequest = await requestDocRef.get();
  if (existingRequest.exists) {
    const data = existingRequest.data();
    const completed = data?.status === 'completed';
    const lastAttempt = data?.lastAttempt?.toDate ? data.lastAttempt.toDate() : null;
    if (completed) {
      throw new HttpsError('already-exists', 'This email already has BulSU Space guest access.');
    }
    if (lastAttempt && Date.now() - lastAttempt.getTime() < 60 * 1000) {
      throw new HttpsError('resource-exhausted', 'Please wait before submitting another request.');
    }
  }

  await requestDocRef.set({
    email: contactEmail,
    firstName: displayFirst,
    lastName: displayLast,
    status: 'pending',
    lastAttempt: FieldValue.serverTimestamp(),
    lastIp: callerIp,
    attemptCount: FieldValue.increment(1),
  }, { merge: true });

  const password = generateGuestPassword();
  let createdUser: admin.auth.UserRecord | null = null;

  try {
    createdUser = await admin.auth().createUser({
      email: contactEmail,
      password,
      displayName,
      emailVerified: false,
    });
  } catch (err: any) {
    await requestDocRef.set({
      status: 'failed',
      lastError: err?.message || 'Failed to create guest account',
      failedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    throw new HttpsError('internal', err?.message || 'Failed to create guest account');
  }

  const guestId = await ensureUniqueGuestId();

  try {
    await db.collection('users').doc(createdUser.uid).set({
      email: contactEmail,
      contactEmail,
      name: displayName,
      firstName: displayFirst,
      lastName: displayLast,
      role: 'guest',
      idNumber: guestId,
      profile_pic: `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=0F172A&color=fff`,
      isNewUser: true,
      registrationSource: 'guest_self_service',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: false });

    await db.collection('device').doc(createdUser.uid).set({ user: createdUser.uid, device_id: [] }, { merge: true });
  } catch (err: any) {
    logger.error('Failed to persist guest user data', { email: contactEmail, error: err });
    await admin.auth().deleteUser(createdUser.uid).catch((cleanupError) => {
      logger.error('Failed to rollback guest user after Firestore error', { email: contactEmail, error: cleanupError });
    });
    await requestDocRef.set({
      status: 'failed',
      lastError: err?.message || 'Failed to save guest account data',
      failedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if (err instanceof HttpsError) {
      throw err;
    }
    throw new HttpsError('internal', err?.message || 'Failed to save guest account data');
  }

  try {
    const portalLink = process.env.GUEST_PORTAL_LINK || 'https://bulsuspace.web.app/signin';
    const html = `
      <div style="font-family:'Segoe UI',Arial,sans-serif;background:#f6f9fc;padding:24px">
        <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;box-shadow:0 10px 30px rgba(15,23,42,0.12);overflow:hidden">
          <div style="background:linear-gradient(120deg,#0284c7,#22d3ee);color:#fff;padding:18px 22px">
            <h1 style="margin:0;font-size:20px">BulSU Space Guest Access</h1>
            <p style="margin:6px 0 0;font-size:13px;opacity:0.9">Your guest portal credentials</p>
          </div>
          <div style="padding:22px">
            <p style="margin:0 0 12px;color:#0f172a;font-size:15px">Hello <strong>${displayName}</strong>,</p>
            <p style="margin:0 0 16px;color:#1e293b;font-size:14px;line-height:1.6">
              Your BulSU Space guest account is ready. Use the details below to sign in and explore the platform.
            </p>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-bottom:16px">
              <div style="font-size:14px;color:#0f172a;margin-bottom:8px"><strong>Portal:</strong> <a href="${portalLink}" style="color:#0284c7;text-decoration:none">${portalLink}</a></div>
              <div style="font-size:14px;color:#0f172a;margin-bottom:6px"><strong>Email:</strong> ${contactEmail}</div>
              <div style="font-size:14px;color:#0f172a"><strong>Temporary Password:</strong> ${password}</div>
            </div>
            <p style="margin:0 0 12px;color:#334155;font-size:13px">
              For security, change your password after signing in and keep your credentials private.
            </p>
            <a href="${portalLink}" style="display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Go to BulSU Space</a>
          </div>
          <div style="padding:12px 22px;background:#f1f5f9;color:#64748b;font-size:12px">© ${new Date().getFullYear()} BulSU Space</div>
        </div>
      </div>
    `;

    if (contactEmail.endsWith('@ms.bulsu.edu.ph')) {
      await sendMailGraph({ to: contactEmail, subject: 'Your BulSU Space Guest Access', html });
    } else {
      await sendMailNodemailer({ to: contactEmail, subject: 'Your BulSU Space Guest Access', html });
    }
  } catch (err) {
    logger.error('Failed to send guest credential email', { email: contactEmail, error: err });
  }

  await requestDocRef.set({
    status: 'completed',
    completedAt: FieldValue.serverTimestamp(),
    createdUserId: createdUser.uid,
    loginEmail: contactEmail,
  }, { merge: true });

  return {
    success: true,
    loginEmail: contactEmail,
    password,
  };
};

export const createAlumniAccount = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 180,
    memory: '256MiB' as any,
    cors: ["http://localhost:3000", "https://bulsuspace.web.app"],
  },
  async (request: CallableRequest<AlumniAccountInput>) => {
    try {
      return await performAlumniAccountCreation(request.data || {}, {
        callerIp: resolveCallerIp(request.rawRequest),
      });
    } catch (error: any) {
      logger.error('createAlumniAccount failed', { error: error?.message || error, code: error?.code });
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', error?.message || 'Unexpected error while creating alumni account');
    }
  }
);

export const createAlumniAccountHttp = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 180,
    memory: '256MiB' as any,
  },
  async (req, res) => {
    applyCorsHeaders(req, res);

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).set('Allow', 'POST, OPTIONS').json({ success: false, message: 'Method Not Allowed' });
      return;
    }

    try {
      const result = await performAlumniAccountCreation(req.body || {}, {
        callerIp: resolveCallerIp(req),
      });
      res.status(200).json(result);
    } catch (error: any) {
      logger.error('createAlumniAccountHttp failed', { error: error?.message || error, code: error?.code });
      if (error instanceof HttpsError) {
        const status = (() => {
          switch (error.code) {
            case 'invalid-argument':
              return 400;
            case 'already-exists':
              return 409;
            case 'resource-exhausted':
              return 429;
            default:
              return 500;
          }
        })();
        res.status(status).json({ success: false, message: error.message, code: error.code });
        return;
      }
      res.status(500).json({ success: false, message: error?.message || 'Unexpected error' });
    }
  }
);

export const createGuestAccountHttp = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 120,
    memory: '256MiB' as any,
  },
  async (req, res) => {
    applyCorsHeaders(req, res);

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).set('Allow', 'POST, OPTIONS').json({ success: false, message: 'Method Not Allowed' });
      return;
    }

    try {
      const result = await performGuestAccountCreation(req.body || {}, {
        callerIp: resolveCallerIp(req),
      });
      res.status(200).json(result);
    } catch (error: any) {
      logger.error('createGuestAccountHttp failed', { error: error?.message || error, code: error?.code });
      if (error instanceof HttpsError) {
        const status = (() => {
          switch (error.code) {
            case 'invalid-argument':
              return 400;
            case 'already-exists':
              return 409;
            case 'resource-exhausted':
              return 429;
            default:
              return 500;
          }
        })();
        res.status(status).json({ success: false, message: error.message, code: error.code });
        return;
      }
      res.status(500).json({ success: false, message: error?.message || 'Unexpected error' });
    }
  }
);

/*
*
*  Reset Password
*
*/

/**
 * @description creating token for reset password link that will be sent to the user via email
 * @property {hashedToken}; is sent to the users database and will be used to compare url token
 * @returns {success: true} if the url link for password reset was sent to the email
 */
export const generateResetPasswordRequest = onCall(
  { region: "us-central1" },
  async (request: CallableRequest<{ email: string }>) => {

    let userRecord = null

    try {
      const { email } = request.data;

      const specialUser = await getSpecialUserMFAEmail(db, email)

      let formattedEmail = ''
      
      // fetch user UID by using email
      if (specialUser) {
        formattedEmail = specialUser.email
      } else {
        formattedEmail = email
      }

      userRecord = await getAuth().getUserByEmail(formattedEmail);

      const userUID = userRecord.uid

      // token generation and hashing
      const tokens = await generateResetPasswordToken()
      const hashedToken = tokens.hashedToken
      const rawToken = tokens.rawToken
      
      // create or update the doc value
      await db.collection("password_reset_request").doc(userUID).set({
        user: userUID,
        token: hashedToken,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });

      // link for reset password
      const urlLink = `https://bulsuspace.web.app/changepassword/${rawToken}`

      let msEmail = email.replace("@bulsuspace.com", "@ms.bulsu.edu.ph")

      if (specialUser) {
        msEmail = specialUser.mfaEmail
      }

      if (msEmail.endsWith('@ms.bulsu.edu.ph')) {

        // send mails to the tenants @ms.bulsu.edu.ph
        await sendMailGraph({
          to: msEmail,
          subject: "Change Password Request",
          html: forgotPasswordHTML(urlLink),
        });
      } else {

        // send mails to any tenant
        await sendMailNodemailer({
          to: msEmail,
          subject: "Change Password Request",
          html: forgotPasswordHTML(urlLink),
        }) 
      }

      return {success: true}
    } catch(e: any) {

      if (e.code === 'auth/user-not-found') {
        return { success: false, message: "Email not found" };
      } else {
        return { success: false, message: "Error Unknown" };
      }
    }

  })

  type UserInfoProps = {
    user: string
    expiresAt: number
  }

export const verifyResetPasswordToken = onCall(
  { region: "us-central1" },
  async (request: CallableRequest<{ url: string, newPassword: string, confirmPassword: string }>) => {

    const { url, newPassword, confirmPassword } = request.data;

    let getUserInfo:UserInfoProps | null = null

    let getURLToken = ''

    // get code in the URL
    if (url.includes('http://localhost:3000/changepassword/')) {

      getURLToken = url.replace('http://localhost:3000/changepassword/', '')
    } else if (url.includes('https://bulsuspace.web.app/changepassword/')) {

      getURLToken = url.replace('https://bulsuspace.web.app/changepassword/', '')
    }

    const fs = admin.firestore()

    try {

      /**
       * @description validate password input from client
       */
      const passwordStrengthStatus = passwordStrength(newPassword)

      if (passwordStrengthStatus !== 'pass') {
        throw new Error('password strength requirements not met')
      }

      if (newPassword !== confirmPassword) {
        throw new Error('passwords do not match')
      }
    
      /** 
       * @description get all docs in firestore collection
       * */ 
      const snapshot = await fs
      .collection('password_reset_request')
      .get();

      // loop through the docs and find the correct doc with the use of token
      snapshot.forEach(doc => {

          const urlToken = doc.data().token

          const hashToCompare = crypto
            .createHash("sha256")
            .update(getURLToken)
            .digest("hex");

          if (urlToken === hashToCompare) {
            getUserInfo = {
              user: doc.data().user,
              expiresAt: doc.data().expiresAt
            }
            return
          }
      })

      // if no token is found
      // url token !== db token
      if (!getUserInfo) {
        throw new Error('Token not found')
      } 

      const { user, expiresAt } = getUserInfo;

      if (Date.now() > expiresAt) {
        throw new Error("Token expired");
      }
      
      // change password
      await admin.auth().updateUser(user, {
        password: newPassword,
      });

      return {success: true}

    } catch(error: any) {

      return {success: false, msg: error.message}
    }
    

  })

    // ============================================================
    // AUDIO CALLS
    // ============================================================

    const CALLS_COLLECTION = "calls";
    const USER_CALL_STATE_COLLECTION = "user_call_state";
    const CALL_RING_TIMEOUT_MS = 30 * 1000;
    type CallStatus = "ringing" | "connected" | "rejected" | "ended" | "expired";

    type CallDoc = {
      callId: string;
      callerUid: string;
      calleeUid: string;
      kind: "audio";
      status: CallStatus;
      createdAtMs: number;
      acceptedAtMs: number | null;
      endedAtMs: number | null;
      endedByUid: string | null;
      reason: string | null;
      offer?: Record<string, unknown> | null;
      answer?: Record<string, unknown> | null;
      callerIceCandidates?: Record<string, unknown>[];
      calleeIceCandidates?: Record<string, unknown>[];
      updatedAt: FieldValue;
    };

    const normalizeRole = (value: unknown): string => {
      if (typeof value !== "string") return "";
      return value.trim().toLowerCase().replace(/_/g, " ");
    };

    const isSuperAdminRole = (role: unknown): boolean => normalizeRole(role) === "super admin";

    const getRoleByUid = async (uid: string): Promise<string> => {
      const snap = await db.collection("users").doc(uid).get();
      return snap.exists ? (snap.data()?.role ?? "") : "";
    };

    const assertNotSuperAdminParticipant = async (uid: string): Promise<void> => {
      const role = await getRoleByUid(uid);
      if (isSuperAdminRole(role)) {
        throw new HttpsError("permission-denied", "Super admin cannot call or be called.");
      }
    };

    const isUserOnline = async (uid: string): Promise<boolean> => {
      try {
        const stateSnap = await admin.database().ref(`status/${uid}/state`).get();
        const state = stateSnap.val();
        return state === "online";
      } catch (error) {
        logger.warn("Failed to read RTDB presence", { uid, error: String(error) });
        return false;
      }
    };

    const callRef = (callId: string) => db.collection(CALLS_COLLECTION).doc(callId);
    const userCallStateRef = (uid: string) => db.collection(USER_CALL_STATE_COLLECTION).doc(uid);

    const isTerminalCallStatus = (status: unknown): boolean => {
      return status === "ended" || status === "expired" || status === "rejected";
    };

    type UserCallStateResult = {
      busy: boolean;
    };

    const evaluateUserCallStateInTx = async (
      tx: FirebaseFirestore.Transaction,
      uid: string,
    ): Promise<UserCallStateResult> => {
      const stateSnap = await tx.get(userCallStateRef(uid));
      if (!stateSnap.exists) return { busy: false };

      const callId = stateSnap.data()?.callId;
      if (typeof callId !== "string" || !callId) {
        tx.delete(userCallStateRef(uid));
        return { busy: false };
      }

      const snap = await tx.get(callRef(callId));
      if (!snap.exists) {
        tx.delete(userCallStateRef(uid));
        return { busy: false };
      }

      const status = snap.data()?.status;
      if (isTerminalCallStatus(status)) {
        tx.delete(userCallStateRef(uid));
        return { busy: false };
      }

      return { busy: true };
    };

    const clearUserCallStateInTx = (tx: FirebaseFirestore.Transaction, uid: string): void => {
      tx.delete(userCallStateRef(uid));
    };

    const makeUnavailableError = (): HttpsError => {
      return new HttpsError("failed-precondition", "User unavailable");
    };

    export const initiateAudioCall = onCall(
      { region: "us-central1" },
      async (request: CallableRequest<{ calleeUid?: string }>) => {
        const callerUid = request.auth?.uid;
        const calleeUid = typeof request.data?.calleeUid === "string" ? request.data.calleeUid.trim() : "";

        if (!callerUid) throw new HttpsError("unauthenticated", "Authentication required.");
        if (!calleeUid) throw new HttpsError("invalid-argument", "calleeUid is required.");
        if (callerUid === calleeUid) throw new HttpsError("invalid-argument", "Cannot call yourself.");

        await Promise.all([
          assertNotSuperAdminParticipant(callerUid),
          assertNotSuperAdminParticipant(calleeUid),
        ]);

        const online = await isUserOnline(calleeUid);
        if (!online) throw makeUnavailableError();

        const now = Date.now();
        const callId = db.collection(CALLS_COLLECTION).doc().id;

        await db.runTransaction(async (tx) => {
          const callerState = await evaluateUserCallStateInTx(tx, callerUid);
          const calleeState = await evaluateUserCallStateInTx(tx, calleeUid);

          if (callerState.busy || calleeState.busy) {
            throw makeUnavailableError();
          }

          const payload: CallDoc = {
            callId,
            callerUid,
            calleeUid,
            kind: "audio",
            status: "ringing",
            createdAtMs: now,
            acceptedAtMs: null,
            endedAtMs: null,
            endedByUid: null,
            reason: null,
            offer: null,
            answer: null,
            callerIceCandidates: [],
            calleeIceCandidates: [],
            updatedAt: FieldValue.serverTimestamp(),
          };

          tx.set(callRef(callId), payload);
          tx.set(userCallStateRef(callerUid), {
            callId,
            uid: callerUid,
            peerUid: calleeUid,
            status: "ringing",
            updatedAtMs: now,
          });
          tx.set(userCallStateRef(calleeUid), {
            callId,
            uid: calleeUid,
            peerUid: callerUid,
            status: "ringing",
            updatedAtMs: now,
          });
        });

        return { ok: true, callId, status: "ringing" };
      },
    );

    export const acceptAudioCall = onCall(
      { region: "us-central1" },
      async (request: CallableRequest<{ callId?: string }>) => {
        const uid = request.auth?.uid;
        const callId = typeof request.data?.callId === "string" ? request.data.callId.trim() : "";

        if (!uid) throw new HttpsError("unauthenticated", "Authentication required.");
        if (!callId) throw new HttpsError("invalid-argument", "callId is required.");

        const now = Date.now();

        const result = await db.runTransaction(async (tx) => {
          const snap = await tx.get(callRef(callId));
          if (!snap.exists) throw new HttpsError("not-found", "Call not found.");

          const data = snap.data() as Record<string, unknown>;
          if (data.calleeUid !== uid) throw new HttpsError("permission-denied", "Not allowed.");
          if (data.status !== "ringing") throw makeUnavailableError();

          const offer = data.offer as { type?: unknown; sdp?: unknown } | null | undefined;
          if (!offer || typeof offer.type !== "string" || typeof offer.sdp !== "string") {
            throw makeUnavailableError();
          }

          const createdAtMs = Number(data.createdAtMs || 0);
          if (!createdAtMs || now - createdAtMs > CALL_RING_TIMEOUT_MS) {
            tx.update(callRef(callId), {
              status: "expired",
              reason: "timeout",
              endedAtMs: now,
              updatedAt: FieldValue.serverTimestamp(),
            });
            clearUserCallStateInTx(tx, String(data.callerUid || ""));
            clearUserCallStateInTx(tx, String(data.calleeUid || ""));
            throw new HttpsError("deadline-exceeded", "Call expired.");
          }

          tx.update(callRef(callId), {
            status: "connected",
            acceptedAtMs: now,
            updatedAt: FieldValue.serverTimestamp(),
          });

          tx.set(userCallStateRef(String(data.callerUid || "")), {
            callId,
            uid: String(data.callerUid || ""),
            peerUid: String(data.calleeUid || ""),
            status: "connected",
            updatedAtMs: now,
          });
          tx.set(userCallStateRef(String(data.calleeUid || "")), {
            callId,
            uid: String(data.calleeUid || ""),
            peerUid: String(data.callerUid || ""),
            status: "connected",
            updatedAtMs: now,
          });

          return { callerUid: String(data.callerUid || "") };
        });

        return { ok: true, callId, status: "connected", callerUid: result.callerUid };
      },
    );

    export const rejectAudioCall = onCall(
      { region: "us-central1" },
      async (request: CallableRequest<{ callId?: string }>) => {
        const uid = request.auth?.uid;
        const callId = typeof request.data?.callId === "string" ? request.data.callId.trim() : "";
        if (!uid) throw new HttpsError("unauthenticated", "Authentication required.");
        if (!callId) throw new HttpsError("invalid-argument", "callId is required.");

        const now = Date.now();

        await db.runTransaction(async (tx) => {
          const snap = await tx.get(callRef(callId));
          if (!snap.exists) throw new HttpsError("not-found", "Call not found.");

          const data = snap.data() as Record<string, unknown>;
          const callerUid = String(data.callerUid || "");
          const calleeUid = String(data.calleeUid || "");
          if (uid !== callerUid && uid !== calleeUid) throw new HttpsError("permission-denied", "Not allowed.");
          if (isTerminalCallStatus(data.status)) return;

          tx.update(callRef(callId), {
            status: "rejected",
            reason: uid === calleeUid ? "rejected_by_callee" : "cancelled_by_caller",
            endedAtMs: now,
            endedByUid: uid,
            updatedAt: FieldValue.serverTimestamp(),
          });
          clearUserCallStateInTx(tx, callerUid);
          clearUserCallStateInTx(tx, calleeUid);
        });

        return { ok: true, callId, status: "rejected" };
      },
    );

    export const endAudioCall = onCall(
      { region: "us-central1" },
      async (request: CallableRequest<{ callId?: string }>) => {
        const uid = request.auth?.uid;
        const callId = typeof request.data?.callId === "string" ? request.data.callId.trim() : "";
        if (!uid) throw new HttpsError("unauthenticated", "Authentication required.");
        if (!callId) throw new HttpsError("invalid-argument", "callId is required.");

        const now = Date.now();

        await db.runTransaction(async (tx) => {
          const snap = await tx.get(callRef(callId));
          if (!snap.exists) throw new HttpsError("not-found", "Call not found.");

          const data = snap.data() as Record<string, unknown>;
          const callerUid = String(data.callerUid || "");
          const calleeUid = String(data.calleeUid || "");
          if (uid !== callerUid && uid !== calleeUid) throw new HttpsError("permission-denied", "Not allowed.");

          if (!isTerminalCallStatus(data.status)) {
            tx.update(callRef(callId), {
              status: "ended",
              reason: "ended",
              endedAtMs: now,
              endedByUid: uid,
              updatedAt: FieldValue.serverTimestamp(),
            });
          }

          clearUserCallStateInTx(tx, callerUid);
          clearUserCallStateInTx(tx, calleeUid);
        });

        return { ok: true, callId, status: "ended" };
      },
    );

    export const expireAudioCall = onCall(
      { region: "us-central1" },
      async (request: CallableRequest<{ callId?: string }>) => {
        const uid = request.auth?.uid;
        const callId = typeof request.data?.callId === "string" ? request.data.callId.trim() : "";
        if (!uid) throw new HttpsError("unauthenticated", "Authentication required.");
        if (!callId) throw new HttpsError("invalid-argument", "callId is required.");

        const now = Date.now();
        let expired = false;

        await db.runTransaction(async (tx) => {
          const snap = await tx.get(callRef(callId));
          if (!snap.exists) return;

          const data = snap.data() as Record<string, unknown>;
          const callerUid = String(data.callerUid || "");
          const calleeUid = String(data.calleeUid || "");
          if (uid !== callerUid && uid !== calleeUid) throw new HttpsError("permission-denied", "Not allowed.");
          if (data.status !== "ringing") return;

          const createdAtMs = Number(data.createdAtMs || 0);
          if (!createdAtMs || now - createdAtMs < CALL_RING_TIMEOUT_MS) {
            return;
          }

          tx.update(callRef(callId), {
            status: "expired",
            reason: "timeout",
            endedAtMs: now,
            endedByUid: null,
            updatedAt: FieldValue.serverTimestamp(),
          });
          clearUserCallStateInTx(tx, callerUid);
          clearUserCallStateInTx(tx, calleeUid);
          expired = true;
        });

        return { ok: true, callId, status: expired ? "expired" : "unchanged" };
      },
    );

    export const cleanupExpiredAudioCalls = onSchedule(
      {
        region: "us-central1",
        schedule: "every 1 minutes",
      },
      async () => {
        const now = Date.now();
        const cutoff = now - CALL_RING_TIMEOUT_MS;

        const snapshot = await db
          .collection(CALLS_COLLECTION)
          .where("status", "==", "ringing")
          .where("createdAtMs", "<=", cutoff)
          .limit(200)
          .get();

        if (snapshot.empty) {
          return;
        }

        const batch = db.batch();
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>;
          const callerUid = String(data.callerUid || "");
          const calleeUid = String(data.calleeUid || "");

          batch.update(docSnap.ref, {
            status: "expired",
            reason: "timeout",
            endedAtMs: now,
            endedByUid: null,
            updatedAt: FieldValue.serverTimestamp(),
          });

          if (callerUid) {
            batch.delete(userCallStateRef(callerUid));
          }
          if (calleeUid) {
            batch.delete(userCallStateRef(calleeUid));
          }
        });

        await batch.commit();
      },
    );