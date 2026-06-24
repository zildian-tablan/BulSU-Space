import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
  setDoc,
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  where, 
  limit, 
  serverTimestamp,
  onSnapshot,
  increment,
  runTransaction,
  Timestamp
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject
} from 'firebase/storage';
import { v4 as uuidv4 } from 'uuid';
import { db, storage, auth } from '../firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import { User } from '../contexts/AuthContext';
import { addNotification, deleteNotificationByTypeAndRelatedId } from './notificationService';
import { getUserProfile } from './userService';
import type { Chat } from './messageService';
import { generateGroupIconUrl, getChatById, setChatParticipants, deleteGroupChat } from './messageService';

// Collection paths
const GROUPS_COLLECTION = 'groups';
const GROUP_MEMBERS_COLLECTION = 'group_members';
const GROUP_POSTS_COLLECTION = 'group_posts';
const CHATS_COLLECTION = 'chats';
const USERS_COLLECTION = 'users';

export interface Group {
  id: string;
  name: string;
  description: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  creatorId: string;
  coverImage?: string;
  memberCount: number;
  category: string;
  isPrivate: boolean;
  spaceCode?: string; // Optional: only for private spaces
  theme?: string;
  themeColors?: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    textColor: string;
    bgColor: string;
  };
  adminId?: string; // For backward compatibility with appearance page
  spaceChatId?: string;
}

export interface GroupMember {
  id: string;
  userId: string;
  groupId: string;
  role: 'admin' | 'moderator' | 'member';
  joinedAt: Timestamp;
}

export interface GroupPost {
  id: string;
  content: string;
  userId: string;
  userName: string;
  userRole: string;
  userProfilePic?: string;
  groupId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  commentCount: number;
  reactionCount: number;
}

const waitForAuthenticatedUid = async (expectedUid?: string): Promise<string> => {
  if (auth.currentUser?.uid) {
    if (!expectedUid || auth.currentUser.uid === expectedUid) {
      return auth.currentUser.uid;
    }
    throw new Error('Authenticated user mismatch. Please sign in again and retry.');
  }

  const resolvedUid = await new Promise<string | null>((resolve) => {
    let done = false;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (done) return;
      if (user?.uid) {
        done = true;
        try { unsubscribe(); } catch (e) {}
        resolve(user.uid);
      }
    });

    setTimeout(() => {
      if (done) return;
      done = true;
      try { unsubscribe(); } catch (e) {}
      resolve(auth.currentUser?.uid || null);
    }, 5000);
  });

  if (!resolvedUid) {
    throw new Error('Authentication is not ready yet. Please try again in a moment.');
  }

  if (expectedUid && resolvedUid !== expectedUid) {
    throw new Error('Authenticated user mismatch. Please sign in again and retry.');
  }

  return resolvedUid;
};

const canRoleAccessSpaces = async (uid: string): Promise<boolean> => {
  try {
    const userSnap = await getDoc(doc(db, USERS_COLLECTION, uid));
    if (!userSnap.exists()) return true;

    const userData = userSnap.data() as any;
    const role = typeof userData?.role === 'string' ? userData.role.toLowerCase() : '';

    // Match navbar behavior where super admins use Account Creator and do not get Spaces icon.
    if (role === 'super admin') return false;

    // Admins with registrar office follow Account Creator path and do not get Spaces icon.
    if (role === 'admin') {
      const office = typeof userData?.office === 'string' ? userData.office.toLowerCase() : '';
      const offices = Array.isArray(userData?.offices)
        ? userData.offices.filter((value: unknown): value is string => typeof value === 'string').map((value: string) => value.toLowerCase())
        : [];
      const hasRegistrarOffice = office === 'registrar' || offices.includes('registrar');
      return !hasRegistrarOffice;
    }

    return true;
  } catch (error) {
    console.warn('[joinGroup] Failed to resolve user role policy, allowing by default:', error);
    return true;
  }
};

const getGroupMemberIds = async (groupId: string): Promise<string[]> => {
  const memberSnapshot = await getDocs(
    query(collection(db, GROUP_MEMBERS_COLLECTION), where('groupId', '==', groupId))
  );

  const memberIds = new Set<string>();
  memberSnapshot.forEach((docSnap) => {
    const data = docSnap.data();
    if (data.userId) {
      memberIds.add(data.userId);
    }
  });
  return Array.from(memberIds);
};

const refreshSpaceChatMetadata = async (
  chatId: string,
  groupId: string,
  groupData: Group
) => {
  try {
    const chatRef = doc(db, CHATS_COLLECTION, chatId);
    const chatSnap = await getDoc(chatRef);
    if (!chatSnap.exists()) return;

    const chatData = chatSnap.data() as Chat;
    const desiredName = `${groupData.name} Space`;
    const desiredIcon = groupData.coverImage || chatData.iconUrl || generateGroupIconUrl(groupData.name);

    const updates: Record<string, any> = {};
    if (chatData.name !== desiredName) updates.name = desiredName;
    if (chatData.iconUrl !== desiredIcon) updates.iconUrl = desiredIcon;
    if (chatData.linkedGroupId !== groupId) updates.linkedGroupId = groupId;
    if (chatData.linkedGroupName !== groupData.name) updates.linkedGroupName = groupData.name;

    if (Object.keys(updates).length) {
      updates.updatedAt = serverTimestamp();
      await updateDoc(chatRef, updates);
    }
  } catch (error) {
    console.error('[SpaceChat] Failed to refresh chat metadata:', error);
  }
};

const syncExistingSpaceChatMembers = async (groupId: string, groupData?: Group): Promise<void> => {
  try {
    const groupRef = doc(db, GROUPS_COLLECTION, groupId);
    const groupDoc = groupData ? null : await getDoc(groupRef);
    const resolvedGroupData = groupData || (groupDoc?.exists() ? ({ ...(groupDoc.data() as Group), id: groupId }) : null);
    if (!resolvedGroupData) return;
    const chatId = resolvedGroupData.spaceChatId;
    if (!chatId) return;

    const chatExists = await getChatById(chatId);
    if (!chatExists) {
      await updateDoc(groupRef, { spaceChatId: null });
      return;
    }

    const memberIds = await getGroupMemberIds(groupId);
    if (memberIds.length === 0) return;

    await setChatParticipants(chatId, memberIds, resolvedGroupData.creatorId);
    await refreshSpaceChatMetadata(chatId, groupId, resolvedGroupData);
  } catch (error) {
    console.error('[SpaceChat] Failed to sync members:', error);
  }
};

export const ensureSpaceChat = async (groupId: string): Promise<string> => {
  const groupRef = doc(db, GROUPS_COLLECTION, groupId);
  const groupDoc = await getDoc(groupRef);
  if (!groupDoc.exists()) {
    throw new Error('Space not found');
  }

  const groupData = { ...(groupDoc.data() as Group), id: groupId };
  const memberIds = await getGroupMemberIds(groupId);
  if (memberIds.length === 0) {
    throw new Error('This space has no members yet. Invite someone before starting a chat.');
  }

  let chatId = groupData.spaceChatId || null;
  if (chatId) {
    try {
      const existingChat = await getChatById(chatId);
      if (!existingChat) {
        chatId = null;
        try {
          await updateDoc(groupRef, { spaceChatId: null, updatedAt: serverTimestamp() });
        } catch (cleanupError) {
          console.warn('[SpaceChat] Failed to clear stale spaceChatId:', cleanupError);
        }
      }
    } catch (readError) {
      console.warn('[SpaceChat] Failed to resolve existing chat from group spaceChatId:', readError);
      chatId = null;
    }
  }

  if (!chatId) {
    const chatPayload: Omit<Chat, 'id'> = {
      participants: memberIds,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isGroupChat: true,
      unreadCount: Object.fromEntries(memberIds.map((id) => [id, 0])),
      lastMessage: null,
      theme: groupData.theme || null,
      name: `${groupData.name} Space`,
      adminId: groupData.creatorId || memberIds[0],
      iconUrl: groupData.coverImage || generateGroupIconUrl(groupData.name),
      linkedGroupId: groupId,
      linkedGroupName: groupData.name
    };

    const chatRef = await addDoc(collection(db, CHATS_COLLECTION), chatPayload);
    chatId = chatRef.id;
    try {
      await updateDoc(groupRef, {
        spaceChatId: chatId,
        updatedAt: serverTimestamp()
      });
    } catch (bindError) {
      console.warn('[SpaceChat] Failed to bind spaceChatId on group document:', bindError);
    }
  }

  try {
    await setChatParticipants(chatId, memberIds, groupData.creatorId);
  } catch (syncError) {
    console.warn('[SpaceChat] Failed to sync participants after ensureSpaceChat:', syncError);
  }

  try {
    await refreshSpaceChatMetadata(chatId, groupId, groupData);
  } catch (metadataError) {
    console.warn('[SpaceChat] Failed to refresh metadata after ensureSpaceChat:', metadataError);
  }
  return chatId;
};
/**
 * Generate a 16-character alphanumeric code (letters and numbers, upper/lowercase)
 */
export function generateSpaceCode(length: number = 16): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Create a new group
 */
export const createGroup = async (
  name: string,
  description: string,
  creatorId: string,
  coverImage?: File,
  category: string = 'General',
  isPrivate: boolean = false
): Promise<string> => {
  try {
    let coverImageUrl: string | undefined;
    // Upload cover image if provided
    if (coverImage) {
      const imageId = uuidv4();
      const imageRef = ref(storage, `groups/${imageId}_${coverImage.name}`);
      await uploadBytes(imageRef, coverImage);
      coverImageUrl = await getDownloadURL(imageRef);
    }
    // Create the group document
    const groupData: any = {
      name,
      description,
      creatorId,
      ...(coverImageUrl && { coverImage: coverImageUrl }),
      memberCount: 1, // Creator is the first member
      category,
      isPrivate,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    if (isPrivate) {
      groupData.spaceCode = generateSpaceCode();
    }
    const groupRef = await addDoc(collection(db, GROUPS_COLLECTION), groupData);

    // Create membership as 'member' first (less restrictive rule), then escalate to 'admin'
    try {
      const existingQuery = query(
          collection(db, GROUP_MEMBERS_COLLECTION),
          where('userId', '==', creatorId),
          where('groupId', '==', groupRef.id)
        );
        const existingSnap = await getDocs(existingQuery);
        if (existingSnap.empty) {
          const memberDocId = `${creatorId}_${groupRef.id}`;
          const memberRef = doc(db, GROUP_MEMBERS_COLLECTION, memberDocId);
          // Write the creator membership as 'admin' in one atomic write to avoid needing escalation.
          await setDoc(memberRef, {
            userId: creatorId,
            groupId: groupRef.id,
            role: 'admin',
            joinedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            // Firestore rules require active and lastActiveAt for membership creation
            active: true,
            lastActiveAt: serverTimestamp(),
            // Include providedSpaceCode when the space is private so rules can validate it if needed
            providedSpaceCode: groupData.spaceCode || null
          });
        }
    } catch (e) {
      console.error('[createGroup] Failed to establish creator membership', e);
    }
    return groupRef.id;
  } catch (error) {
    console.error('Error creating group:', error);
    throw error;
  }
};

/**
 * Ensure the creator of a group has an admin membership (self-healing for legacy/missed writes)
 */
export const ensureMembershipForCreator = async (groupId: string, currentUserId: string): Promise<void> => {
  try {
    // Ensure Firebase Auth is initialized and the current user is available.
    // There is a race where session storage may contain the user object but
    // Firebase `auth.currentUser` is not yet populated (especially on page reloads).
    // Firestore rules will reject writes when `request.auth` is null, causing
    // 'Missing or insufficient permissions' errors. Wait briefly for auth to be ready.
    if (!auth.currentUser) {
      await new Promise<void>((resolve) => {
        let done = false;
        const unsubscribe = onAuthStateChanged(auth, (u) => {
          if (u) {
            done = true;
            try { unsubscribe(); } catch (e) {}
            resolve();
          }
        });
        // Safety timeout: continue after 5s even if auth didn't initialize
        setTimeout(() => {
          if (!done) {
            try { unsubscribe(); } catch (e) {}
            resolve();
          }
        }, 5000);
      });
    }

    // If auth still not ready or the UID doesn't match the expected creator UID,
    // abort the self-heal to avoid permission errors and unnecessary writes.
    if (!auth.currentUser || auth.currentUser.uid !== currentUserId) {
      console.warn(`[ensureMembershipForCreator] Auth not ready or UID mismatch (auth=${auth.currentUser?.uid}, expected=${currentUserId}). Aborting self-heal.`);
      return;
    }
    const groupDoc = await getDoc(doc(db, GROUPS_COLLECTION, groupId));
    if (!groupDoc.exists()) return;
    const data = groupDoc.data();
    if (data.creatorId !== currentUserId) return; // Not creator
    const membershipQuery = query(
      collection(db, GROUP_MEMBERS_COLLECTION),
      where('userId', '==', currentUserId),
      where('groupId', '==', groupId)
    );
    const snap = await getDocs(membershipQuery);
      if (snap.empty) {
      // Create membership as admin in one write to avoid escalation failures
      const memberDocId = `${currentUserId}_${groupId}`;
      const newMemberRef = doc(db, GROUP_MEMBERS_COLLECTION, memberDocId);
      await setDoc(newMemberRef, {
        userId: currentUserId,
        groupId,
        role: 'admin',
        joinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        // satisfy rules that require active and lastActiveAt fields on create
        active: true,
        lastActiveAt: serverTimestamp(),
        // Creator path: providedSpaceCode may be absent; set null to be explicit
        providedSpaceCode: null
      });
      console.info(`[ensureMembershipForCreator] Created admin membership for creator ${currentUserId}`);
      if ((data.memberCount || 0) < 1) {
        await updateDoc(doc(db, GROUPS_COLLECTION, groupId), { memberCount: 1, updatedAt: serverTimestamp() });
      }
    } else {
      // If membership exists but not admin, escalate
      const memberDoc = snap.docs[0];
      if (memberDoc.data().role !== 'admin') {
        try {
          await updateDoc(memberDoc.ref, { role: 'admin', updatedAt: serverTimestamp() });
          console.info(`[ensureMembershipForCreator] Elevated existing membership to admin for ${currentUserId}`);
        } catch (e) {
          console.warn('[ensureMembershipForCreator] Could not elevate existing membership', e);
        }
      }
    }
  } catch (e) {
    console.error('[ensureMembershipForCreator] Failed to heal membership', e);
  }
};

/**
 * Get all groups (with optional filtering by category)
 */
export const getGroups = async (category?: string): Promise<Group[]> => {
  try {
    let groupsQuery = query(
      collection(db, GROUPS_COLLECTION),
      orderBy('createdAt', 'desc')
    );
    
    if (category && category !== 'All') {
      groupsQuery = query(
        collection(db, GROUPS_COLLECTION),
        where('category', '==', category),
        orderBy('createdAt', 'desc')
      );
    }
    
    const snapshot = await getDocs(groupsQuery);
    const groups: Group[] = [];
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      groups.push({
        id: doc.id,
        name: data.name,
        description: data.description,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        creatorId: data.creatorId,
        coverImage: data.coverImage,
        memberCount: data.memberCount,
        category: data.category,
        isPrivate: data.isPrivate,
        spaceCode: data.spaceCode,
        theme: data.theme,
        themeColors: data.themeColors,
        adminId: data.creatorId // For backward compatibility
      } as Group);
    });
    
    return groups;
  } catch (error) {
    console.error('Error getting groups:', error);
    throw error;
  }
};

/**
 * Get a specific group by ID
 */
export const getGroupById = async (groupId: string): Promise<Group | null> => {
  try {
    const groupDoc = await getDoc(doc(db, GROUPS_COLLECTION, groupId));
    
    if (groupDoc.exists()) {
      const data = groupDoc.data();
      return {
        id: groupDoc.id,
        name: data.name,
        description: data.description,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        creatorId: data.creatorId,
        coverImage: data.coverImage,
        memberCount: data.memberCount,
        category: data.category,
        isPrivate: data.isPrivate,
        spaceCode: data.spaceCode,
        theme: data.theme,
        themeColors: data.themeColors,
        adminId: data.creatorId // For backward compatibility
      } as Group;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting group:', error);
    throw error;
  }
};

/**
 * Get a specific group by ID with real-time updates
 */
export const getGroupByIdRealtime = (
  groupId: string,
  onGroupUpdate: (group: Group | null) => void
): (() => void) => {
  try {
    if (!groupId) {
      console.warn('getGroupByIdRealtime called without a valid groupId');
      onGroupUpdate(null);
      return () => {};
    }

    const groupRef = doc(db, GROUPS_COLLECTION, groupId);
    
    const unsubscribe = onSnapshot(
      groupRef,
      (groupDoc) => {
        if (groupDoc.exists()) {
          const data = groupDoc.data();
          const group = {
            id: groupDoc.id,
            name: data.name,
            description: data.description,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            creatorId: data.creatorId,
            coverImage: data.coverImage,
            memberCount: data.memberCount,
            category: data.category,
            isPrivate: data.isPrivate,
            spaceCode: data.spaceCode,
            theme: data.theme,
            themeColors: data.themeColors,
            adminId: data.creatorId // For backward compatibility
          } as Group;
          onGroupUpdate(group);
        } else {
          onGroupUpdate(null);
        }
      },
      (snapshotError) => {
        console.error('Group realtime listener failed:', snapshotError);
        onGroupUpdate(null);
      }
    );
    
    return unsubscribe;
  } catch (error) {
    console.error('Error setting up group listener:', error);
    throw error;
  }
};

/**
 * Get real-time updates for groups
 */
export const getGroupsRealtime = (
  onGroupsUpdate: (groups: Group[]) => void
): (() => void) => {
  try {
    const groupsQuery = query(
      collection(db, GROUPS_COLLECTION),
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(groupsQuery, (snapshot) => {
      const groups: Group[] = [];
      const uniqueIds = new Set<string>();
      
      snapshot.forEach((doc) => {
        // Skip if we've already seen this ID (prevents duplicates)
        if (uniqueIds.has(doc.id)) return;
        
        uniqueIds.add(doc.id);
        const data = doc.data();
        
        groups.push({
          id: doc.id,
          name: data.name,
          description: data.description,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          creatorId: data.creatorId,
          coverImage: data.coverImage,
          memberCount: data.memberCount,
          category: data.category,
          isPrivate: data.isPrivate,
          theme: data.theme,
          themeColors: data.themeColors,
          adminId: data.creatorId // For backward compatibility
        } as Group);
      });
      
      onGroupsUpdate(groups);
    });
    
    return unsubscribe;
  } catch (error) {
    console.error('Error setting up groups listener:', error);
    throw error;
  }
};

/**
 * Join a group
 */
export const joinGroup = async (
  userId: string,
  groupId: string,
  joinCode?: string
): Promise<void> => {
  try {
    const authenticatedUid = await waitForAuthenticatedUid(userId);
    const isAllowedByRolePolicy = await canRoleAccessSpaces(authenticatedUid);
    if (!isAllowedByRolePolicy) {
      throw new Error('Your account role does not have access to Spaces from the header.');
    }

    // Validate private join code (if applicable)
    const groupRef = doc(db, GROUPS_COLLECTION, groupId);
    const groupDoc = await getDoc(groupRef);
    if (!groupDoc.exists()) throw new Error('Space not found');

    const groupData = { ...(groupDoc.data() as Group), id: groupId };
    if (groupData.isPrivate) {
      // Require a join code for private spaces and validate it
      const expected = groupData.spaceCode;
      if (!joinCode || joinCode !== expected) {
        throw new Error('Invalid or missing space code for private space');
      }
    }

    // Create membership and update count in one transaction to prevent double increments.
    const memberDocId = `${authenticatedUid}_${groupId}`;
    const memberRef = doc(db, GROUP_MEMBERS_COLLECTION, memberDocId);
    await runTransaction(db, async (transaction) => {
      const [groupSnap, memberSnap] = await Promise.all([
        transaction.get(groupRef),
        transaction.get(memberRef)
      ]);

      if (!groupSnap.exists()) {
        throw new Error('Space not found');
      }

      if (memberSnap.exists()) {
        throw new Error('You are already a member of this space');
      }

      const currentCount = Number(groupSnap.data()?.memberCount || 0);

      transaction.set(memberRef, {
        userId: authenticatedUid,
        groupId,
        role: 'member',
        joinedAt: serverTimestamp(),
        active: true,
        lastActiveAt: serverTimestamp(),
        providedSpaceCode: joinCode || null
      });

      transaction.update(groupRef, {
        memberCount: currentCount + 1,
        updatedAt: serverTimestamp()
      });
    });

    try {
      await syncExistingSpaceChatMembers(groupId, groupData);
    } catch (chatErr) {
      console.warn('[SpaceChat] Failed to sync chat after join:', chatErr);
    }
  } catch (error) {
    console.error('Error joining group:', error);
    throw error;
  }
};

export const sendGroupInvite = async (
  groupId: string,
  inviterId: string,
  inviteeId: string
): Promise<void> => {
  try {
    if (inviterId === inviteeId) {
      throw new Error('You cannot invite yourself.');
    }

    const groupRef = doc(db, GROUPS_COLLECTION, groupId);
    const groupDoc = await getDoc(groupRef);
    if (!groupDoc.exists()) {
      throw new Error('Space not found');
    }

    const groupData = groupDoc.data() as Group;

    if (groupData.isPrivate && !groupData.spaceCode) {
      throw new Error('This private space does not have an active join code yet. Generate a code before sending invites.');
    }

    const inviterMembershipQuery = query(
      collection(db, GROUP_MEMBERS_COLLECTION),
      where('userId', '==', inviterId),
      where('groupId', '==', groupId)
    );
    const inviterMembershipSnap = await getDocs(inviterMembershipQuery);
    if (inviterMembershipSnap.empty) {
      throw new Error('You are not a member of this space');
    }

    const inviterMembership = inviterMembershipSnap.docs[0].data();
    if (inviterMembership.role !== 'admin') {
      throw new Error('Only admins can send invitations');
    }

    const inviteeMembershipQuery = query(
      collection(db, GROUP_MEMBERS_COLLECTION),
      where('userId', '==', inviteeId),
      where('groupId', '==', groupId)
    );
    const inviteeMembershipSnap = await getDocs(inviteeMembershipQuery);
    if (!inviteeMembershipSnap.empty) {
      throw new Error('User is already a member of this space');
    }

    let inviterProfileName = 'A member';
    try {
      const inviterProfile = await getUserProfile(inviterId);
      if (inviterProfile?.name) {
        inviterProfileName = inviterProfile.name;
      }
    } catch (profileErr) {
      console.warn('[sendGroupInvite] Failed to fetch inviter profile', profileErr);
    }

    const publicBaseUrl = (process.env.REACT_APP_PUBLIC_APP_URL || '').trim();
    const baseUrl = publicBaseUrl
      ? publicBaseUrl.replace(/\/$/, '')
      : (typeof window !== 'undefined' ? window.location.origin : 'https://bulsuspace.web.app');

    const inviteParams = new URLSearchParams({ join: '1', via: 'invite' });
    const spaceCode = groupData.isPrivate ? groupData.spaceCode || null : null;
    if (spaceCode) {
      inviteParams.set('code', spaceCode);
    }
    const inviteLink = `${baseUrl}/groups/${groupId}?${inviteParams.toString()}`;

    try {
      await deleteNotificationByTypeAndRelatedId(inviteeId, 'space_invite', groupId);
    } catch (cleanupErr) {
      console.warn('[sendGroupInvite] Failed to clean previous invite notification', cleanupErr);
    }

    await addNotification({
      userId: inviteeId,
      type: 'space_invite',
      message: `${inviterProfileName} invited you to join "${groupData.name}"`,
      relatedId: groupId,
      extra: {
        groupId,
        groupName: groupData.name,
        inviterId,
        inviterName: inviterProfileName,
        isPrivate: !!groupData.isPrivate,
        spaceCode,
        inviteLink,
        invitedAt: Date.now()
      }
    });
  } catch (error) {
    console.error('Error sending group invite:', error);
    throw error;
  }
};

/**
 * Leave a group
 */
export const leaveGroup = async (
  userId: string,
  groupId: string
): Promise<void> => {
  try {
    // Find the member document
    const memberQuery = query(
      collection(db, GROUP_MEMBERS_COLLECTION),
      where('userId', '==', userId),
      where('groupId', '==', groupId)
    );
    
    const memberSnapshot = await getDocs(memberQuery);
      if (memberSnapshot.empty) {
      throw new Error('You are not a member of this space');
    }
    
    // Get the member document
    const memberDoc = memberSnapshot.docs[0];
    const memberData = memberDoc.data();
    
    if (memberData.role === 'admin') {
      // Check if this is the only admin
      const adminQuery = query(
        collection(db, GROUP_MEMBERS_COLLECTION),
        where('groupId', '==', groupId),
        where('role', '==', 'admin')
      );
      
      const adminSnapshot = await getDocs(adminQuery);
      
      if (adminSnapshot.size === 1) {
        throw new Error('You are the only admin. Please promote another member to admin before leaving.');
      }
    }
    
    // Delete the member document
    await deleteDoc(doc(db, GROUP_MEMBERS_COLLECTION, memberDoc.id));
    
    // Update the member count
    const groupRef = doc(db, GROUPS_COLLECTION, groupId);
    const groupDoc = await getDoc(groupRef);
    
    if (groupDoc.exists()) {
      await updateDoc(groupRef, {
        memberCount: Math.max((groupDoc.data().memberCount || 0) - 1, 0)
      });
    }

    try {
      await syncExistingSpaceChatMembers(groupId);
    } catch (chatErr) {
      console.warn('[SpaceChat] Failed to sync chat after leave:', chatErr);
    }
  } catch (error) {
    console.error('Error leaving group:', error);
    throw error;
  }
};

/**
 * Get user's groups with real-time updates
 */
export const getUserGroupsRealtime = (
  userId: string,
  onGroupsUpdate: (groups: Group[]) => void
): (() => void) => {
  try {
    // Query for groups the user is a member of
    const membershipQuery = query(
      collection(db, GROUP_MEMBERS_COLLECTION),
      where('userId', '==', userId)
    );
    
    const unsubscribe = onSnapshot(membershipQuery, async (memberSnapshot) => {
      // No memberships
      if (memberSnapshot.empty) {
        onGroupsUpdate([]);
        return;
      }
      
      // Get group IDs from memberships
      const groupIds = memberSnapshot.docs.map(doc => doc.data().groupId);
      
      // Use a Set to ensure unique group IDs
      const uniqueGroupIds = [...new Set(groupIds)];
      
      // Fetch each group
      const groups: Group[] = [];
      const groupsMap = new Map<string, Group>(); // Use a map to prevent duplicates
      
      for (const groupId of uniqueGroupIds) {
        // Skip if we already have this group
        if (groupsMap.has(groupId)) continue;
        
        const groupDoc = await getDoc(doc(db, GROUPS_COLLECTION, groupId));
        
        if (groupDoc.exists()) {
          const data = groupDoc.data();
          const group = {
            id: groupDoc.id,
            name: data.name,
            description: data.description,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            creatorId: data.creatorId,
            coverImage: data.coverImage,
            memberCount: data.memberCount,
            category: data.category,
            isPrivate: data.isPrivate,
            theme: data.theme,
            themeColors: data.themeColors,
            adminId: data.creatorId // For backward compatibility
          } as Group;
          
          groups.push(group);
          groupsMap.set(groupId, group);
        }
      }
      
      onGroupsUpdate(groups);
    });
    
    
    return unsubscribe;
  } catch (error) {
    console.error('Error setting up user groups listener:', error);
    throw error;
  }
};

/**
 * Check if user is a member of a group
 */
export const isGroupMember = async (
  userId: string,
  groupId: string
): Promise<boolean> => {
  try {
    const memberQuery = query(
      collection(db, GROUP_MEMBERS_COLLECTION),
      where('userId', '==', userId),
      where('groupId', '==', groupId)
    );
    
    const memberSnapshot = await getDocs(memberQuery);
    return !memberSnapshot.empty;
  } catch (error) {
    console.error('Error checking group membership:', error);
    throw error;
  }
};

/**
 * Get group categories
 */
export const getGroupCategories = async (): Promise<string[]> => {
  return [
    'All',
    'General',
    'Academic',
    'Study Groups',
    'Events',
    'Hobbies',
    'Sports',
    'Arts',
    'Technology',
    'Other'
  ];
};

/**
 * Get group members with user details
 */
export const getGroupMembers = async (
  groupId: string
): Promise<(GroupMember & { user: User })[]> => {
  try {
    const membersQuery = query(
      collection(db, GROUP_MEMBERS_COLLECTION),
      where('groupId', '==', groupId),
      orderBy('joinedAt', 'asc')
    );
    
    const memberSnapshot = await getDocs(membersQuery);
    const membersWithDetails: (GroupMember & { user: User })[] = [];
    const seenUserIds = new Set<string>();
    
    for (const memberDoc of memberSnapshot.docs) {
      const memberData = memberDoc.data();
      if (seenUserIds.has(memberData.userId)) continue; // Skip duplicates
      seenUserIds.add(memberData.userId);
      // Get user details
      const userDoc = await getDoc(doc(db, 'users', memberData.userId));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        
        membersWithDetails.push({
          id: memberDoc.id,
          userId: memberData.userId,
          groupId: memberData.groupId,
          role: memberData.role,
          joinedAt: memberData.joinedAt,
          user: {
            id: userDoc.id,
            name: userData.name || 'Unknown User',
            email: userData.email || '',
            profile_pic: userData.profile_pic,
            role: userData.role || 'student',
            idNumber: userData.idNumber || '',
            department: userData.department,
            gender: userData.gender,
            birthday: userData.birthday,
            yearSection: userData.yearSection,
            coverPhoto: userData.coverPhoto,
            graduationBatch: userData.graduationBatch
          } as User
        });
      }
    }
    
    return membersWithDetails;
  } catch (error) {
    console.error('Error getting group members:', error);
    throw error;
  }
};

/**
 * Get group members with real-time updates
 */
export const getGroupMembersRealtime = (
  groupId: string,
  onMembersUpdate: (members: (GroupMember & { user: User })[]) => void
): (() => void) => {
  try {
    if (!groupId) {
      console.warn('getGroupMembersRealtime called without a valid groupId');
      onMembersUpdate([]);
      return () => {};
    }

    const membersQuery = query(
      collection(db, GROUP_MEMBERS_COLLECTION),
      where('groupId', '==', groupId),
      orderBy('joinedAt', 'asc')
    );

    let active = true;
    const unsubscribe = onSnapshot(
      membersQuery,
      (memberSnapshot) => {
        void (async () => {
          const membersWithDetails: (GroupMember & { user: User })[] = [];
          const seenUserIds = new Set<string>();

          for (const memberDoc of memberSnapshot.docs) {
            const memberData = memberDoc.data();
            if (seenUserIds.has(memberData.userId)) continue; // Skip duplicates
            seenUserIds.add(memberData.userId);

            const userDoc = await getDoc(doc(db, 'users', memberData.userId));
            if (userDoc.exists()) {
              const userData = userDoc.data();

              membersWithDetails.push({
                id: memberDoc.id,
                userId: memberData.userId,
                groupId: memberData.groupId,
                role: memberData.role,
                joinedAt: memberData.joinedAt,
                user: {
                  id: userDoc.id,
                  name: userData.name || 'Unknown User',
                  email: userData.email || '',
                  profile_pic: userData.profile_pic,
                  role: userData.role || 'student',
                  idNumber: userData.idNumber || '',
                  department: userData.department,
                  gender: userData.gender,
                  birthday: userData.birthday,
                  yearSection: userData.yearSection,
                  coverPhoto: userData.coverPhoto,
                  graduationBatch: userData.graduationBatch
                } as User
              });
            }
          }

          if (active) {
            onMembersUpdate(membersWithDetails);
          }
        })().catch((listenerError) => {
          console.error('Group members realtime callback failed:', listenerError);
          if (active) {
            onMembersUpdate([]);
          }
        });
      },
      (snapshotError) => {
        console.error('Group members realtime listener failed:', snapshotError);
        if (active) {
          onMembersUpdate([]);
        }
      }
    );

    return () => {
      active = false;
      unsubscribe();
    };
  } catch (error) {
    console.error('Error setting up group members listener:', error);
    throw error;
  }
};

/**
 * Remove a member from a group
 */
export const removeMember = async (
  groupId: string,
  adminUserId: string,
  memberId: string,
  memberUserId: string
): Promise<void> => {
  try {
    // Get the group document to check creator
    const groupRef = doc(db, GROUPS_COLLECTION, groupId);
    const groupDoc = await getDoc(groupRef);
    
    if (!groupDoc.exists()) {
      throw new Error('Space not found');
    }
    
    const groupData = groupDoc.data() as Group;
    const creatorId = groupData.creatorId;
    
    // First, check if the user performing the action is an admin
    const adminQuery = query(
      collection(db, GROUP_MEMBERS_COLLECTION),
      where('userId', '==', adminUserId),
      where('groupId', '==', groupId)
    );
    
    const adminSnapshot = await getDocs(adminQuery);
    
    if (adminSnapshot.empty) {
      throw new Error('You are not a member of this space');
    }
    
    const adminData = adminSnapshot.docs[0].data();
    if (adminData.role !== 'admin') {
      throw new Error('Only admins can remove members');
    }
    
    // Don't allow admins to remove themselves this way
    if (adminUserId === memberUserId) {
      throw new Error('Admins cannot remove themselves. Use the leave space option instead.');
    }
    
    // Check if target is the creator and the current user is not the creator
    if (memberUserId === creatorId && adminUserId !== creatorId) {
      throw new Error('The space creator cannot be removed by other admins');
    }
    
    // Delete the member document
    await deleteDoc(doc(db, GROUP_MEMBERS_COLLECTION, memberId));
    
    // Update the member count
    if (groupDoc.exists()) {
      await updateDoc(groupRef, {
        memberCount: Math.max((groupDoc.data().memberCount || 0) - 1, 0)
      });
    }

    try {
      await syncExistingSpaceChatMembers(groupId);
    } catch (chatErr) {
      console.warn('[SpaceChat] Failed to sync chat after member removal:', chatErr);
    }
  } catch (error) {
    console.error('Error removing member:', error);
    throw error;
  }
};

/**
 * Change a member's role in a group (promote/demote)
 */
export const updateMemberRole = async (
  groupId: string,
  adminUserId: string,
  memberId: string,
  newRole: 'admin' | 'moderator' | 'member'
): Promise<void> => {
  try {
    // Get the group document to check creator
    const groupDoc = await getDoc(doc(db, GROUPS_COLLECTION, groupId));
    if (!groupDoc.exists()) {
      throw new Error('Space not found');
    }
    
    const groupData = groupDoc.data() as Group;
    const creatorId = groupData.creatorId;
    
    // First, check if the user performing the action is an admin
    const adminQuery = query(
      collection(db, GROUP_MEMBERS_COLLECTION),
      where('userId', '==', adminUserId),
      where('groupId', '==', groupId)
    );
    
    const adminSnapshot = await getDocs(adminQuery);
    
    if (adminSnapshot.empty) {
      throw new Error('You are not a member of this space');
    }
    
    const adminData = adminSnapshot.docs[0].data();
    if (adminData.role !== 'admin') {
      throw new Error('Only admins can change member roles');
    }
    
    // Now get the target member document
    const memberDocRef = doc(db, GROUP_MEMBERS_COLLECTION, memberId);
    const memberDoc = await getDoc(memberDocRef);
    
    if (!memberDoc.exists()) {
      throw new Error('Member not found');
    }
    
    const memberData = memberDoc.data();
    
    // Check if target is the creator and the current user is not the creator
    if (memberData.userId === creatorId && adminUserId !== creatorId) {
      throw new Error('Only the space creator can change their own role');
    }
    
    // Update the member's role
    await updateDoc(memberDocRef, {
      role: newRole
    });
  } catch (error) {
    console.error('Error updating member role:', error);
    throw error;
  }
};

/**
 * Toggle group privacy (public/private)
 */
export const toggleGroupPrivacy = async (
  groupId: string,
  userId: string
): Promise<void> => {
  try {
    // Check if user is admin
    const memberQuery = query(
      collection(db, GROUP_MEMBERS_COLLECTION),
      where('userId', '==', userId),
      where('groupId', '==', groupId),
      where('role', '==', 'admin')
    );
    
    const memberSnapshot = await getDocs(memberQuery);
    if (memberSnapshot.empty) {
      throw new Error('Only admins can change space privacy settings');
    }
    
    // Get current group data
    const groupRef = doc(db, GROUPS_COLLECTION, groupId);
    const groupDoc = await getDoc(groupRef);
    
    if (!groupDoc.exists()) {
      throw new Error('Space not found');
    }
    
    // Update the privacy setting
    await updateDoc(groupRef, {
      isPrivate: !groupDoc.data().isPrivate,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error toggling group privacy:', error);
    throw error;
  }
};

/**
 * Delete a group
 */
export const deleteGroup = async (
  groupId: string,
  userId: string
): Promise<void> => {
  try {
    const authenticatedUid = await waitForAuthenticatedUid(userId);

    // Get the group data first to check creator
    const groupRef = doc(db, GROUPS_COLLECTION, groupId);
    const groupDoc = await getDoc(groupRef);
    
    if (!groupDoc.exists()) {
      throw new Error('Space not found');
    }
    
    const groupData = { ...(groupDoc.data() as Group), id: groupId };
    const normalizedCreatorId = typeof groupData.creatorId === 'string' ? groupData.creatorId.trim() : '';
    const normalizedUserId = authenticatedUid.trim();
    const isCreator = normalizedCreatorId === normalizedUserId;
    
    // Check if user is platform admin or super admin
    let isPlatformAdmin = false;
    try {
      const userDoc = await getDoc(doc(db, 'users', authenticatedUid));
      if (userDoc.exists()) {
        const userRole = userDoc.data().role || '';
        isPlatformAdmin = userRole === 'admin' || userRole === 'super admin';
      }
    } catch (userError) {
      console.error('Error checking user role:', userError);
    }
    
    // Check if user is group admin
    const memberQuery = query(
      collection(db, GROUP_MEMBERS_COLLECTION),
      where('userId', '==', authenticatedUid),
      where('groupId', '==', groupId),
      where('role', '==', 'admin')
    );
    
    const memberSnapshot = await getDocs(memberQuery);
    const isGroupAdmin = !memberSnapshot.empty;
    
    // Allow deletion if user is creator, platform admin, or group admin
    // Note: Firestore rules will also verify creator or platform admin for the actual deletion
    if (!isCreator && !isPlatformAdmin && !isGroupAdmin) {
      throw new Error('Only the space creator, space admins, or platform administrators can delete spaces');
    }

    // Preflight permission check on the group doc before deleting related data.
    // This prevents partial cleanup (e.g. memberships removed) when final group delete would be denied.
    try {
      await updateDoc(groupRef, { updatedAt: serverTimestamp() });
    } catch (preflightError: any) {
      if (preflightError?.code === 'permission-denied') {
        throw new Error('Permission denied while validating delete authorization. Please refresh and try again.');
      }
      throw preflightError;
    }
    
    // Delete cover image if it exists
    const coverImage = groupData.coverImage;
    if (coverImage) {
      const imageUrl = new URL(coverImage);
      const imagePath = decodeURIComponent(imageUrl.pathname.split('/o/')[1].split('?')[0]);
      const imageRef = ref(storage, imagePath);
      try {
        await deleteObject(imageRef);
      } catch (imageError) {
        console.error('Error deleting cover image:', imageError);
      }
    }
    
    // Get all members and delete them first (before deleting the group)
    const membersQuery = query(
      collection(db, GROUP_MEMBERS_COLLECTION),
      where('groupId', '==', groupId)
    );
    
    const membersSnapshot = await getDocs(membersQuery);
    
    // Keep the caller membership until group deletion finishes so rule-based
    // group-admin authorization is preserved for the final group delete.
    const callerMemberDocId = `${authenticatedUid}_${groupId}`;
    const deferredCallerMembershipDocs = membersSnapshot.docs.filter((memberDoc) => memberDoc.id === callerMemberDocId);
    const memberDocsToDeleteNow = membersSnapshot.docs.filter((memberDoc) => memberDoc.id !== callerMemberDocId);

    // Delete member documents except the caller membership (with error handling for individual failures)
    console.log('[DELETE GROUP] Deleting', memberDocsToDeleteNow.length, 'group members before deleting group doc');
    if (deferredCallerMembershipDocs.length > 0) {
      console.log('[DELETE GROUP] Deferring caller membership deletion until after group doc deletion:', callerMemberDocId);
    }
    const memberDeletePromises = memberDocsToDeleteNow.map(async (doc) => {
      try {
        console.log('[DELETE GROUP] Deleting member:', doc.id);
        await deleteDoc(doc.ref);
        console.log('[DELETE GROUP] Successfully deleted member:', doc.id);
      } catch (memberError: any) {
        console.error(`[DELETE GROUP] Error deleting group member ${doc.id}:`, memberError);
        console.error(`[DELETE GROUP] Member error code:`, memberError?.code);
        console.error(`[DELETE GROUP] Member error message:`, memberError?.message);
        // If it's a permission error, throw it so we can see which one failed
        if (memberError?.code === 'permission-denied') {
          throw new Error(`Permission denied when deleting group member ${doc.id}. Ensure your account has space admin rights for this space.`);
        }
        // Continue with other deletions even if one fails (for non-permission errors)
      }
    });
    await Promise.all(memberDeletePromises);
    console.log('[DELETE GROUP] Non-caller members deleted successfully');
    
    // If there's a linked space chat, delete it (best effort)
    if (groupData.spaceChatId) {
      try {
        const chat = await getChatById(groupData.spaceChatId);
        if (chat) {
          await deleteGroupChat(groupData.spaceChatId, chat.adminId || groupData.creatorId);
        }
      } catch (chatError) {
        console.error('Error deleting linked space chat:', chatError);
      }
    }

    // Get all posts and delete them (including subcollections)
    const postsQuery = query(
      collection(db, 'spacePosts'),
      where('groupId', '==', groupId)
    );
    
    const postsSnapshot = await getDocs(postsQuery);
    
    // Delete all posts with their subcollections (comments, reactions, likes)
    const postDeletePromises = postsSnapshot.docs.map(async (postDoc) => {
      try {
        const postId = postDoc.id;
        
        // Delete comments subcollection
        try {
          const commentsRef = collection(db, 'spacePosts', postId, 'comments');
          const commentsSnapshot = await getDocs(commentsRef);
          const commentDeletePromises = commentsSnapshot.docs.map(async (commentDoc) => {
            try {
              // Delete replies subcollection for each comment
              const repliesRef = collection(db, 'spacePosts', postId, 'comments', commentDoc.id, 'replies');
              const repliesSnapshot = await getDocs(repliesRef);
              const replyDeletePromises = repliesSnapshot.docs.map(replyDoc => deleteDoc(replyDoc.ref));
              await Promise.all(replyDeletePromises);
              
              // Delete the comment
              await deleteDoc(commentDoc.ref);
            } catch (err) {
              console.error(`Error deleting comment ${commentDoc.id}:`, err);
            }
          });
          await Promise.all(commentDeletePromises);
        } catch (err) {
          console.error(`Error deleting comments for post ${postId}:`, err);
        }
        
        // Delete reactions subcollection
        try {
          const reactionsRef = collection(db, 'spacePosts', postId, 'reactions');
          const reactionsSnapshot = await getDocs(reactionsRef);
          const reactionDeletePromises = reactionsSnapshot.docs.map(reactionDoc => deleteDoc(reactionDoc.ref));
          await Promise.all(reactionDeletePromises);
        } catch (err) {
          console.error(`Error deleting reactions for post ${postId}:`, err);
        }
        
        // Delete likes subcollection (if exists)
        try {
          const likesRef = collection(db, 'spacePosts', postId, 'likes');
          const likesSnapshot = await getDocs(likesRef);
          const likeDeletePromises = likesSnapshot.docs.map(likeDoc => deleteDoc(likeDoc.ref));
          await Promise.all(likeDeletePromises);
        } catch (err) {
          console.error(`Error deleting likes for post ${postId}:`, err);
        }
        
        // Finally delete the post document itself
        await deleteDoc(postDoc.ref);
      } catch (postError) {
        console.error(`Error deleting space post ${postDoc.id}:`, postError);
        // Continue with other deletions even if one fails
      }
    });
    await Promise.all(postDeletePromises);
    
    // Finally delete the group document (this must be last as Firestore rules check creatorId)
    console.log('[DELETE GROUP] ===== FINAL STEP: Deleting Group Document =====');
    console.log('[DELETE GROUP] Group ID:', groupId);
    console.log('[DELETE GROUP] User ID (requested):', userId);
    console.log('[DELETE GROUP] User ID (authenticated):', authenticatedUid);
    console.log('[DELETE GROUP] Group creatorId from document:', groupData.creatorId);
    console.log('[DELETE GROUP] Creator IDs match?', normalizedCreatorId === normalizedUserId);
    console.log('[DELETE GROUP] Is creator:', isCreator);
    console.log('[DELETE GROUP] Is platform admin:', isPlatformAdmin);
    console.log('[DELETE GROUP] Is group admin:', isGroupAdmin);
    console.log('[DELETE GROUP] Current auth user:', auth.currentUser?.uid);
    
    // Double-check the group document one more time before deletion
    const finalGroupCheck = await getDoc(groupRef);
    if (!finalGroupCheck.exists()) {
      throw new Error('Group document no longer exists');
    }
    const finalGroupData = finalGroupCheck.data();
    console.log('[DELETE GROUP] Final check - creatorId:', finalGroupData.creatorId);
    console.log('[DELETE GROUP] Final check - matches authenticated user?', (typeof finalGroupData.creatorId === 'string' ? finalGroupData.creatorId.trim() : '') === normalizedUserId);
    
    try {
      await deleteDoc(groupRef);
      console.log('[DELETE GROUP] ✅ Group document deleted successfully');

      // Best-effort cleanup for deferred caller membership after group doc is gone.
      if (deferredCallerMembershipDocs.length > 0) {
        try {
          await Promise.all(deferredCallerMembershipDocs.map((memberDoc) => deleteDoc(memberDoc.ref)));
          console.log('[DELETE GROUP] Deferred caller membership cleanup completed');
        } catch (deferredCleanupError) {
          console.warn('[DELETE GROUP] Deferred caller membership cleanup failed:', deferredCleanupError);
        }
      }
    } catch (deleteError: any) {
      console.error('[DELETE GROUP] ❌ Failed to delete group document');
      console.error('[DELETE GROUP] Error code:', deleteError?.code);
      console.error('[DELETE GROUP] Error message:', deleteError?.message);
      console.error('[DELETE GROUP] Full error:', deleteError);
      
      // Provide more helpful error message
      if (deleteError?.code === 'permission-denied') {
        throw new Error('Permission denied: Cannot delete space right now. Please refresh and try again. If this persists, verify your session is active and Firestore rules are deployed.');
      }
      throw new Error(`Failed to delete space: ${deleteError?.message || 'Unknown error. Please check the browser console for details.'}`);
    }
  } catch (error) {
    console.error('Error deleting group:', error);
    throw error;
  }
};

/**
 * Update group appearance settings
 */
export const updateGroupAppearance = async (
  groupId: string,
  userId: string,
  data: { 
    name?: string; 
    description?: string; 
    coverImage?: File | string;
    theme?: string;
    themeColors?: {
      primaryColor: string;
      secondaryColor: string;
      accentColor: string;
      textColor: string;
      bgColor: string;
    };
  }
): Promise<void> => {
  try {
    // Check if user is admin
    const memberQuery = query(
      collection(db, GROUP_MEMBERS_COLLECTION),
      where('userId', '==', userId),
      where('groupId', '==', groupId),
      where('role', '==', 'admin')
    );
    
    const memberSnapshot = await getDocs(memberQuery);
    if (memberSnapshot.empty) {
      throw new Error('Only admins can update space appearance');
    }
    
    // Get current group data
    const groupRef = doc(db, GROUPS_COLLECTION, groupId);
    const groupDoc = await getDoc(groupRef);
    
    if (!groupDoc.exists()) {
      throw new Error('Space not found');
    }
    
    const updateData: any = {
      updatedAt: serverTimestamp()
    };
    
    // Update name if provided
    if (data.name) {
      updateData.name = data.name;
    }
    
    // Update description if provided
    if (data.description) {
      updateData.description = data.description;
    }
      // Update cover image if provided
    if (data.coverImage && data.coverImage instanceof File) {
      // Delete old cover image if it exists
      const oldCoverImage = groupDoc.data().coverImage;
      if (oldCoverImage) {
        try {
          const imageUrl = new URL(oldCoverImage);
          const imagePath = decodeURIComponent(imageUrl.pathname.split('/o/')[1].split('?')[0]);
          const oldImageRef = ref(storage, imagePath);
          await deleteObject(oldImageRef);
        } catch (imageError) {
          console.error('Error deleting old cover image:', imageError);
        }
      }
      
      // Upload new cover image
      const imageId = uuidv4();
      const imageRef = ref(storage, `groups/${imageId}_${data.coverImage.name}`);
      
      await uploadBytes(imageRef, data.coverImage);
      updateData.coverImage = await getDownloadURL(imageRef);
    }

    // Update theme if provided
    if (data.theme) {
      updateData.theme = data.theme;
    }

    // Update theme colors if provided
    if (data.themeColors) {
      updateData.themeColors = data.themeColors;
    }
    
    // Update the group document
    await updateDoc(groupRef, updateData);
  } catch (error) {
    console.error('Error updating group appearance:', error);
    throw error;
  }
};

export default {
  createGroup,
  getGroups,
  getGroupById,
  getGroupsRealtime,
  getGroupByIdRealtime,
  joinGroup,
  leaveGroup,
  getUserGroupsRealtime,
  isGroupMember,
  getGroupCategories,
  getGroupMembers,
  getGroupMembersRealtime,
  updateMemberRole,
  removeMember,
  toggleGroupPrivacy,
  deleteGroup,
  updateGroupAppearance,
  sendGroupInvite,
  ensureSpaceChat
};