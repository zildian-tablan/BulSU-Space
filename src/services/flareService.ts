import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  orderBy, 
  limit,
  serverTimestamp,
  Timestamp,
  getDoc,
  doc,
  deleteDoc,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytes, 
  getDownloadURL 
  , deleteObject
} from 'firebase/storage';
import { db, storage } from '../firebase/config';
import { v4 as uuidv4 } from 'uuid';
import { Flare, CreateFlareData } from '../models/Flare';

const FLARES_COLLECTION = 'flares';

/**
 * Create a new flare
 */
export const createFlare = async (data: CreateFlareData): Promise<string> => {
  try {
    // Enforce video-only flares
    if (!data.mediaFile || !data.mediaFile.type || !data.mediaFile.type.startsWith('video/')) {
      throw new Error('Only video files are allowed for flares');
    }
    // Get user data
    const userDoc = await getDoc(doc(db, 'users', data.userId));
    if (!userDoc.exists()) {
      throw new Error('User not found');
    }
    const userData = userDoc.data();

    // Upload media file to Firebase Storage
    const fileExtension = data.mediaFile.name.split('.').pop();
    const fileName = `${uuidv4()}.${fileExtension}`;
    const storagePath = `flares/${data.userId}/${fileName}`;
    const storageRef = ref(storage, storagePath);
    
    await uploadBytes(storageRef, data.mediaFile);
    const mediaUrl = await getDownloadURL(storageRef);

    // Create flare document
    const flareData = {
      userId: data.userId,
      userName: userData.name || 'Anonymous',
      userProfilePic: userData.profile_pic || '',
      mediaUrl: mediaUrl,
      mediaType: 'video' as const,
      description: data.description || '',
      createdAt: serverTimestamp(),
      viewCount: 0,
      likeCount: 0
    };

    const docRef = await addDoc(collection(db, FLARES_COLLECTION), flareData);
    console.log('Flare created with ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Error creating flare:', error);
    throw error;
  }
};

/**
 * Get all flares ordered by creation date (newest first)
 */
export const getFlares = async (maxFlares: number = 20): Promise<Flare[]> => {
  try {
    const flaresQuery = query(
      collection(db, FLARES_COLLECTION),
      orderBy('createdAt', 'desc'),
      limit(maxFlares)
    );

    const snapshot = await getDocs(flaresQuery);
    const flares: Flare[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      flares.push({
        id: doc.id,
        userId: data.userId,
        userName: data.userName,
        userProfilePic: data.userProfilePic,
        mediaUrl: data.mediaUrl,
        mediaType: data.mediaType,
        thumbnail: data.thumbnail,
        description: data.description,
        createdAt: data.createdAt as Timestamp,
        viewCount: data.viewCount || 0,
        likeCount: data.likeCount || 0
      });
    });

    return flares;
  } catch (error) {
    console.error('Error fetching flares:', error);
    throw error;
  }
};

/**
 * Get flares with pagination support
 */
export const getFlaresPaginated = async (
  pageSize: number = 20,
  lastDoc?: QueryDocumentSnapshot<DocumentData>
): Promise<{ flares: Flare[]; lastVisible: QueryDocumentSnapshot<DocumentData> | null }> => {
  try {
    let flaresQuery = query(
      collection(db, FLARES_COLLECTION),
      orderBy('createdAt', 'desc'),
      limit(pageSize)
    );

    if (lastDoc) {
      flaresQuery = query(
        collection(db, FLARES_COLLECTION),
        orderBy('createdAt', 'desc'),
        startAfter(lastDoc),
        limit(pageSize)
      );
    }

    const snapshot = await getDocs(flaresQuery);
    const flares: Flare[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      flares.push({
        id: doc.id,
        userId: data.userId,
        userName: data.userName,
        userProfilePic: data.userProfilePic,
        mediaUrl: data.mediaUrl,
        mediaType: data.mediaType,
        thumbnail: data.thumbnail,
        description: data.description,
        createdAt: data.createdAt as Timestamp,
        viewCount: data.viewCount || 0,
        likeCount: data.likeCount || 0
      });
    });

    const lastVisible = snapshot.docs[snapshot.docs.length - 1] || null;

    return { flares, lastVisible };
  } catch (error) {
    console.error('Error fetching flares:', error);
    throw error;
  }
};

/**
 * Get flares by specific user
 */
export const getUserFlares = async (userId: string): Promise<Flare[]> => {
  try {
    const flaresQuery = query(
      collection(db, FLARES_COLLECTION),
      orderBy('createdAt', 'desc')
    );

    const snapshot = await getDocs(flaresQuery);
    const flares: Flare[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.userId === userId) {
        flares.push({
          id: doc.id,
          userId: data.userId,
          userName: data.userName,
          userProfilePic: data.userProfilePic,
          mediaUrl: data.mediaUrl,
          mediaType: data.mediaType,
          thumbnail: data.thumbnail,
          description: data.description,
          createdAt: data.createdAt as Timestamp,
          viewCount: data.viewCount || 0,
          likeCount: data.likeCount || 0
        });
      }
    });

    return flares;
  } catch (error) {
    console.error('Error fetching user flares:', error);
    throw error;
  }
};

/**
 * Delete flare document
 */
export const deleteFlare = async (flareId: string): Promise<void> => {
  try {
    // Attempt to delete associated storage objects (media, thumbnails) if present
    try {
      const docRef = doc(db, FLARES_COLLECTION, flareId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() as any;
        const toDeletePaths: string[] = [];

        const extractStoragePathFromUrl = (url?: string | null) => {
          if (!url || typeof url !== 'string') return null;
          // firebase getDownloadURL format includes '/o/<encodedPath>' before query params
          const m = url.match(/\/o\/([^?#]+)/);
          if (m && m[1]) return decodeURIComponent(m[1]);
          return null;
        };

        const mediaPath = extractStoragePathFromUrl(data.mediaUrl);
        if (mediaPath) toDeletePaths.push(mediaPath);

        const thumbPath = extractStoragePathFromUrl(data.thumbnail);
        if (thumbPath) toDeletePaths.push(thumbPath);

        for (const p of toDeletePaths) {
          try {
            const sRef = ref(storage, p);
            await deleteObject(sRef);
          } catch (e: any) {
            // Ignore not-found errors and log others
            if (e?.code === 'storage/object-not-found' || (e?.message && e.message.includes('does not exist'))) {
              // already removed
            } else {
              console.warn('[flareService] deleteObject failed for', p, e);
            }
          }
        }
      }
    } catch (e) {
      console.warn('[flareService] Failed to remove associated storage objects for flare', flareId, e);
    }

    await deleteDoc(doc(db, FLARES_COLLECTION, flareId));
  } catch (error) {
    console.error('Error deleting flare:', error);
    throw error;
  }
};

/**
 * Fetch a single flare by id
 */
export const getFlareById = async (flareId: string): Promise<Flare | null> => {
  try {
    const docRef = doc(db, FLARES_COLLECTION, flareId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      id: snap.id,
      userId: data.userId,
      userName: data.userName,
      userProfilePic: data.userProfilePic,
      mediaUrl: data.mediaUrl,
      mediaType: data.mediaType,
      thumbnail: data.thumbnail,
      description: data.description,
      createdAt: data.createdAt as Timestamp,
      viewCount: data.viewCount || 0,
      likeCount: data.likeCount || 0
    } as Flare;
  } catch (error) {
    console.error('Error fetching flare by id:', error);
    throw error;
  }
};
