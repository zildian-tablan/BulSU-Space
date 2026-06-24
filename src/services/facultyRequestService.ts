import { 
  collection,
  getDocs,
  query,
  orderBy,
  Timestamp,
  doc,
  updateDoc,
  serverTimestamp,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  limit,
  where
} from 'firebase/firestore';
import { createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import { db } from '../firebase/config';
import { AuthInstanceManager } from '../firebase/auth-instance-manager';

// Collections
const FACULTY_ACCESS_REQUESTS_COLLECTION = 'faculty_access_requests';
const FACULTY_REQUEST_HISTORY_COLLECTION = 'faculty_request_history';

// Faculty Access Request interface - matches the fields stored in Firestore
export interface FacultyAccessRequest {
  id: string;
  firstName: string;
  lastName: string;
  idNumber: string;
  department: string;
  createdAt?: Timestamp;
  status?: string;
  email?: string; // Optional field
  phoneNumber?: string; // Optional field
  notes?: string; // Optional field
  accountCreated?: boolean; // Whether a user account has been created
  accountCreatedAt?: Timestamp; // When the account was created
  userId?: string; // UID of the created user
}

export interface FacultyRequestHistoryEntry extends FacultyAccessRequest {
  archivedAt?: Timestamp;
  actionTimestamp?: Timestamp; // copy for convenience
}

/**
 * Fetches all faculty access requests from the faculty_access_requests collection
 * 
 * @returns Promise<FacultyAccessRequest[]> - Array of faculty access request documents
 */
export const getAllFacultyAccessRequests = async (): Promise<FacultyAccessRequest[]> => {
  try {
    // Create a query against the collection, ordered by creation time if available
    // Fetch all then filter pending (or no status) locally because Firestore cannot query 'in' including null
    const requestsQuery = query(
      collection(db, FACULTY_ACCESS_REQUESTS_COLLECTION),
      orderBy('createdAt', 'desc')
    );
    
    // Get all documents from the collection
    const querySnapshot = await getDocs(requestsQuery);
    const requests: FacultyAccessRequest[] = [];
    
    // Process each document
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const status = data.status;
      if (status && status !== 'pending') return; // skip processed (should be archived)
      requests.push({
        id: docSnap.id,
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        idNumber: data.idNumber || '',
        department: data.department || '',
        createdAt: data.createdAt,
        status: status,
        email: data.email,
        phoneNumber: data.phoneNumber,
        notes: data.notes,
        accountCreated: data.accountCreated || false,
        accountCreatedAt: data.accountCreatedAt,
        userId: data.userId
      });
    });
    
    console.log(`Fetched ${requests.length} faculty access requests`);
    return requests;
  } catch (error) {
    console.error('Error fetching faculty access requests:', error);
    throw new Error('Failed to fetch faculty access requests');
  }
};

/**
 * Updates the status of a faculty access request
 * 
 * @param requestId - The ID of the request to update
 * @param status - The new status ('approved' or 'rejected')
 * @param adminId - The ID of the admin who performed the action
 * @returns Promise<void>
 */
// After-account-creation helper: store UID in 'device' collection with device_id []
const createDeviceDocument = async (uid: string) => {
  try {
    await setDoc(
      doc(db, 'device', uid),
      {
        user: uid,
        device_id: [],
      },
      { merge: true }
    );
  } catch (err) {
    // Non-blocking: do not interfere with account creation flow
    console.error('Error creating device document for UID', uid, err);
  }
};

/**
 * Creates a faculty account from an approved request
 * 
 * @param requestId - The ID of the faculty request
 * @returns Promise<string> - The UID of the created faculty account
 */
export const createFacultyAccount = async (requestId: string): Promise<string> => {
  try {
    // Start protected operation
    AuthInstanceManager.beginProtectedOperation();
    
    // Get secondary auth instance for user creation
    const secondaryAuth = AuthInstanceManager.getSecondaryAuth();
    if (!secondaryAuth) {
      throw new Error('Secondary auth instance not available');
    }
    
    // Get the request data
    const requestRef = doc(db, FACULTY_ACCESS_REQUESTS_COLLECTION, requestId);
    const requestSnap = await getDoc(requestRef);
    
    if (!requestSnap.exists()) {
      throw new Error('Faculty access request not found');
    }
    
    const requestData = requestSnap.data();

    // Build email username as {firstname}.{lastname} (lowercased, sanitized)
    const sanitize = (s: string) => (s || '')
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // strip diacritics
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase();
    const first = sanitize(requestData.firstName || '');
    const last = sanitize(requestData.lastName || '');
    const baseLocal = [first, last].filter(Boolean).join('.') || (requestData.idNumber || '').toString().toLowerCase();

    // Generate password (ID number + first 3 characters of last name, all lowercase)
    const lastName = requestData.lastName || '';
    const lastNamePrefix = lastName.substring(0, 3).toLowerCase();
    const password = `@BS${(requestData.idNumber || '').toString().toLowerCase()}${lastNamePrefix}`;

    // Try to create with base email; on collision, append increasing numbers
    let email = '';
    let userCredential: any = null;
    {
      let attempt = 0;
      const maxAttempts = 25;
      while (attempt < maxAttempts) {
        const candidate = `${baseLocal}${attempt === 0 ? '' : attempt}@bulsuspace.com`;
        try {
          userCredential = await createUserWithEmailAndPassword(secondaryAuth, candidate, password);
          email = candidate;
          break;
        } catch (err: any) {
          if (err?.code === 'auth/email-already-in-use') {
            attempt++;
            continue;
          }
          throw err; // rethrow non-collision errors
        }
      }
      if (!userCredential) {
        throw new Error('Failed to create faculty account: all email variants are in use');
      }
    }
    
    // Create user profile in Firestore
    await setDoc(doc(db, 'users', userCredential.user.uid), {
  email,
      name: `${requestData.firstName} ${requestData.lastName}`,
      idNumber: requestData.idNumber,
      department: requestData.department,
      role: 'faculty', // Set role as faculty
      profile_pic: `https://ui-avatars.com/api/?name=${encodeURIComponent(requestData.firstName + ' ' + requestData.lastName)}&background=E07A5F&color=fff`,
      isNewUser: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      phoneNumber: requestData.phoneNumber || '',
      approvedBy: requestData.updatedBy || null,
      approvedAt: requestData.actionTimestamp || null
    });
    
    // Create device document
    await createDeviceDocument(userCredential.user.uid);
    
    // Safely sign out from secondary auth
    await AuthInstanceManager.safelySignOutSecondary(secondaryAuth);
    
    // Update request with the created user ID
    await updateDoc(requestRef, {
      userId: userCredential.user.uid,
      accountCreated: true,
      accountCreatedAt: serverTimestamp()
    });
    
  console.log(`✅ Successfully created faculty account for ${requestData.firstName} ${requestData.lastName} (${email})`);
    console.log(`👨‍🏫 Faculty user created with UID: ${userCredential.user.uid}`);
    
    return userCredential.user.uid;
  } catch (error: any) {
    console.error('Error creating faculty account:', error);
    throw new Error(`Failed to create faculty account: ${error.message || 'Unknown error'}`);
  } finally {
    // End protected operation regardless of success/failure
    AuthInstanceManager.endProtectedOperation();
  }
};

export const updateFacultyRequestStatus = async (
  requestId: string, 
  status: 'approved' | 'rejected',
  adminId: string
): Promise<void> => {
  try {
    // First, try to update via client-side
    try {
      const requestRef = doc(db, FACULTY_ACCESS_REQUESTS_COLLECTION, requestId);
      
      await updateDoc(requestRef, {
        status,
        updatedAt: serverTimestamp(),
        updatedBy: adminId,
        actionTimestamp: serverTimestamp()
      });
      
      console.log(`Faculty request ${requestId} ${status} by admin ${adminId} (client-side)`);
      
      // If the request was approved, create a faculty account
      if (status === 'approved') {
        await createFacultyAccount(requestId);
      }

  // Archive the request (move to history collection and remove from active)
  await archiveFacultyRequest(requestId, status);
      
      return; // If successful, return early
    } catch (clientError) {
      console.warn('Client-side update failed, falling back to server API:', clientError);
      // Continue to server-side fallback
    }
    
    // Fallback: Try to use the server API
    const idToken = await getAuth().currentUser?.getIdToken();
    if (!idToken) {
      throw new Error('Authentication required');
    }
    
    const response = await fetch(`/api/faculty-requests/update-status/${requestId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({ status })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Server returned ${response.status}`);
    }
    
    console.log(`Faculty request ${requestId} ${status} by admin ${adminId} (server-side)`);

    // Attempt to archive after server-side update
    await archiveFacultyRequest(requestId, status);
  } catch (error: any) {
    console.error(`Error updating faculty request status:`, error);
    throw new Error(`Failed to ${status} faculty request`);
  }
};

/**
 * Archives a processed faculty request by copying it to the history collection
 * and deleting it from the active requests collection so it no longer shows
 * in the pending list.
 */
export const archiveFacultyRequest = async (
  requestId: string,
  status: 'approved' | 'rejected'
): Promise<void> => {
  try {
    const requestRef = doc(db, FACULTY_ACCESS_REQUESTS_COLLECTION, requestId);
    const snap = await getDoc(requestRef);
    if (!snap.exists()) {
      console.warn('Attempted to archive missing faculty request', requestId);
      return;
    }

    const data = snap.data();
    const historyRef = doc(db, FACULTY_REQUEST_HISTORY_COLLECTION, requestId); // reuse same ID for traceability
    await setDoc(historyRef, {
      ...data,
      status, // ensure status stored
      archivedAt: serverTimestamp(),
    });

    // Delete original only after successful history write
    await deleteDoc(requestRef);
    console.log(`Archived faculty request ${requestId} -> history (${status})`);
  } catch (err) {
    console.error('Error archiving faculty request', requestId, err);
    // Non-fatal: Do not throw to avoid blocking user flow; could be retried later
  }
};

/**
 * Real-time listener for faculty request history entries.
 */
export const listenFacultyRequestHistory = (
  onUpdate: (history: FacultyRequestHistoryEntry[]) => void,
  limitCount: number = 50
): (() => void) => {
  try {
    const q = query(
      collection(db, FACULTY_REQUEST_HISTORY_COLLECTION),
      orderBy('archivedAt', 'desc'),
      limit(limitCount)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: FacultyRequestHistoryEntry[] = [];
      snapshot.forEach(docSnap => {
        const d = docSnap.data() as any;
        items.push({
          id: docSnap.id,
            firstName: d.firstName || '',
            lastName: d.lastName || '',
            idNumber: d.idNumber || '',
            department: d.department || '',
            createdAt: d.createdAt,
            status: d.status,
            email: d.email,
            phoneNumber: d.phoneNumber,
            notes: d.notes,
            accountCreated: d.accountCreated,
            accountCreatedAt: d.accountCreatedAt,
            userId: d.userId,
            archivedAt: d.archivedAt,
            actionTimestamp: d.actionTimestamp
        });
      });
      onUpdate(items);
    }, (error) => {
      console.error('Error listening to faculty request history:', error);
    });

    return unsubscribe;
  } catch (err) {
    console.error('Failed to set up faculty request history listener', err);
    throw err;
  }
};

