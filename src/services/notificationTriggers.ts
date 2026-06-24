import { addNotification, upsertGroupedNotification, deleteNotificationByTypeAndRelatedId } from './notificationService';
import { getUserProfile, getAllUsers } from './userService';
import { getGroupMembers } from './groupService';
import { Post, ReportReasonId } from '../models/Post';
import { getFunctions, httpsCallable, HttpsCallable } from 'firebase/functions';

type NotifyModeratorsPayload = {
  postId: string;
  reason: ReportReasonId;
  details?: string;
};

type NotifyModeratorsResponse = {
  sent?: number;
};

let notifyModeratorsCallable: HttpsCallable<NotifyModeratorsPayload, NotifyModeratorsResponse> | null = null;

const getNotifyModeratorsCallable = () => {
  if (!notifyModeratorsCallable) {
    const functions = getFunctions(undefined, 'us-central1');
    notifyModeratorsCallable = httpsCallable<NotifyModeratorsPayload, NotifyModeratorsResponse>(
      functions,
      'notifyModeratorsPostReported'
    );
  }
  return notifyModeratorsCallable;
};

/**
 * Trigger warning notification to a post owner asking them to delete a specific post.
 * This is a display-only notification; it does not perform deletion.
 */
export async function notifyWarnUser(postId: string, issuerId: string, targetUserId: string, excerpt?: string): Promise<boolean> {
  if (!postId || !targetUserId) return false;

  // Get issuer and ensure we have a display name
  const issuer = await getUserProfile(issuerId).catch(() => null);
  const issuerName = issuer ? issuer.name : 'Admin';

  try {
    const finalExcerpt = excerpt;

    // Message format requested by product: ensure author sees clear takedown notice with a preview
      const message = finalExcerpt
        ? `Your post has been flagged for violating the system’s rules. Please delete it immediately to avoid removal. Preview: "${finalExcerpt}"`
        : `Your post was warned for violating system rules.`;

    const payload = {
      userId: targetUserId,
      type: 'warn' as const,
      message,
      relatedId: postId,
      extra: { issuerId, issuerName, excerpt: finalExcerpt }
    };

    console.log('[notifyWarnUser] creating notification payload:', payload);
    await addNotification(payload);
    console.log(`[notifyWarnUser] Sent warn notification to ${targetUserId} for post ${postId}`);
    return true;
  } catch (error) {
    console.error('[notifyWarnUser] Error sending warn notification:', error);
    return false;
  }
}

/**
 * Notify the post owner that their post was removed by a super admin (takedown)
 */
export async function notifyTakedownUser(postId: string, issuerId: string, targetUserId: string, excerpt?: string): Promise<boolean> {
  if (!postId || !targetUserId) return false;

  const issuer = await getUserProfile(issuerId).catch(() => null);
  const issuerName = issuer ? issuer.name : 'Super Admin';

  try {
    const finalExcerpt = excerpt;
    const message = finalExcerpt
      ? `Your post was removed for violating system rules. Preview: "${finalExcerpt}"`
      : `Your post was removed for violating system rules.`;

    const payload = {
      userId: targetUserId,
      type: 'takedown' as const,
      message,
      relatedId: postId,
      extra: { issuerId, issuerName, excerpt: finalExcerpt }
    };

    console.log('[notifyTakedownUser] creating notification payload:', payload);
    await addNotification(payload);
    console.log(`[notifyTakedownUser] Sent takedown notification to ${targetUserId} for post ${postId}`);
    return true;
  } catch (error) {
    console.error('[notifyTakedownUser] Error sending takedown notification:', error);
    return false;
  }
}

/**
 * Trigger warning notification for a flare owner
 */
export async function notifyWarnFlare(flareId: string, issuerId: string, targetUserId: string, excerpt?: string): Promise<boolean> {
  if (!flareId || !targetUserId) return false;

  const issuer = await getUserProfile(issuerId).catch(() => null);
  const issuerName = issuer ? issuer.name : 'Admin';

  try {
    const finalExcerpt = excerpt;
    const message = finalExcerpt
      ? `Your flare has been flagged for violating the system’s rules. Please address it immediately. Preview: "${finalExcerpt}"`
      : `Your flare was warned for violating system rules.`;

    const payload = {
      userId: targetUserId,
      type: 'warn' as const,
      message,
      relatedId: flareId,
      extra: { issuerId, issuerName, excerpt: finalExcerpt, entityType: 'flare' }
    };

    await addNotification(payload);
    console.log(`[notifyWarnFlare] Sent warn notification to ${targetUserId} for flare ${flareId}`);
    return true;
  } catch (error) {
    console.error('[notifyWarnFlare] Error sending warn notification:', error);
    return false;
  }
}

/**
 * Notify the flare owner that their flare was force deleted (takedown)
 */
export async function notifyFlareTakedown(flareId: string, issuerId: string, targetUserId: string, excerpt?: string): Promise<boolean> {
  if (!flareId || !targetUserId) return false;

  const issuer = await getUserProfile(issuerId).catch(() => null);
  const issuerName = issuer ? issuer.name : 'Super Admin';

  try {
    const finalExcerpt = excerpt;
    const message = finalExcerpt
      ? `Your flare was removed for violating system rules. Preview: "${finalExcerpt}"`
      : `Your flare was removed for violating system rules.`;

    const payload = {
      userId: targetUserId,
      type: 'takedown' as const,
      message,
      relatedId: flareId,
      extra: { issuerId, issuerName, excerpt: finalExcerpt, entityType: 'flare' }
    };

    await addNotification(payload);
    console.log(`[notifyFlareTakedown] Sent takedown notification to ${targetUserId} for flare ${flareId}`);
    return true;
  } catch (error) {
    console.error('[notifyFlareTakedown] Error sending flare takedown notification:', error);
    return false;
  }
}

/**
 * Trigger notification for post reaction
 */
export async function notifyPostReaction(postId: string, reactorId: string, postOwnerId: string) {
  // Server-side Cloud Function will create reaction notifications.
  // Skip client-side writes to avoid 'Missing or insufficient permissions' errors.
  if (reactorId === postOwnerId) return; // Don't notify self
  console.debug('[notifyPostReaction] Skipping client-side notification; server will handle it.', { postId, reactorId, postOwnerId });
  return;
}

/**
 * Trigger notification for all users when admin posts announcement
 */
export async function notifyAdminAnnouncement(postId: string, adminId: string, adminName: string) {
  try {
    // Get all users in the system
    const users = await getAllUsers();
    
    // Create a notification for each user (except the admin who posted)
    const notificationPromises = users
      .filter(user => user.id !== adminId) // Don't notify the admin who created the post
      .map(user => addNotification({
        userId: user.id,
        type: 'announcement',
        message: `ADMIN ANNOUNCEMENT: ${adminName} posted a new announcement`,
        relatedId: postId,
        extra: { adminId, adminName }
      }));
    
    // Wait for all notifications to be sent
    await Promise.all(notificationPromises);
    console.log(`Sent admin announcement notifications to ${notificationPromises.length} users`);
  } catch (error) {
    console.error('Error sending admin announcement notifications:', error);
  }
}

/**
 * Trigger notification for new comment
 */
export async function notifyPostComment(postId: string, commenterId: string, postOwnerId: string, excerpt?: string) {
  // Server-side Cloud Function will create comment notifications.
  // Skip client-side writes to avoid 'Missing or insufficient permissions' errors.
  if (commenterId === postOwnerId) return; // Don't notify self
  console.debug('[notifyPostComment] Skipping client-side notification; server will handle it.', { postId, commenterId, postOwnerId, excerpt });
  return;
}

/**
 * Trigger notification for friend request
 */
export async function notifyFriendRequest(receiverId: string, senderId: string) {
  // Friend-request notifications have been disabled.
  // Keeping this no-op allows callers to remain unchanged while preventing any notification creation.
  console.log('[notifyFriendRequest] disabled - skipping notification for', receiverId, senderId);
  return;
}

/**
 * Trigger notification for friend request accepted
 */
export async function notifyFriendRequestAccepted(senderId: string, receiverId: string) {
  // Friend-request accepted notifications have been disabled.
  console.log('[notifyFriendRequestAccepted] disabled - skipping notification for', senderId, receiverId);
  return;
}

/**
 * Trigger notification for friend posting an academic post
 */
export async function notifyFriendAcademicPost(friendId: string, post: Post) {
  if (friendId === post.userId) return;
  const poster = await getUserProfile(post.userId);
  if (!poster) return;
  await addNotification({
    userId: friendId, // Ensure this is userId (lowercase i)
    type: 'friend_post',
    message: `${poster.name} posted an academic update`,
    relatedId: post.id,
    extra: { posterId: poster.id, posterName: poster.name }
  });
}

/**
 * Trigger notification for space post - notify all members of the space except the poster
 */
export async function notifySpacePost(spacePostId: string, groupId: string, posterId: string) {
  // Notification creation for space posts is handled server-side by a Firestore
  // trigger (functions.notifySpacePostOnCreate). Creating notifications from
  // the client for other users is blocked by security rules and leads to
  // 'Missing or insufficient permissions'. Skip client-side creation to avoid
  // permission errors and duplicate notifications.
  console.debug('[notifySpacePost] Skipping client-side notification creation; server will handle it.', { spacePostId, groupId, posterId });
  return;
}

/**
 * Notify all super admins that a post requires immediate takedown.
 * This is used when an admin flags/removes a violating post and wants super admins to be notified immediately.
 */
export async function notifySuperAdminsTakeDown(postId: string, reporterId: string): Promise<number> {
  if (!postId) return 0;

  try {
    const reporter = await getUserProfile(reporterId).catch(() => null);
    const reporterName = reporter ? reporter.name : 'Admin';

    const users = await getAllUsers();
    const superAdmins = users.filter(u => u.role === 'super admin');

    console.log(`[notifySuperAdminsTakeDown] will notify ${superAdmins.length} super admins for post ${postId}`);

    const notificationPayloads = superAdmins.map(sa => ({
      userId: sa.id,
      type: 'warn' as const,
      message: `${reporterName} requested immediate takedown of a post (id: ${postId})`,
      relatedId: postId,
      extra: { reporterId, reporterName }
    }));

    // Try to send notifications and count successes
    let sent = 0;
    await Promise.all(notificationPayloads.map(async (p) => {
      try {
        await addNotification(p);
        sent++;
      } catch (e) {
        console.error('[notifySuperAdminsTakeDown] failed to send to', p.userId, e);
      }
    }));

    console.log(`[notifySuperAdminsTakeDown] Notified ${sent} super admins about post ${postId}`);
    return sent;
  } catch (error) {
    console.error('[notifySuperAdminsTakeDown] Error notifying super admins:', error);
    return 0;
  }
}

export async function notifyModeratorsPostReported(
  postId: string,
  reporterId: string,
  reason: ReportReasonId,
  details?: string
): Promise<number> {
  if (!postId || !reporterId) return 0;

  try {
    const callable = getNotifyModeratorsCallable();
    const response = await callable({ postId, reason, details });
    const sent = typeof response?.data?.sent === 'number' ? response.data.sent : 0;
    return sent;
  } catch (error) {
    console.error('[notifyModeratorsPostReported] Error notifying moderators:', error);
    return 0;
  }
}

/**
 * Trigger notification for new message
 */
export async function notifyNewMessage(receiverId: string, senderId: string, messageId: string) {
  if (receiverId === senderId) return; // Don't notify self
  const sender = await getUserProfile(senderId);
  if (!sender) return;
  await addNotification({
    userId: receiverId,
    type: 'message',
    message: `${sender.name} sent you a new message`,
    relatedId: messageId,
    extra: { 
      senderId, 
      senderName: sender.name,
      conversationId: messageId.split('_')[0] // Assuming messageId format includes conversationId
    }
  });
}

/**
 * Trigger notification for new message request (direct chat created as request)
 */
export async function notifyMessageRequest(receiverId: string, senderId: string, chatId: string) {
  if (receiverId === senderId) return; // Don't notify self
  const sender = await getUserProfile(senderId);
  if (!sender) return;
  await addNotification({
    userId: receiverId,
    type: 'message_request',
    message: `${sender.name} sent you a message request`,
    relatedId: chatId,
    extra: {
      senderId,
      senderName: sender.name,
      chatId
    }
  });
}

/**
 * Cleanup message request notification when a request is accepted or declined
 */
export async function clearMessageRequestNotification(userId: string, chatId: string) {
  try {
    await deleteNotificationByTypeAndRelatedId(userId, 'message_request', chatId);
  } catch (e) {
    console.warn('[clearMessageRequestNotification] failed to delete message_request notification', e);
  }
}
