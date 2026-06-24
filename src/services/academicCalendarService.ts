import { 
  collection, 
  doc, 
  addDoc, 
  getDocs, 
  query, 
  orderBy, 
  Timestamp, 
  serverTimestamp,
  updateDoc,
  deleteDoc,
  getDoc,
  where
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { ActivityLogger } from './activityLogService';
import { getAuth } from 'firebase/auth';

// Constants for collection path
const ACADEMIC_CALENDAR_COLLECTION = 'acadCalendar';

// Academic Event interface
export interface AcademicEvent {
  id: string;
  title: string;
  startDate: Timestamp;
  endDate: Timestamp;
  isDateRange: boolean; // true if it's a date range, false if single date
  createdBy: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

// Create Academic Event input interface
export interface CreateAcademicEventInput {
  title: string;
  startDate: Timestamp;
  endDate: Timestamp;
  isDateRange: boolean;
  createdBy: string;
}

// Create a new academic event
export const createAcademicEvent = async (eventData: CreateAcademicEventInput): Promise<string> => {
  try {
    // Validate input data
    if (!eventData.title || !eventData.title.trim()) {
      throw new Error('Event title is required');
    }
    
    if (!eventData.startDate || !eventData.endDate) {
      throw new Error('Start and end dates are required');
    }
    
    // Ensure end date is not before start date
    if (eventData.endDate.toDate() < eventData.startDate.toDate()) {
      throw new Error('End date cannot be before start date');
    }

    const academicEventDoc = await addDoc(collection(db, ACADEMIC_CALENDAR_COLLECTION), {
      ...eventData,
      title: eventData.title.trim(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    console.log('Academic event created successfully with ID:', academicEventDoc.id);
    
    // Activity logging for admin/super admin
    const auth = getAuth();
    const currentUser = auth.currentUser;
    if (currentUser && (eventData.createdBy === currentUser.uid)) {
      const logger = ActivityLogger.getInstance();
      await logger.logActivity(
        'academic_event_created',
        `Academic event created: ${eventData.title}`,
        {
          eventTitle: eventData.title,
          startDate: eventData.startDate?.toDate?.() || eventData.startDate,
          endDate: eventData.endDate?.toDate?.() || eventData.endDate,
          isDateRange: eventData.isDateRange,
          createdBy: eventData.createdBy,
        },
        'medium',
        academicEventDoc.id,
        'academic_event'
      );
    }
    return academicEventDoc.id;
  } catch (error) {
    console.error('Error creating academic event:', error);
    throw new Error('Failed to create academic event');
  }
};

// Get all academic events
export const getAcademicEvents = async (): Promise<AcademicEvent[]> => {
  try {
    const academicEventsQuery = query(
      collection(db, ACADEMIC_CALENDAR_COLLECTION),
      orderBy('startDate', 'asc')
    );
    
    const querySnapshot = await getDocs(academicEventsQuery);
    const academicEvents: AcademicEvent[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      
      // Validate required fields
      if (data.title && data.startDate && data.endDate && data.createdBy) {
        academicEvents.push({
          id: doc.id,
          title: data.title,
          startDate: data.startDate,
          endDate: data.endDate,
          isDateRange: data.isDateRange || false,
          createdBy: data.createdBy,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        });
      } else {
        console.warn('Skipping academic event with missing required fields:', doc.id, data);
      }
    });
    
    console.log(`Fetched ${academicEvents.length} academic events`);
    return academicEvents;
  } catch (error) {
    console.error('Error fetching academic events:', error);
    throw new Error('Failed to fetch academic events');
  }
};

// Get upcoming academic events (events that haven't ended yet)
export const getUpcomingAcademicEvents = async (): Promise<AcademicEvent[]> => {
  try {
    const now = Timestamp.now();
    console.log('Fetching upcoming academic events, current time:', now.toDate());
    
    // Query for events that haven't ended yet
    const upcomingEventsQuery = query(
      collection(db, ACADEMIC_CALENDAR_COLLECTION),
      where('endDate', '>=', now),
      orderBy('endDate', 'asc')
    );
    
    const querySnapshot = await getDocs(upcomingEventsQuery);
    const academicEvents: AcademicEvent[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      
      // Validate required fields
      if (data.title && data.startDate && data.endDate && data.createdBy) {
        academicEvents.push({
          id: doc.id,
          title: data.title,
          startDate: data.startDate,
          endDate: data.endDate,
          isDateRange: data.isDateRange || false,
          createdBy: data.createdBy,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        });
      } else {
        console.warn('Skipping academic event with missing required fields:', doc.id, data);
      }
    });
    
    console.log(`Fetched ${academicEvents.length} upcoming academic events`);
    
    // Additional client-side filtering for extra safety
    const currentDate = new Date();
    const filteredEvents = academicEvents.filter(event => {
      const eventEndDate = event.endDate.toDate();
      return eventEndDate >= currentDate;
    });
    
    console.log(`After client-side filtering: ${filteredEvents.length} upcoming academic events`);
    return filteredEvents;
  } catch (error) {
    console.error('Error fetching upcoming academic events:', error);
    
    // Fallback to getting all events and filtering client-side
    try {
      console.log('Falling back to client-side filtering...');
      const allEvents = await getAcademicEvents();
      const currentDate = new Date();
      const upcomingEvents = allEvents.filter(event => {
        const eventEndDate = event.endDate.toDate();
        return eventEndDate >= currentDate;
      });
      
      console.log(`Fallback: Found ${upcomingEvents.length} upcoming academic events`);
      return upcomingEvents;
    } catch (fallbackError) {
      console.error('Fallback also failed:', fallbackError);
      throw new Error('Failed to fetch upcoming academic events');
    }
  }
};

// Get recent academic events (events that ended in the last 30 days)
export const getRecentAcademicEvents = async (days: number = 30): Promise<AcademicEvent[]> => {
  try {
    const now = Timestamp.now();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - days);
    const thirtyDaysAgoTimestamp = Timestamp.fromDate(thirtyDaysAgo);
    
    const recentEventsQuery = query(
      collection(db, ACADEMIC_CALENDAR_COLLECTION),
      where('endDate', '>=', thirtyDaysAgoTimestamp),
      where('endDate', '<=', now),
      orderBy('endDate', 'desc')
    );
    
    const querySnapshot = await getDocs(recentEventsQuery);
    const academicEvents: AcademicEvent[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      
      if (data.title && data.startDate && data.endDate && data.createdBy) {
        academicEvents.push({
          id: doc.id,
          title: data.title,
          startDate: data.startDate,
          endDate: data.endDate,
          isDateRange: data.isDateRange || false,
          createdBy: data.createdBy,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        });
      }
    });
    
    return academicEvents;
  } catch (error) {
    console.error('Error fetching recent academic events:', error);
    throw new Error('Failed to fetch recent academic events');
  }
};

// Update an academic event
export const updateAcademicEvent = async (eventId: string, updates: Partial<CreateAcademicEventInput>): Promise<void> => {
  try {
    // Validate updates
    if (updates.title && !updates.title.trim()) {
      throw new Error('Event title cannot be empty');
    }
    
    if (updates.startDate && updates.endDate) {
      if (updates.endDate.toDate() < updates.startDate.toDate()) {
        throw new Error('End date cannot be before start date');
      }
    }

    const eventRef = doc(db, ACADEMIC_CALENDAR_COLLECTION, eventId);
    await updateDoc(eventRef, {
      ...updates,
      ...(updates.title && { title: updates.title.trim() }),
      updatedAt: serverTimestamp()
    });
    
    console.log('Academic event updated successfully');
  } catch (error) {
    console.error('Error updating academic event:', error);
    throw new Error('Failed to update academic event');
  }
};

// Delete an academic event
export const deleteAcademicEvent = async (eventId: string): Promise<void> => {
  try {
    // Fetch event details for logging
    const eventRef = doc(db, ACADEMIC_CALENDAR_COLLECTION, eventId);
    const eventSnap = await getDoc(eventRef);
    let eventTitle = '';
    if (eventSnap.exists()) {
      const data = eventSnap.data();
      eventTitle = data.title;
    }
    await deleteDoc(eventRef);
    console.log('Academic event deleted successfully');
    
    // Activity logging for admin/super admin
    const { getAuth } = await import('firebase/auth');
    const auth = getAuth();
    const currentUser = auth.currentUser;
    if (currentUser) {
      const { ActivityLogger } = await import('./activityLogService');
      const logger = ActivityLogger.getInstance();
      await logger.logActivity(
        'academic_event_deleted',
        `Academic event deleted: ${eventTitle || eventId}`,
        {
          eventId,
          eventTitle,
          deletedBy: currentUser.uid,
        },
        'medium',
        eventId,
        'academic_event'
      );
    }
  } catch (error) {
    console.error('Error deleting academic event:', error);
    throw new Error('Failed to delete academic event');
  }
};

// Get a single academic event by ID
export const getAcademicEventById = async (eventId: string): Promise<AcademicEvent | null> => {
  try {
    const eventRef = doc(db, ACADEMIC_CALENDAR_COLLECTION, eventId);
    const eventSnap = await getDoc(eventRef);
    
    if (eventSnap.exists()) {
      const data = eventSnap.data();
      
      // Validate required fields
      if (data.title && data.startDate && data.endDate && data.createdBy) {
        return {
          id: eventSnap.id,
          title: data.title,
          startDate: data.startDate,
          endDate: data.endDate,
          isDateRange: data.isDateRange || false,
          createdBy: data.createdBy,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        };
      } else {
        console.warn('Academic event missing required fields:', eventId, data);
        return null;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching academic event:', error);
    throw new Error('Failed to fetch academic event');
  }
};
