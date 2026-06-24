## Post Creation Flow
```ts
export const createPost = async (
  userId: string,
  content: string,
  media: File[] = [],
  visibility: PostVisibility = 'public',
  userData?: any,
  taggedFriends: string[] = [],
  taggedGroups: string[] = [],
  initiallyDraft = false
): Promise<string> => {
  const [userDoc, mediaItems] = await Promise.all([
    userData ? Promise.resolve({ exists: () => true, data: () => userData }) : getDoc(doc(db, 'users', userId)),
    uploadMediaFiles(userId, media)
  ]);
  if (!userDoc.exists()) throw new Error('User not found');
  const finalUserData = userDoc.data();
  const postData = {
    userId,
    userName: finalUserData.name,
    userProfilePic: finalUserData.profile_pic,
    userRole: finalUserData.role,
    content,
    media: mediaItems,
    visibility,
    draft: initiallyDraft,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    isPinned: false,
    isEdited: false,
    commentCount: 0,
    reactionCount: 0,
    viewCount: 0,
    viewedBy: [],
    taggedFriends: Array.isArray(taggedFriends) ? taggedFriends : [],
    taggedGroups: Array.isArray(taggedGroups) ? taggedGroups : [],
    isShare: false,
    shareCount: 0,
    isOptimistic: true
  };
  const postRef = await addDoc(collection(db, POSTS_COLLECTION), postData);
  if (!auth.currentUser) throw new Error('User authentication not ready.');
  await activityLogger.logActivity(
    'post_created',
    `Post created by user ${userId}`,
    { postId: postRef.id, userId },
    'medium',
    postRef.id,
    'post'
  );
  const isAdminOrSuperAdmin = finalUserData.role === 'admin' || finalUserData.role === 'super admin';
  if (isAdminOrSuperAdmin) {
    notifyAdminAnnouncement(postRef.id, userId, finalUserData.name).catch(e => console.error('Admin announce failed', e));
  }
  return postRef.id;
};

const uploadMediaFiles = async (userId: string, media: File[]): Promise<MediaItem[]> => {
  if (media.length === 0) {
    return [];
  }
  const uploadPromises = media.map(async file => {
    const fileId = uuidv4();
    const fileRef = ref(storage, `posts/${userId}/${fileId}_${file.name}`);
    await uploadBytes(fileRef, file);
    const downloadUrl = await getStorageUrlWithCORS(fileRef);
    const mediaType: 'image' | 'video' | 'document' =
      file.type.startsWith('image/') ? 'image' :
      file.type.startsWith('video/') ? 'video' : 'document';
    return {
      type: mediaType,
      url: downloadUrl,
      name: file.name,
      size: file.size,
      storagePath: fileRef.fullPath
    };
  });
  return Promise.all(uploadPromises);
};
```

## Messaging Delivery
```ts
export const sendMessageWithRetry = async (
  chatId: string,
  senderId: string,
  content: string,
  type: MessageType = 'text',
  attachments: string[] = [],
  replyTo?: string | null,
  clientMessageId?: string
): Promise<{ queueId: string; message?: Message }> => {
  const messageData: NewMessageData = {
    chatId,
    senderId,
    content: content.trim(),
    type,
    status: 'sent',
    createdAt: Timestamp.now(),
    attachments: type === 'text' ? null : attachments,
    replyTo: replyTo ?? null,
    readBy: [senderId],
    edited: false
  };
  try {
    const result = await sendMessage(
      chatId,
      senderId,
      content,
      type,
      attachments,
      replyTo,
      clientMessageId
    );
    return { queueId: '', message: result };
  } catch (error) {
    const queueId = await addToMessageQueue(messageData);
    return { queueId };
  }
};

export const sendMessage = async (
  chatId: string,
  senderId: string,
  content: string,
  type: MessageType = 'text',
  attachments: string[] = [],
  replyTo?: string | null,
  clientMessageId?: string
): Promise<Message> => {
  const hasTextContent = !!(content && content.trim());
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
  if (type === 'text' && !hasTextContent) throw new Error('Message content cannot be empty');
  if (type !== 'text' && !hasAttachments && !hasTextContent) throw new Error('Message content cannot be empty');
  if (!chatId || !senderId) throw new Error('Invalid chat or sender ID');
  try {
    const senderDoc = await getDoc(doc(db, 'users', senderId));
    if (senderDoc.exists()) {
      const senderRole = (senderDoc.data() as any).role;
      senderRole;
    }
  } catch (roleErr) {
    console.warn('[MessageService] Failed to verify sender role for messaging (non-fatal):', roleErr);
  }
  const chatRef = doc(db, CHATS_COLLECTION, chatId);
  const chatDoc = await getDoc(chatRef);
  if (chatDoc.exists()) {
    const chatData = chatDoc.data() as Chat;
    if (!chatData.isGroupChat && chatData.participants.length === 2) {
      const otherUserId = chatData.participants.find(id => id !== senderId);
      if (otherUserId) {
        const blockStatus = await checkMutualBlock(senderId, otherUserId);
        if (blockStatus.hasAnyBlock) {
          if (blockStatus.user1BlockedUser2) throw new Error('You have blocked this user. Unblock them to send messages.');
          if (blockStatus.user2BlockedUser1) throw new Error('You cannot send messages to this user because they have blocked you.');
        }
      }
    }
  }
  const messageData: NewMessageData = {
    chatId,
    senderId,
    content: content.trim(),
    type,
    status: 'sent',
    createdAt: serverTimestamp(),
    attachments: type === 'text' ? null : attachments,
    replyTo: replyTo ?? null,
    readBy: [senderId],
    edited: false
  };
  const newMessageRef = clientMessageId ? doc(collection(db, MESSAGES_COLLECTION), clientMessageId) : doc(collection(db, MESSAGES_COLLECTION));
  let autoAcceptedRequest = false;
  let createMessageRequest = false;
  let requestRecipientId: string | null = null;
  let participantsToUnarchive: string[] = [];
  await runTransaction(db, async transaction => {
    const chatSnap = await transaction.get(chatRef);
    if (!chatSnap.exists()) throw new Error('Chat not found');
    const chatData = chatSnap.data() as Chat;
    const unreadCount = { ...chatData.unreadCount };
    participantsToUnarchive = [];
    chatData.participants.forEach(userId => {
      if (userId !== senderId) {
        unreadCount[userId] = (unreadCount[userId] || 0) + 1;
        if (chatData.archived?.[userId]) {
          participantsToUnarchive.push(userId);
        }
      } else {
        unreadCount[userId] = 0;
      }
    });
    transaction.set(newMessageRef, {
      ...messageData,
      id: newMessageRef.id
    });
    const updateData: any = {
      lastMessage: {
        messageId: newMessageRef.id,
        content: messageData.content,
        senderId,
        createdAt: messageData.createdAt,
        type,
        status: 'sent',
        readBy: [senderId]
      },
      updatedAt: serverTimestamp(),
      unreadCount
    };
    if (!chatData.isGroupChat && chatData.participants.length === 2 && !chatData.isMessageRequest && !chatData.lastMessage) {
      updateData.isMessageRequest = true;
      updateData.initiator = senderId;
      updateData.messageRequestInitiatorId = senderId;
      createMessageRequest = true;
      requestRecipientId = chatData.participants.find(p => p !== senderId) || null;
    }
    const initiatorId = (chatData as any).initiator ?? (chatData as any).messageRequestInitiatorId;
    if (chatData.isMessageRequest === true && initiatorId && senderId !== initiatorId) {
      updateData.isMessageRequest = false;
      autoAcceptedRequest = true;
    }
    participantsToUnarchive.forEach(userId => {
      updateData[`archived.${userId}`] = false;
    });
    transaction.update(chatRef, updateData);
  });
  const sentMessage: Message = {
    id: newMessageRef.id,
    ...messageData
  } as Message;
  const chatSnapshot = await getDoc(chatRef);
  if (chatSnapshot.exists()) {
    const chatData = chatSnapshot.data() as Chat;
    if (autoAcceptedRequest) {
      try {
        await clearMessageRequestNotification(senderId, chatId);
      } catch (e) {
        console.warn('Failed to clear message_request notification on auto-accept', e);
      }
    }
    if (createMessageRequest && requestRecipientId) {
      try {
        await notifyMessageRequest(requestRecipientId, senderId, chatId);
      } catch (e) {
        console.warn('notifyMessageRequest failed after sendMessage', e);
      }
    }
    for (const participantId of chatData.participants) {
      if (participantId !== senderId) {
        try {
          const currentUserId = auth.currentUser?.uid;
          if (participantId === currentUserId && senderId !== currentUserId) {
            const lastPlayKey = `last_msg_sound_${senderId}`;
            const lastPlayTime = parseInt(sessionStorage.getItem(lastPlayKey) || '0');
            const now = Date.now();
            if (now - lastPlayTime > 3000) {
              sessionStorage.setItem(lastPlayKey, now.toString());
              if (playMessageSound) {
                console.log(`Message sound for new message from ${senderId} to ${participantId}`);
                playMessageSound();
              } else {
                console.warn('No message sound player registered, cannot play sound');
              }
            } else {
              console.log(`Skipping sound for message from ${senderId} - too soon after last sound`);
            }
          }
          await notifyNewMessage(participantId, senderId, sentMessage.id);
        } catch (notifError) {
          console.error('Failed to send message notification:', notifError);
        }
      }
    }
  }
  return sentMessage;
};
```

## Alumni Account Provisioning
```ts
const performAlumniAccountCreation = async (
  payload: AlumniAccountInput,
  options: { callerIp?: string } = {}
) => {
  const rawFirst = sanitizeNameInput(payload?.firstName);
  const rawLast = sanitizeNameInput(payload?.lastName);
  const rawEmail = typeof payload?.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const sanitizedStudent = sanitizeStudentNumber(payload?.studentNumber || undefined);
  if (!rawFirst) throw new HttpsError('invalid-argument', 'First name is required');
  if (!rawLast) throw new HttpsError('invalid-argument', 'Last name is required');
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
    studentNumber: sanitizedStudent || null
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
        displayName
      });
      break;
    } catch (err: any) {
      if (err?.code === 'auth/email-already-exists') continue;
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
    registrationSource: 'alumni_self_service'
  }, { merge: false });
  await db.collection('device').doc(createdUser.uid).set({ user: createdUser.uid, device_id: null }, { merge: true });
  try {
    const inviteMatches = await db.collection('alumni_invites').where('email', '==', contactEmail).limit(5).get();
    const batch = db.batch();
    inviteMatches.docs.forEach(docSnap => {
      batch.update(docSnap.ref, {
        status: 'completed',
        completedAt: FieldValue.serverTimestamp(),
        createdUserId: createdUser?.uid
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
      portalLink: 'https://bulsuspace.web.app/signin'
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
    idNumber: finalIdNumber
  }, { merge: true });
  return {
    success: true,
    loginEmail,
    idNumber: finalIdNumber,
    contactEmail
  };
};

export const createAlumniAccount = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 180,
    memory: '256MiB' as any,
    cors: ['http://localhost:3000', 'https://bulsuspace.web.app']
  },
  async (request: CallableRequest<AlumniAccountInput>) => {
    try {
      return await performAlumniAccountCreation(request.data || {}, {
        callerIp: resolveCallerIp(request.rawRequest)
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
```

## Post Lifecycle Extensions
```ts
export const sharePost = async (
  originalPostId: string,
  sharingUserId: string,
  visibilityOverride?: PostVisibility,
  caption?: string
): Promise<string> => {
  if (!auth.currentUser || auth.currentUser.uid !== sharingUserId) {
    throw new Error('Authenticated user does not match sharing user ID');
  }
  const originalRef = doc(db, POSTS_COLLECTION, originalPostId);
  const originalSnap = await getDoc(originalRef);
  if (!originalSnap.exists()) {
    throw new Error('Original post not found');
  }
  const originalData = originalSnap.data() as any;
  const userSnap = await getDoc(doc(db, 'users', sharingUserId));
  if (!userSnap.exists()) {
    throw new Error('Sharing user not found');
  }
  const sharingUser = userSnap.data();
  let canonicalOriginalMeta = {
    originalPostId,
    originalPostAuthorId: originalData.userId,
    originalPostAuthorName: originalData.userName,
    originalPostAuthorProfilePic: originalData.userProfilePic,
    originalPostContent: originalData.content || '',
    originalPostMedia: originalData.media || [],
    originalPostCreatedAt: originalData.createdAt || null,
    originalPostUpdatedAt: originalData.updatedAt || null,
    originalPostVisibility: originalData.visibility || 'public'
  };
  if (originalData.isShare && originalData.sharedPostRefId) {
    try {
      const previousSharedSnap = await getDoc(doc(db, SHARED_POSTS_COLLECTION, originalData.sharedPostRefId));
      if (previousSharedSnap.exists()) {
        const prevData = previousSharedSnap.data() as any;
        canonicalOriginalMeta = {
          originalPostId: prevData.originalPostId || originalPostId,
          originalPostAuthorId: prevData.originalPostAuthorId || originalData.userId,
          originalPostAuthorName: prevData.originalPostAuthorName || originalData.userName,
          originalPostAuthorProfilePic: prevData.originalPostAuthorProfilePic || originalData.userProfilePic,
          originalPostContent: prevData.originalPostContent || '',
          originalPostMedia: prevData.originalPostMedia || [],
          originalPostCreatedAt: prevData.originalPostCreatedAt || originalData.createdAt || null,
          originalPostUpdatedAt: prevData.originalPostUpdatedAt || originalData.updatedAt || null,
          originalPostVisibility: prevData.originalPostVisibility || originalData.visibility || 'public'
        };
      }
    } catch (nestedError) {
      console.warn('[sharePost] Failed to hydrate canonical original metadata from shared_posts:', nestedError);
    }
  }
  const sharedPostDoc = {
    originalPostId: canonicalOriginalMeta.originalPostId,
    originalPostAuthorId: canonicalOriginalMeta.originalPostAuthorId,
    originalPostAuthorName: canonicalOriginalMeta.originalPostAuthorName,
    originalPostAuthorProfilePic: canonicalOriginalMeta.originalPostAuthorProfilePic,
    originalPostContent: canonicalOriginalMeta.originalPostContent,
    originalPostMedia: canonicalOriginalMeta.originalPostMedia,
    originalPostCreatedAt: canonicalOriginalMeta.originalPostCreatedAt,
    originalPostUpdatedAt: canonicalOriginalMeta.originalPostUpdatedAt,
    originalPostVisibility: canonicalOriginalMeta.originalPostVisibility,
    sharerId: sharingUserId,
    sharerName: sharingUser.name,
    sharerProfilePic: sharingUser.profile_pic,
    sharerRole: sharingUser.role,
    sharerCaption: typeof caption === 'string' ? caption : '',
    sharedAt: serverTimestamp(),
    visibility: visibilityOverride || canonicalOriginalMeta.originalPostVisibility || 'public'
  };
  const sharedPostRef = await addDoc(collection(db, SHARED_POSTS_COLLECTION), sharedPostDoc);
  const newPostData = {
    userId: sharingUserId,
    userName: sharingUser.name,
    userProfilePic: sharingUser.profile_pic,
    userRole: sharingUser.role,
    content: typeof caption === 'string' ? caption : '',
    media: [],
    visibility: visibilityOverride || canonicalOriginalMeta.originalPostVisibility || 'public',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    isPinned: false,
    isEdited: false,
    commentCount: 0,
    reactionCount: 0,
    viewCount: 0,
    viewedBy: [],
    tags: [],
    taggedFriends: [],
    taggedGroups: [],
    isShare: true,
    sharedFromPostId: canonicalOriginalMeta.originalPostId,
    sharedFromUserId: canonicalOriginalMeta.originalPostAuthorId,
    sharedFromUserName: canonicalOriginalMeta.originalPostAuthorName,
    originalPostId: canonicalOriginalMeta.originalPostId,
    originalPostUserId: canonicalOriginalMeta.originalPostAuthorId,
    originalPostUserName: canonicalOriginalMeta.originalPostAuthorName,
    sharedAt: serverTimestamp(),
    shareCount: 0,
    sharedPostRefId: sharedPostRef.id
  };
  const sharedRef = await addDoc(collection(db, POSTS_COLLECTION), newPostData);
  if (auth.currentUser) {
    await activityLogger.logActivity(
      'post_shared',
      `User ${sharingUserId} shared post ${canonicalOriginalMeta.originalPostId}`,
      {
        originalPostId: canonicalOriginalMeta.originalPostId,
        sharedPostId: sharedRef.id,
        userId: sharingUserId
      },
      'low',
      sharedRef.id,
      'post'
    );
  }
  return sharedRef.id;
};

export const updatePost = async (
  postId: string,
  userId: string,
  content: string,
  media?: MediaItem[],
  visibility?: PostVisibility
): Promise<void> => {
  const postRef = doc(db, POSTS_COLLECTION, postId);
  const postDoc = await getDoc(postRef);
  if (!postDoc.exists()) {
    throw new Error('Post not found');
  }
  const postData = postDoc.data() as Post;
  if (postData.userId !== userId) {
    throw new Error('You do not have permission to edit this post');
  }
  const updatedData: Partial<Post> = {
    content: content,
    isEdited: true,
    updatedAt: serverTimestamp() as Timestamp
  };
  if (media) {
    updatedData.media = media;
  }
  if (visibility) {
    updatedData.visibility = visibility;
  }
  await updateDoc(postRef, updatedData);
};

export const deletePost = async (
  postId: string,
  userId: string,
  isAdmin: boolean = false
): Promise<void> => {
  console.log('[DELETE POST] Function called with:', { postId, userId, isAdmin });
  if (!postId) {
    throw new Error('Post ID is required');
  }
  if (!userId) {
    throw new Error('User ID is required');
  }
  let userRole = '';
  let isAdminVerified = isAdmin;
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      userRole = userDoc.data().role || '';
      isAdminVerified = userRole === 'admin' || userRole === 'super admin';
      if (isAdmin && !isAdminVerified) {
        console.warn('[DELETE POST] Admin flag was passed as true but user is not an admin:', { userId, role: userRole });
      }
    } else {
      console.error('[DELETE POST] User not found:', { userId });
      isAdminVerified = false;
    }
  } catch (userError) {
    console.error('[DELETE POST] Error fetching user data for admin verification:', userError);
    isAdminVerified = isAdmin;
  }
  console.log('[DELETE POST] Using comprehensive Firebase cleanup service for total deletion...');
  console.log('[DELETE POST] Broadcasting deletion event before performing actual deletion');
  postDeletionEvents.notifyDeletion(postId);
  try {
    await totalFirebasePostDeletion(postId, userId, isAdminVerified);
    console.log('[DELETE POST] Post cleanup service completed (best-effort)');
  } catch (cleanupError) {
    console.warn('[DELETE POST] Cleanup service reported error (continuing):', cleanupError);
  }
  console.log('[DELETE POST] Broadcasting final deletion event');
  postDeletionEvents.notifyDeletion(postId);
};
```

## Messaging Queue and Chats
```ts
type MessageQueueItem = {
  id: string;
  message: NewMessageData;
  attempts: number;
  lastAttempt: number;
};

let messageQueue: MessageQueueItem[] = [];
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 5000;

const addToMessageQueue = async (message: NewMessageData): Promise<string> => {
  const queueId = `queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  messageQueue.push({
    id: queueId,
    message,
    attempts: 0,
    lastAttempt: Date.now()
  });
  processMessageQueue();
  return queueId;
};

const processMessageQueue = async () => {
  if (messageQueue.length === 0) {
    return;
  }
  const now = Date.now();
  for (const queueItem of messageQueue) {
    if (now - queueItem.lastAttempt < RETRY_DELAY) {
      continue;
    }
    if (queueItem.attempts >= MAX_RETRY_ATTEMPTS) {
      messageQueue = messageQueue.filter(item => item.id !== queueItem.id);
      window.dispatchEvent(new CustomEvent('messageFailed', {
        detail: {
          queueId: queueItem.id,
          error: 'Max retry attempts reached'
        }
      }));
      continue;
    }
    try {
      const result = await sendMessage(
        queueItem.message.chatId,
        queueItem.message.senderId,
        queueItem.message.content,
        queueItem.message.type,
        queueItem.message.attachments || [],
        queueItem.message.replyTo
      );
      messageQueue = messageQueue.filter(item => item.id !== queueItem.id);
      window.dispatchEvent(new CustomEvent('messageSuccess', {
        detail: {
          queueId: queueItem.id,
          message: result
        }
      }));
    } catch (error) {
      queueItem.attempts++;
      queueItem.lastAttempt = now;
      console.error(`Failed to send queued message (attempt ${queueItem.attempts}):`, error);
    }
  }
  if (messageQueue.length > 0) {
    setTimeout(processMessageQueue, RETRY_DELAY);
  }
};

type ReadReceiptBatch = {
  chatId: string;
  userId: string;
  messageIds: Set<string>;
  lastUpdate: number;
};

const READ_RECEIPT_BATCH_DELAY = 2000;
const readReceiptBatches = new Map<string, ReadReceiptBatch>();

export const queueReadReceipt = (
  chatId: string,
  userId: string,
  messageId: string
) => {
  const batchKey = `${chatId}-${userId}`;
  const now = Date.now();
  let batch = readReceiptBatches.get(batchKey);
  if (!batch) {
    batch = {
      chatId,
      userId,
      messageIds: new Set([messageId]),
      lastUpdate: now
    };
    readReceiptBatches.set(batchKey, batch);
    setTimeout(() => processReadReceiptBatch(batchKey), READ_RECEIPT_BATCH_DELAY);
  } else {
    batch.messageIds.add(messageId);
    batch.lastUpdate = now;
  }
};

const processReadReceiptBatch = async (batchKey: string) => {
  const batch = readReceiptBatches.get(batchKey);
  if (!batch) {
    return;
  }
  readReceiptBatches.delete(batchKey);
  try {
    await markMessagesAsRead(
      batch.chatId,
      batch.userId,
      Array.from(batch.messageIds)
    );
    window.dispatchEvent(new CustomEvent('readReceiptSuccess', {
      detail: {
        chatId: batch.chatId,
        userId: batch.userId,
        messageIds: Array.from(batch.messageIds)
      }
    }));
  } catch (error) {
    console.error('Failed to process read receipts:', error);
    const now = Date.now();
    if (now - batch.lastUpdate < 60000) {
      readReceiptBatches.set(batchKey, {
        chatId: batch.chatId,
        userId: batch.userId,
        messageIds: new Set(batch.messageIds),
        lastUpdate: now
      });
      setTimeout(() => processReadReceiptBatch(batchKey), READ_RECEIPT_BATCH_DELAY * 2);
    }
  }
};

export const markMessagesAsReadBatched = async (
  chatId: string,
  userId: string,
  messageIds?: string[]
): Promise<void> => {
  if (!messageIds || messageIds.length === 0) {
    return;
  }
  messageIds.forEach(messageId => {
    queueReadReceipt(chatId, userId, messageId);
  });
};

export function getUserChats(
  userId: string,
  callback: (chats: ChatWithDetails[]) => void,
  showArchived: boolean = false,
  options?: { fetchLastMessageDoc?: boolean; fetchParticipantDetails?: boolean }
): () => void {
  const { fetchLastMessageDoc = true, fetchParticipantDetails = true } = options || {};
  const userCache: Map<string, User> = (getUserChats as any)._userCache || new Map();
  (getUserChats as any)._userCache = userCache;
  const chatsQuery = query(
    collection(db, CHATS_COLLECTION),
    where('participants', 'array-contains', userId),
    orderBy('updatedAt', 'desc')
  );
  const runLimited = async <T>(tasks: (() => Promise<T>)[], limit = 6): Promise<T[]> => {
    const results: T[] = [];
    let index = 0;
    return new Promise(resolve => {
      let active = 0;
      const launch = () => {
        if (index >= tasks.length && active === 0) {
          return resolve(results);
        }
        while (active < limit && index < tasks.length) {
          const current = tasks[index++];
          active++;
          current()
            .then(r => results.push(r))
            .catch(() => results.push(undefined as any))
            .finally(() => {
              active--;
              launch();
            });
        }
      };
      launch();
    });
  };
  const unsubscribe = onSnapshot(chatsQuery, async snapshot => {
    const rawDocs = snapshot.docs;
    const skeletons: ChatWithDetails[] = [];
    for (const d of rawDocs) {
      const c = d.data() as Chat;
      const archived = c.archived && c.archived[userId] === true;
      if (showArchived ? archived : !archived) {
        skeletons.push({
          ...c,
          id: d.id,
          participantDetails: [],
          lastMessage: (c as any).lastMessage || null,
          isGroupChat: c.isGroupChat || false,
          adminId: c.adminId || null
        });
      }
    }
    if (skeletons.length) {
      callback(skeletons);
    }
    const enriched: ChatWithDetails[] = [];
    const tasks = skeletons.map(skel => async () => {
      const participantDetails: User[] = [];
      if (fetchParticipantDetails) {
        const toFetch: string[] = [];
        skel.participants.forEach(pid => {
          if (pid !== userId) {
            const cached = userCache.get(pid);
            if (cached) {
              participantDetails.push(cached);
            } else {
              toFetch.push(pid);
            }
          }
        });
        if (toFetch.length) {
          await Promise.all(toFetch.map(async pid => {
            try {
              const uDoc = await getDoc(doc(db, 'users', pid));
              if (uDoc.exists()) {
                const uData = uDoc.data() as User;
                userCache.set(pid, uData);
                participantDetails.push(uData);
              }
            } catch (e) {
              console.error('User fetch failed', pid, e);
            }
          }));
        }
      }
      let lastMessage: Message | null = null;
      if (skel.lastMessage && (skel as any).lastMessage.messageId) {
        const lmMeta = (skel as any).lastMessage;
        if (fetchLastMessageDoc) {
          try {
            const lastMessageDoc = await getDoc(doc(db, MESSAGES_COLLECTION, lmMeta.messageId));
            if (lastMessageDoc.exists()) {
              const msgData = lastMessageDoc.data() as Message;
              const deletedForMe = (msgData as any).deletedForMe || [];
              if (!deletedForMe.includes(userId)) {
                lastMessage = msgData;
              }
            }
          } catch (e) {
            console.warn('Last message fetch failed', lmMeta?.messageId, e);
          }
        } else {
          lastMessage = {
            id: lmMeta.messageId,
            chatId: skel.id,
            senderId: lmMeta.senderId,
            content: lmMeta.content,
            type: lmMeta.type || 'text',
            status: lmMeta.status || 'sent',
            createdAt: lmMeta.createdAt,
            readBy: lmMeta.readBy || [],
            attachments: null,
            replyTo: null,
            edited: false
          } as Message;
        }
      }
      const chatWithDetails: ChatWithDetails = {
        ...skel,
        participantDetails,
        lastMessage,
        isGroupChat: skel.isGroupChat || false,
        adminId: skel.adminId || null
      };
      if (!chatWithDetails.isGroupChat && participantDetails.length === 1) {
        chatWithDetails.otherUser = participantDetails[0];
      } else if (chatWithDetails.isGroupChat) {
        chatWithDetails.users = participantDetails;
      }
      enriched.push(chatWithDetails);
      return chatWithDetails;
    });
    await runLimited(tasks, 8);
    const directChatMap = new Map<string, ChatWithDetails>();
    const duplicates: string[] = [];
    for (const c of enriched) {
      if (!c.isGroupChat && c.participants.length === 2) {
        const [x, y] = [...c.participants].sort();
        const key = `${x}__${y}`;
        const existing = directChatMap.get(key);
        const getTime = (chat: ChatWithDetails) => {
          const ts = (chat.lastMessage as any)?.timestamp || (chat.lastMessage as any)?.createdAt || chat.updatedAt;
          return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0;
        };
        if (!existing) {
          directChatMap.set(key, c);
        } else {
          if (getTime(c) > getTime(existing)) {
            duplicates.push(existing.id);
            directChatMap.set(key, c);
          } else {
            duplicates.push(c.id);
          }
        }
      }
    }
    const deduped = enriched.filter(c => !duplicates.includes(c.id));
    const nonEmptyChats = deduped.filter(chat => {
      if (chat.lastMessage) {
        return true;
      }
      if ((chat as any).isMessageRequest === true) {
        return true;
      }
      return false;
    });
    const nowVisible: ChatWithDetails[] = [];
    for (const c of nonEmptyChats) {
      const deletionTimestamp: any = (c as any).userDeletes?.[userId];
      if (!deletionTimestamp) {
        nowVisible.push(c);
        continue;
      }
      const deletionMillis = typeof deletionTimestamp?.toMillis === 'function' ? deletionTimestamp.toMillis() : 0;
      const lastMsg = (c.lastMessage as any)?.createdAt || (c.lastMessage as any)?.timestamp;
      const lastMsgMillis = typeof lastMsg?.toMillis === 'function' ? lastMsg.toMillis() : 0;
      if (lastMsgMillis > deletionMillis) {
        nowVisible.push(c);
      }
    }
    nowVisible.sort((a, b) => {
      const getTime = (chat: ChatWithDetails) => {
        const ts = (chat.lastMessage as any)?.timestamp || (chat.lastMessage as any)?.createdAt || chat.updatedAt;
        return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0;
      };
      return getTime(b) - getTime(a);
    });
    callback(nowVisible);
  });
  return unsubscribe;
}

export function getUserChatsCombined(
  userId: string,
  callback: (lists: { active: ChatWithDetails[]; archived: ChatWithDetails[] }) => void,
  options?: { fetchLastMessageDoc?: boolean; fetchParticipantDetails?: boolean; earlySkeletons?: boolean }
): () => void {
  const { fetchLastMessageDoc = true, fetchParticipantDetails = true, earlySkeletons = false } = options || {};
  const userCache: Map<string, User> = (getUserChatsCombined as any)._userCache || new Map();
  (getUserChatsCombined as any)._userCache = userCache;
  const chatsQuery = query(
    collection(db, CHATS_COLLECTION),
    where('participants', 'array-contains', userId),
    orderBy('updatedAt', 'desc')
  );
  const runLimited = async <T>(tasks: (() => Promise<T>)[], limit = 8): Promise<T[]> => {
    const results: T[] = [];
    let index = 0;
    return new Promise(resolve => {
      let active = 0;
      const launch = () => {
        if (index >= tasks.length && active === 0) {
          return resolve(results);
        }
        while (active < limit && index < tasks.length) {
          const current = tasks[index++];
          active++;
          current()
            .then(r => results.push(r))
            .catch(() => results.push(undefined as any))
            .finally(() => {
              active--;
              launch();
            });
        }
      };
      launch();
    });
  };
  const unsubscribe = onSnapshot(chatsQuery, async snapshot => {
    const rawDocs = snapshot.docs;
    const skeletons: ChatWithDetails[] = rawDocs.map(d => {
      const c = d.data() as Chat;
      return {
        ...c,
        id: d.id,
        participantDetails: [],
        lastMessage: (c as any).lastMessage || null,
        isGroupChat: c.isGroupChat || false,
        adminId: c.adminId || null
      } as ChatWithDetails;
    });
    if (earlySkeletons && skeletons.length) {
      const earlyActive = skeletons.filter(s => !(s.archived && s.archived[userId] === true));
      const earlyArchived = skeletons.filter(s => s.archived && s.archived[userId] === true);
      callback({ active: earlyActive, archived: earlyArchived });
    }
    const enriched: ChatWithDetails[] = [];
    const tasks = skeletons.map(skel => async () => {
      const participantDetails: User[] = [];
      if (fetchParticipantDetails) {
        const toFetch: string[] = [];
        skel.participants.forEach(pid => {
          if (pid !== userId) {
            const cached = userCache.get(pid);
            if (cached) {
              participantDetails.push(cached);
            } else {
              toFetch.push(pid);
            }
          }
        });
        if (toFetch.length) {
          await Promise.all(toFetch.map(async pid => {
            try {
              const uDoc = await getDoc(doc(db, 'users', pid));
              if (uDoc.exists()) {
                const uData = uDoc.data() as User;
                userCache.set(pid, uData);
                participantDetails.push(uData);
              }
            } catch (e) {
              console.error('User fetch failed', pid, e);
            }
          }));
        }
      }
      let lastMessage: Message | null = null;
      if ((skel as any).lastMessage && (skel as any).lastMessage.messageId) {
        const lmMeta = (skel as any).lastMessage;
        if (fetchLastMessageDoc) {
          try {
            const lastMessageDoc = await getDoc(doc(db, MESSAGES_COLLECTION, lmMeta.messageId));
            if (lastMessageDoc.exists()) {
              const msgData = lastMessageDoc.data() as Message;
              const deletedForMe = (msgData as any).deletedForMe || [];
              if (!deletedForMe.includes(userId)) {
                lastMessage = msgData;
              }
            }
          } catch (e) {
            console.warn('Last message fetch failed', lmMeta?.messageId, e);
          }
        } else {
          lastMessage = {
            id: lmMeta.messageId,
            chatId: skel.id,
            senderId: lmMeta.senderId,
            content: lmMeta.content,
            type: lmMeta.type || 'text',
            status: lmMeta.status || 'sent',
            createdAt: lmMeta.createdAt,
            readBy: lmMeta.readBy || [],
            attachments: null,
            replyTo: null,
            edited: false
          } as Message;
        }
      }
      const chatWithDetails: ChatWithDetails = {
        ...skel,
        participantDetails,
        lastMessage,
        isGroupChat: skel.isGroupChat || false,
        adminId: skel.adminId || null
      };
      if (!chatWithDetails.isGroupChat && participantDetails.length === 1) {
        chatWithDetails.otherUser = participantDetails[0];
      }
      if (chatWithDetails.isGroupChat) {
        chatWithDetails.users = participantDetails;
      }
      enriched.push(chatWithDetails);
      return chatWithDetails;
    });
    await runLimited(tasks, 8);
    const directChatMap = new Map<string, ChatWithDetails>();
    const duplicates: string[] = [];
    for (const c of enriched) {
      if (!c.isGroupChat && c.participants.length === 2) {
        const [x, y] = [...c.participants].sort();
        const key = `${x}__${y}`;
        const existing = directChatMap.get(key);
        const getTime = (chat: ChatWithDetails) => {
          const ts = (chat.lastMessage as any)?.timestamp || (chat.lastMessage as any)?.createdAt || chat.updatedAt;
          return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0;
        };
        if (!existing) {
          directChatMap.set(key, c);
        } else {
          if (getTime(c) > getTime(existing)) {
            duplicates.push(existing.id);
            directChatMap.set(key, c);
          } else {
            duplicates.push(c.id);
          }
        }
      }
    }
    const deduped = enriched.filter(c => !duplicates.includes(c.id));
    const nonEmptyChats = deduped.filter(chat => {
      if (chat.lastMessage) {
        return true;
      }
      if ((chat as any).isMessageRequest === true) {
        return true;
      }
      return false;
    });
    const nowVisible: ChatWithDetails[] = [];
    for (const c of nonEmptyChats) {
      const deletionTimestamp: any = (c as any).userDeletes?.[userId];
      if (!deletionTimestamp) {
        nowVisible.push(c);
        continue;
      }
      const deletionMillis = typeof deletionTimestamp?.toMillis === 'function' ? deletionTimestamp.toMillis() : 0;
      const lastMsg = (c.lastMessage as any)?.createdAt || (c.lastMessage as any)?.timestamp;
      const lastMsgMillis = typeof lastMsg?.toMillis === 'function' ? lastMsg.toMillis() : 0;
      if (lastMsgMillis > deletionMillis) {
        nowVisible.push(c);
      }
    }
    const active = nowVisible.filter(c => !(c.archived && c.archived[userId] === true));
    const archived = nowVisible.filter(c => c.archived && c.archived[userId] === true);
    const sortByTime = (a: ChatWithDetails, b: ChatWithDetails) => {
      const tA = (a.lastMessage as any)?.timestamp || (a.lastMessage as any)?.createdAt || a.updatedAt;
      const tB = (b.lastMessage as any)?.timestamp || (b.lastMessage as any)?.createdAt || b.updatedAt;
      const ta = tA && typeof (tA as any)?.toMillis === 'function' ? (tA as any).toMillis() : 0;
      const tb = tB && typeof (tB as any)?.toMillis === 'function' ? (tB as any).toMillis() : 0;
      return tb - ta;
    };
    active.sort(sortByTime);
    archived.sort(sortByTime);
    callback({ active, archived });
  });
  return unsubscribe;
}
```

## Alumni HTTP Onboarding
```ts
export const createAlumniAccountHttp = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 180,
    memory: '256MiB' as any
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
        callerIp: resolveCallerIp(req)
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
    return { success: false, sent: 0, failed: 0, skipped: 0, failures, message: 'No invites provided' };
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
      sourceFile: invite?.sourceFile?.trim() || undefined
    });
  }
  if (normalized.length === 0) {
    return { success: false, sent: 0, failed: failures.length, skipped, failures, message: 'No valid invite emails found' };
  }
  if (normalized.length > MAX_ALUMNI_INVITES) {
    return {
      success: false,
      sent: 0,
      failed: failures.length,
      skipped,
      failures,
      message: `Too many invites in one request (max ${MAX_ALUMNI_INVITES})`
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
        actionLink: ALUMNI_CREATION_LINK
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
          actionLink: ALUMNI_CREATION_LINK
        });
      } catch (logErr: any) {
        logger.error('Failed to log alumni invite failure', { email: invite.email, error: logErr?.message || String(logErr) });
      }
    }
  }
  return { success: failures.length === 0, sent, failed: failures.length, skipped, failures };
};

export const sendAlumniInvitesBatchHttp = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 300,
    memory: '256MiB' as any,
    cors: ['http://localhost:3000', 'https://bulsuspace.web.app']
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
```
