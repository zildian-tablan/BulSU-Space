import { collection, addDoc, query, orderBy, limit, startAfter, getDocs, serverTimestamp, QueryDocumentSnapshot, DocumentData, where, deleteDoc, doc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import { v4 as uuidv4 } from 'uuid';
import { isSuperAdminRole } from '../utils/messagingPermissions';

const NEWS_COLLECTION = 'space_news';

export interface NewsItem {
  id: string;
  title: string;
  description: string;
  location?: string;
  coordinates?: { lat: number; lng: number };
  imageUrl?: string;
  createdBy: string;
  creatorName?: string;
  creatorProfilePic?: string;
  createdAt: any;
}

export const createNews = async (news: Omit<NewsItem, 'id' | 'createdAt'>): Promise<string> => {
  try {
    // Firestore rejects undefined field values. Remove any keys that are undefined
    const payload: any = { ...news, createdAt: serverTimestamp() };
    Object.keys(payload).forEach((k) => {
      if (payload[k] === undefined) delete payload[k];
    });

    const docRef = await addDoc(collection(db, NEWS_COLLECTION), payload);
    return docRef.id;
  } catch (error) {
    console.error('Error creating news:', error);
    throw error;
  }
};

export const uploadNewsImage = async (file: File): Promise<string> => {
  try {
    const ext = file.name.split('.').pop();
    const fileName = `news/${uuidv4()}.${ext}`;
    const storageRef = ref(storage, fileName);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    return url;
  } catch (error) {
    console.error('Error uploading news image:', error);
    throw error;
  }
};

// Pagination helper: fetch a page of news ordered by createdAt desc
export const fetchNewsPage = async (pageSize = 10, lastDoc?: QueryDocumentSnapshot<DocumentData>, beforeDate?: any) => {
  try {
    const newsRef = collection(db, NEWS_COLLECTION);
    let q;
    // if a beforeDate is provided, only fetch items with createdAt < beforeDate (useful to exclude today's items)
    if (beforeDate) {
      if (lastDoc) {
        q = query(newsRef, where('createdAt', '<', beforeDate), orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(pageSize));
      } else {
        q = query(newsRef, where('createdAt', '<', beforeDate), orderBy('createdAt', 'desc'), limit(pageSize));
      }
    } else {
      if (lastDoc) {
        q = query(newsRef, orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(pageSize));
      } else {
        q = query(newsRef, orderBy('createdAt', 'desc'), limit(pageSize));
      }
    }
    const snap = await getDocs(q);
    const items: NewsItem[] = snap.docs.map(d => ({
      id: d.id,
      title: d.data().title,
      description: d.data().description,
      location: d.data().location,
      coordinates: d.data().coordinates,
      imageUrl: d.data().imageUrl,
      createdBy: d.data().createdBy,
      creatorName: d.data().creatorName,
      creatorProfilePic: d.data().creatorProfilePic,
      createdAt: d.data().createdAt
    }));

    const last = snap.docs.length ? snap.docs[snap.docs.length - 1] : undefined;
    return { items, lastDoc: last };
  } catch (error) {
    console.error('Error fetching news page:', error);
    throw error;
  }
};

export const deleteNews = async (newsId: string, actorRole?: string | null): Promise<void> => {
  try {
    if (!newsId || typeof newsId !== 'string') {
      throw new Error('Invalid news id.');
    }

    if (!isSuperAdminRole(actorRole)) {
      throw new Error('Only super admins can delete news.');
    }

    await deleteDoc(doc(db, NEWS_COLLECTION, newsId));
  } catch (error) {
    console.error('Error deleting news:', error);
    throw error;
  }
};
