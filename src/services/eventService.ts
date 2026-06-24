import { 
  collection, 
  doc, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  Timestamp, 
  serverTimestamp,
  updateDoc,
  deleteDoc,
  getDoc,
  increment
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from 'firebase/storage';
import { db, storage } from '../firebase/config';
import { v4 as uuidv4 } from 'uuid';

// Constants for collection paths
const EVENTS_COLLECTION = 'events';
const EVENT_REGISTRATIONS_COLLECTION = 'event_registrations';

// Event category type
export type EventCategory = 
  | 'Academic'
  | 'Workshop'
  | 'Seminar'
  | 'Conference'
  | 'Social'
  | 'Cultural'
  | 'Sports'
  | 'Career'
  | 'Research'
  | 'Technology'
  | 'Health & Wellness'
  | 'Environmental'
  | 'Other';

// Event interface
export interface Event {
  id: string;
  title: string;
  description: string;
  location: string;
  category: EventCategory;
  start: Timestamp;
  end: Timestamp;
  coverImage: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  creatorName?: string;
  creatorRole?: string;
  registrationCount?: number;
  registrationLink?: string;
}

// Event registration interface
export interface EventRegistration {
  id: string;
  eventId: string;
  userId: string;
  registeredAt: Timestamp;
  userName?: string;
  userRole?: string;
  userProfilePic?: string;
  attendance?: 'present' | 'absent' | 'late' | null;
}

// Create a new event
export const createEvent = async (
  event: Omit<Event, 'id' | 'createdAt' | 'updatedAt' | 'registrationCount'>
): Promise<string> => {
  try {
    // Add event to Firestore
    const docRef = await addDoc(collection(db, EVENTS_COLLECTION), {
      ...event,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      registrationCount: 0
    });
    
    return docRef.id;
  } catch (error) {
    console.error('Error creating event:', error);
    throw error;
  }
};

// Get all events
export const getAllEvents = async (): Promise<Event[]> => {
  try {
    const eventsRef = collection(db, EVENTS_COLLECTION);
    const q = query(eventsRef, orderBy('start', 'asc'));
    const eventDocs = await getDocs(q);
    
    return eventDocs.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.title,
        description: data.description,
        location: data.location,
        category: data.category,
        start: data.start,
        end: data.end,
        coverImage: data.coverImage,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        creatorName: data.creatorName,
        creatorRole: data.creatorRole,
        registrationCount: data.registrationCount || 0,
        registrationLink: data.registrationLink
      } as Event;
    });
  } catch (error) {
    console.error('Error getting events:', error);
    throw error;
  }
};

// Get upcoming events
export const getUpcomingEvents = async (): Promise<Event[]> => {
  try {
    const eventsRef = collection(db, EVENTS_COLLECTION);
    const now = Timestamp.now();
    const q = query(eventsRef, where('end', '>=', now), orderBy('end', 'asc'));
    const eventDocs = await getDocs(q);
    
    return eventDocs.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.title,
        description: data.description,
        location: data.location,
        category: data.category,
        start: data.start,
        end: data.end,
        coverImage: data.coverImage,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        creatorName: data.creatorName,
        creatorRole: data.creatorRole,
        registrationCount: data.registrationCount || 0,
        registrationLink: data.registrationLink
      } as Event;
    });
  } catch (error) {
    console.error('Error getting upcoming events:', error);
    throw error;
  }
};

// Get past events
export const getPastEvents = async (): Promise<Event[]> => {
  try {
    const eventsRef = collection(db, EVENTS_COLLECTION);
    const now = Timestamp.now();
    const q = query(eventsRef, where('end', '<', now), orderBy('end', 'desc'));
    const eventDocs = await getDocs(q);
    
    return eventDocs.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.title,
        description: data.description,
        location: data.location,
        category: data.category,
        start: data.start,
        end: data.end,
        coverImage: data.coverImage,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        creatorName: data.creatorName,
        creatorRole: data.creatorRole,
        registrationCount: data.registrationCount || 0,
        registrationLink: data.registrationLink
      } as Event;
    });
  } catch (error) {
    console.error('Error getting past events:', error);
    throw error;
  }
};

// Get event by ID
export const getEventById = async (eventId: string): Promise<Event | null> => {
  try {
    const eventRef = doc(db, EVENTS_COLLECTION, eventId);
    const eventDoc = await getDoc(eventRef);
    
    if (!eventDoc.exists()) {
      return null;
    }    const data = eventDoc.data();
    return {
      id: eventDoc.id,
      title: data.title,
      description: data.description,
      location: data.location,
      category: data.category,
      start: data.start,
      end: data.end,
      coverImage: data.coverImage,
      createdBy: data.createdBy,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      creatorName: data.creatorName,
      creatorRole: data.creatorRole,
      registrationCount: data.registrationCount || 0,
      registrationLink: data.registrationLink
    } as Event;
  } catch (error) {
    console.error('Error getting event by ID:', error);
    throw error;
  }
};

// Register for an event
export const registerForEvent = async (
  eventId: string, 
  userId: string,
  userName: string,
  userRole: string,
  userProfilePic?: string
): Promise<string> => {
  try {
    // Create the registration document
    const registrationRef = await addDoc(collection(db, EVENT_REGISTRATIONS_COLLECTION), {
      eventId,
      userId,
      userName,
      userRole,
      userProfilePic,
      registeredAt: serverTimestamp(),
      attendance: null
    });
    
    // Update the event's registration count
    const eventRef = doc(db, EVENTS_COLLECTION, eventId);
    await updateDoc(eventRef, {
      registrationCount: increment(1)
    });
    
    return registrationRef.id;
  } catch (error) {
    console.error('Error registering for event:', error);
    throw error;
  }
};

// Check if user is registered for an event
export const isUserRegisteredForEvent = async (
  eventId: string,
  userId: string
): Promise<boolean> => {
  try {
    const registrationsRef = collection(db, EVENT_REGISTRATIONS_COLLECTION);
    const q = query(
      registrationsRef, 
      where('eventId', '==', eventId),
      where('userId', '==', userId)
    );
    
    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty;
  } catch (error) {
    console.error('Error checking event registration:', error);
    throw error;
  }
};

// Unregister from an event
export const unregisterFromEvent = async (
  eventId: string,
  userId: string
): Promise<void> => {
  try {
    const registrationsRef = collection(db, EVENT_REGISTRATIONS_COLLECTION);
    const q = query(
      registrationsRef, 
      where('eventId', '==', eventId),
      where('userId', '==', userId)
    );
    
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      // Delete the registration document
      await deleteDoc(doc(db, EVENT_REGISTRATIONS_COLLECTION, querySnapshot.docs[0].id));
      
      // Update the event's registration count
      const eventRef = doc(db, EVENTS_COLLECTION, eventId);
      await updateDoc(eventRef, {
        registrationCount: increment(-1)
      });
    }
  } catch (error) {
    console.error('Error unregistering from event:', error);
    throw error;
  }
};

// Get events created by a specific user
export const getUserCreatedEvents = async (userId: string): Promise<Event[]> => {
  try {
    const eventsRef = collection(db, EVENTS_COLLECTION);
    const q = query(eventsRef, where('createdBy', '==', userId), orderBy('start', 'asc'));
    const eventDocs = await getDocs(q);
    
    return eventDocs.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.title,
        description: data.description,
        location: data.location,
        category: data.category,
        start: data.start,
        end: data.end,
        coverImage: data.coverImage,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        creatorName: data.creatorName,
        creatorRole: data.creatorRole,
        registrationCount: data.registrationCount || 0
      } as Event;
    });
  } catch (error) {
    console.error('Error getting user created events:', error);
    throw error;
  }
};

// Get events registered by a specific user
export const getUserRegisteredEvents = async (userId: string): Promise<Event[]> => {
  try {
    // Find all event registrations for this user
    const registrationsRef = collection(db, EVENT_REGISTRATIONS_COLLECTION);
    const q = query(registrationsRef, where('userId', '==', userId));
    const registrationDocs = await getDocs(q);
    
    // Get the event IDs from the registrations
    const eventIds = registrationDocs.docs.map(doc => doc.data().eventId);
    
    // Get the events by IDs
    const events: Event[] = [];
    for (const eventId of eventIds) {
      const event = await getEventById(eventId);
      if (event) {
        events.push(event);
      }
    }
    
    // Sort events by start date
    return events.sort((a, b) => a.start.toMillis() - b.start.toMillis());
  } catch (error) {
    console.error('Error getting user registered events:', error);
    throw error;
  }
};

// Upload event cover image
export const uploadEventCoverImage = async (file: File): Promise<string> => {
  try {
    const fileExtension = file.name.split('.').pop();
    const fileName = `events/${uuidv4()}.${fileExtension}`;
    const storageRef = ref(storage, fileName);
    
    await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(storageRef);
    
    return downloadURL;
  } catch (error) {
    console.error('Error uploading event cover image:', error);
    throw error;
  }
};

// Delete an event
export const deleteEvent = async (eventId: string): Promise<void> => {
  try {
    // Fetch event details for logging
    const eventRef = doc(db, 'events', eventId);
    const eventSnap = await getDoc(eventRef);
    let eventTitle = '';
    if (eventSnap.exists()) {
      const data = eventSnap.data();
      eventTitle = data.title;
    }
    await deleteDoc(eventRef);
    // Activity logging for admin/super admin
    const { getAuth } = await import('firebase/auth');
    const auth = getAuth();
    const currentUser = auth.currentUser;
    if (currentUser) {
      const { ActivityLogger } = await import('./activityLogService');
      const logger = ActivityLogger.getInstance();
      await logger.logActivity(
        'event_deleted',
        `Event deleted: ${eventTitle || eventId}`,
        {
          eventId,
          eventTitle,
          deletedBy: currentUser.uid,
        },
        'medium',
        eventId,
        'event'
      );
    }
  } catch (error) {
    console.error('Error deleting event:', error);
    throw new Error('Failed to delete event');
  }
};

// End of file
