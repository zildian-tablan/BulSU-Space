import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout';
import { useAuth } from '../contexts/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
import { 
  DocumentArrowUpIcon, 
  XMarkIcon, 
  InformationCircleIcon,
  ArrowUpTrayIcon,
  TableCellsIcon,
  UserPlusIcon,
  ShieldCheckIcon,
  ChartBarIcon,
  CloudArrowUpIcon,
  UserGroupIcon,
  ExclamationTriangleIcon,  ClockIcon,
  CalendarIcon,
  DocumentTextIcon,
  DocumentMagnifyingGlassIcon,
  AcademicCapIcon,
  UserIcon,
  BuildingLibraryIcon,
  BriefcaseIcon,
  EnvelopeOpenIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';
import { CheckCircleIcon, SparklesIcon } from '@heroicons/react/24/solid';
import { createUserWithEmailAndPassword, getAuth, browserLocalPersistence, setPersistence, signInWithEmailAndPassword, initializeAuth, connectAuthEmulator } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp, collection, query, where, getDocs, Timestamp, onSnapshot, orderBy } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth, db } from '../firebase/config';
import { AuthInstanceManager } from '../firebase/auth-instance-manager';
import { initializeApp } from 'firebase/app';
// Import xlsx with type reference
import * as XLSX from 'xlsx';
import { getUserCounts } from '../services/userService';
import { saveUploadHistory, getUploadHistoryRealtime } from '../services/uploadHistoryService';
import { ActivityLogger } from '../services/activityLogService';
import { properCaseName } from '../utils/nameUtils';
import ConfirmModal from '../components/common/ConfirmModal';
import { getAllFacultyAccessRequests, FacultyAccessRequest, updateFacultyRequestStatus, listenFacultyRequestHistory, FacultyRequestHistoryEntry } from '../services/facultyRequestService';

// After-account-creation helper: store UID in 'device' collection with device_id []
// Includes a short retry to handle rule dependency on users/{uid} (especially for dean->faculty flow)
const createDeviceDocument = async (uid: string, maxRetries: number = 3): Promise<void> => {
  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      await setDoc(
        doc(db, 'device', uid),
        { user: uid, device_id: [] },
        { merge: true }
      );
      return; // success
    } catch (err: any) {
      const code = err?.code || '';
      const msg = err?.message || '';
      const isPerm = code === 'permission-denied' || /insufficient permissions/i.test(msg);
      if (isPerm && attempt < maxRetries) {
        // Ensure the user doc is present and role is visible to rules before retry
        try {
          const uSnap = await getDoc(doc(db, 'users', uid));
          // If not yet visible/created, wait briefly then retry
          if (!uSnap.exists()) {
            await delay(300);
            attempt++;
            continue;
          }
        } catch (_) {
          // Swallow and retry after a short delay
        }
        await delay(300);
        attempt++;
        continue;
      }
      // Non-blocking: log and exit after max retries or non-permission errors
      console.error('Error creating device document for UID', uid, err);
      return;
    }
  }
};

// Create a secondary Firebase app instance for user creation
// This prevents the primary auth instance from changing during batch user creation
// NOTE: This uses Firebase web API key which is public by design and restricted by Firebase Security Rules.
// These are NOT the same as the private service account keys that must be kept secret.
const secondaryAppConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
};

const secondaryApp = initializeApp(secondaryAppConfig, "secondary");
const secondaryAuth = getAuth(secondaryApp);

// Register secondary auth instance with the auth manager
AuthInstanceManager.registerSecondaryAuth(secondaryAuth);

interface BatchUploadState {
  file: File | null;
  isUploading: boolean;
  errorMessage: string | null;
  successMessage: string | null;
  usersToProcess: number | null;
  processedUsers: number;
  parsedUsers: BatchUser[];
  parsedEmails: string[];
  invalidData: string[];
}

interface SkippedUsersNotification {
  isVisible: boolean;
  skippedUsers: string[];
  totalCount: number;
}

interface BatchUser {
  firstName: string;
  lastName: string;
  idNumber: string;
  program: string;
  organization?: string;
  email?: string;
  role?: string;
  password?: string;
}

type CreationMode = 'student' | 'alumni';

const STUDENT_TEMPLATE_PATH = '/Account Creator Sheet - Student.xlsx';
const ALUMNI_TEMPLATE_PATH = '/Account Creator Sheet  - Alumni.xlsx';

interface AdminCreationState {
  isOpen: boolean;
  email: string;
  name: string;
  idNumber?: string; // Make ID number optional
  office: string;
  password: string;
  adminNumber: string;
  isLoading: boolean;
  error: string | null;
  success: string | null;
}

interface DeanCreationState {
  isOpen: boolean;
  name: string;
  email: string;
  password: string;
  deanNumber: string; // sequential number used in email/id
  isLoading: boolean;
  error: string | null;
  success: string | null;
}

interface InfirmaryCreationState {
  isOpen: boolean;
  name: string;
  email: string;
  password: string;
  isLoading: boolean;
  error: string | null;
  success: string | null;
}

interface LibrarianCreationState {
  isOpen: boolean;
  name: string;
  email: string;
  password: string;
  isLoading: boolean;
  error: string | null;
  success: string | null;
}

interface UploadHistoryItem {
  id: string;
  timestamp: Date;
  filename: string;
  usersCreated: number;
  usersSkipped: number;
  usersErrored: number;
  totalUsers: number;
  status: 'completed' | 'failed' | 'partial';
  userId?: string;
  uploadedBy?: string;
}

interface DashboardStats {
  totalAccounts: number;
  recentUploads: number;
  successRate: number;
  studentCount: number;
  facultyCount: number;
  alumniCount: number;
  staffCount: number;
  adminCount?: number;
  superAdminCount?: number;
  deanCount?: number;
  infirmaryCount?: number;
  librarianCount?: number;
  recentStudents?: number;
  recentFaculty?: number;
  recentAlumni?: number;
  recentStaff?: number;
}

interface FacultyRequestsState {
  requests: FacultyAccessRequest[];
  isLoading: boolean;
  error: string | null;
  successMessage?: string | null;
}
  interface FacultyRequestHistoryState {
    items: FacultyRequestHistoryEntry[];
    paginated: FacultyRequestHistoryEntry[];
    currentPage: number;
    itemsPerPage: number;
  }

const AccountCreatorPage: React.FC = () => {
  const { currentUser } = useAuth();
  const { setActiveTab } = useSidebar();
  const navigate = useNavigate();
  const [state, setState] = useState<BatchUploadState>({
    file: null,
    isUploading: false,
    errorMessage: null,
    successMessage: null,
    usersToProcess: null,
    processedUsers: 0,
    parsedUsers: [],
    parsedEmails: [],
    invalidData: []
  });
  // Faculty request history (approved/rejected) separate from active requests
  const [facultyHistory, setFacultyHistory] = useState<FacultyRequestHistoryState>({
    items: [],
    paginated: [],
    currentPage: 1,
    itemsPerPage: 5
  });
  // Access control check
  useEffect(() => {
    // Check if user is authorized to access this page
    // Allowed: super admin, dean, or (admin AND office "registrar")
    const isAuthorized = 
      currentUser?.role === 'super admin' || 
      currentUser?.role === 'dean' ||
      (currentUser?.role === 'admin' && 
       'office' in (currentUser || {}) && 
       ((currentUser as any).office?.toLowerCase() === 'registrar'));
    
    // For debugging
    if (currentUser?.role === 'admin' && 'office' in (currentUser || {})) {
      console.log(`Access check for admin user, office: "${(currentUser as any).office}"`);
    }
    
    if (!isAuthorized) {
      // Redirect to Groups page if not authorized
      console.log('User not authorized to access Account Creator page, redirecting to Groups page');
      navigate('/groups');
    }
  }, [currentUser, navigate]);
  
  // Set active tab when component mounts
  useEffect(() => {
    setActiveTab('account-creator');
  }, [setActiveTab]);


  // Fetch real user counts when component mounts
  useEffect(() => {
    const fetchUserCounts = async () => {
      try {
        const counts = await getUserCounts();
        setStats(prev => ({
          ...prev,
          ...counts
        }));
      } catch (error) {
        console.error('Error fetching user counts:', error);
      }    };    fetchUserCounts();
  }, []);
  // Real-time listener for user role counts
  useEffect(() => {
    const usersRef = collection(db, 'users');
    const unsubscribe = onSnapshot(usersRef, (snapshot) => {
      const newCounts = {
        studentCount: 0,
        facultyCount: 0,
        alumniCount: 0,
        staffCount: 0,
        adminCount: 0,
        superAdminCount: 0,
        deanCount: 0,
        infirmaryCount: 0,
        librarianCount: 0,
        totalAccounts: snapshot.size
      } as any;

      snapshot.forEach(docSnap => {
        const role = (docSnap.data().role || '').toLowerCase();
        switch (role) {
          case 'student': newCounts.studentCount++; break;
          case 'faculty': newCounts.facultyCount++; break;
          case 'alumni': newCounts.alumniCount++; break;
          case 'staff': newCounts.staffCount++; break;
          case 'admin': newCounts.adminCount++; break;
          case 'super admin': newCounts.superAdminCount++; break;
          case 'dean': newCounts.deanCount++; break;
          case 'infirmary': newCounts.infirmaryCount++; break;
          case 'librarian': newCounts.librarianCount++; break;
          default: break;
        }
      });

      setStats(prev => {
        // Avoid re-render if counts unchanged
        const changed = Object.keys(newCounts).some(k => (prev as any)[k] !== newCounts[k]);
        if (!changed) return prev;
        return { ...prev, ...newCounts };
      });
    }, (error) => {
      console.error('Real-time user stats listener error:', error);
    });

    return () => unsubscribe();
  }, []);

  // Function to fetch all faculty access requests
  const fetchFacultyAccessRequests = async () => {
    setFacultyRequests(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const requests = await getAllFacultyAccessRequests();
      setFacultyRequests({
        requests,
        isLoading: false,
        error: null,
        successMessage: null
      });
      console.log(`Fetched ${requests.length} faculty access requests`);
    } catch (error) {
      console.error('Error fetching faculty access requests:', error);
      setFacultyRequests(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to load faculty access requests. Please try again.'
      }));
    }
  };
  
  // Function to handle approving a faculty request
  const handleApproveRequest = async (requestId: string) => {
    if (!currentUser?.id) return;
    
    // Set pending action state
    setPendingActions(prev => ({ ...prev, [requestId]: 'approving' }));
    
    try {
  await updateFacultyRequestStatus(requestId, 'approved', currentUser.id);
      
      // Update local state to reflect the change immediately (do not set facultyRequests.successMessage to avoid duplicate alerts)
      setFacultyRequests(prev => ({
        ...prev,
        requests: prev.requests.map(req => 
          req.id === requestId ? { 
            ...req, 
            status: 'approved',
            accountCreated: true,
            accountCreatedAt: Timestamp.now()
          } : req
        ),
        error: null
      }));
  // Show an action alert for the approve operation
  setActionAlert({ message: 'Request approved and faculty account created successfully', type: 'success' });
  setTimeout(() => setActionAlert(null), 3000);
      // Open success dialog (best-effort name from current list)
      try {
        const req = facultyRequestsRef.current.find(r => r.id === requestId);
        const name = req ? `${req.firstName} ${req.lastName}` : 'Faculty';
        setSuccessDialog({ open: true, title: 'Account Created', description: `Faculty account created for ${name}.` });
      } catch (_) { /* noop */ }
      
    } catch (error) {
      console.error('Error approving request:', error);
      setFacultyRequests(prev => ({
        ...prev,
        error: 'Failed to approve request. Please try again.'
      }));
  setActionAlert({ message: 'Failed to approve request. Please try again.', type: 'error' });
  setTimeout(() => setActionAlert(null), 3000);
    } finally {
      // Clear pending action state
      setPendingActions(prev => {
        const updated = { ...prev };
        delete updated[requestId];
        return updated;
      });
    }
  };
  
  // Function to handle rejecting a faculty request
  const handleRejectRequest = async (requestId: string) => {
    if (!currentUser?.id) return;
    
    // Set pending action state
    setPendingActions(prev => ({ ...prev, [requestId]: 'rejecting' }));
    
    try {
      await updateFacultyRequestStatus(requestId, 'rejected', currentUser.id);
      
      // Update local state to reflect the change immediately (do not set facultyRequests.successMessage - use actionAlert instead)
      setFacultyRequests(prev => ({
        ...prev,
        requests: prev.requests.map(req => 
          req.id === requestId ? { ...req, status: 'rejected' } : req
        ),
        error: null
      }));
  // Show an action alert for the reject operation
  setActionAlert({ message: 'Request rejected successfully', type: 'success' });
  setTimeout(() => setActionAlert(null), 3000);
      
    } catch (error) {
      console.error('Error rejecting request:', error);
      setFacultyRequests(prev => ({
        ...prev,
        error: 'Failed to reject request. Please try again.'
      }));
  setActionAlert({ message: 'Failed to reject request. Please try again.', type: 'error' });
  setTimeout(() => setActionAlert(null), 3000);
    } finally {
      // Clear pending action state
      setPendingActions(prev => {
        const updated = { ...prev };
        delete updated[requestId];
        return updated;
      });
    }
  };

  // Fetch faculty access requests when component mounts
  useEffect(() => {
    fetchFacultyAccessRequests();
  }, []);

  // Real-time listener for pending faculty access requests
  useEffect(() => {
    const requestsRef = collection(db, 'faculty_access_requests');
    const q = query(requestsRef, orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const pending: FacultyAccessRequest[] = [];
      snapshot.forEach(docSnap => {
        const d: any = docSnap.data();
        const status = d.status;
        if (status && status !== 'pending') return; // skip processed (archived elsewhere)
        pending.push({
          id: docSnap.id,
          firstName: d.firstName || '',
          lastName: d.lastName || '',
          idNumber: d.idNumber || '',
          department: d.department || '',
          createdAt: d.createdAt,
          status: status,
          email: d.email,
          phoneNumber: d.phoneNumber,
          notes: d.notes,
          accountCreated: d.accountCreated || false,
          accountCreatedAt: d.accountCreatedAt,
          userId: d.userId
        });
      });
      // Ensure any requests that are currently being acted on remain visible until the action completes
      const pendingIds = new Set(pending.map(p => p.id));
      Object.keys(pendingActionsRef.current || {}).forEach(id => {
        if (!pendingIds.has(id)) {
          // Try to reuse cached request data so the UI shows the name while the action finishes
          const cached = facultyRequestsRef.current.find(r => r.id === id);
          if (cached) {
            pending.push({ ...cached });
          } else {
            // Fallback placeholder with minimal info
            pending.push({
              id,
              firstName: '',
              lastName: '',
              idNumber: '',
              department: '',
              createdAt: null as any,
              status: 'pending',
              email: '',
              phoneNumber: '',
              notes: '',
              accountCreated: false,
              accountCreatedAt: null as any,
              userId: ''
            });
          }
        }
      });
      setFacultyRequests(prev => ({
        ...prev,
        requests: pending,
        isLoading: false,
        error: null
      }));
    }, (error) => {
      console.error('Faculty requests real-time listener error:', error);
      setFacultyRequests(prev => ({ ...prev, error: 'Real-time update failed' }));
    });
    return () => unsubscribe();
  }, []);
  // Real-time listener for faculty request history
  useEffect(() => {
    const unsubscribe = listenFacultyRequestHistory((history) => {
      setFacultyHistory(prev => {
        const updated = { ...prev, items: history };
        const start = (updated.currentPage - 1) * updated.itemsPerPage;
        const end = start + updated.itemsPerPage;
        updated.paginated = updated.items.slice(start, end);
        return { ...updated };
      });
    }, 100);
    return () => unsubscribe();
  }, []);
  // Recalculate paginated history when page changes
  useEffect(() => {
    setFacultyHistory(prev => {
      const start = (prev.currentPage - 1) * prev.itemsPerPage;
      const end = start + prev.itemsPerPage;
      return { ...prev, paginated: prev.items.slice(start, end) };
    });
  }, [facultyHistory.currentPage]);

  // Load upload history from Firestore with real-time updates
  useEffect(() => {
    const unsubscribe = getUploadHistoryRealtime((history) => {
      setUploadHistory(history);
    }, 50); // Load latest 50 uploads

    return () => unsubscribe(); // Cleanup on unmount
  }, []);

  // Map program to organization
  const mapProgramToOrganization = (program: string): string => {
    const programUpper = program.toUpperCase().trim();
    
    if (programUpper.includes('BSIT') || programUpper.includes('BS IT') || programUpper.includes('BACHELOR OF SCIENCE IN INFORMATION TECHNOLOGY')) {
      return 'POSHED';
    }
    
    if (programUpper.includes('BIT') || programUpper.includes('BACHELOR OF INDUSTRIAL TECHNOLOGY')) {
      return 'FIPO';
    }
    
    if (programUpper.includes('BSTM') || programUpper.includes('BS TM') || programUpper.includes('BACHELOR OF SCIENCE IN TOURISM MANAGEMENT') ||
        programUpper.includes('BSHM') || programUpper.includes('BS HM') || programUpper.includes('BACHELOR OF SCIENCE IN HOSPITALITY MANAGEMENT')) {
      return 'SHATMO';
    }
    
    if (programUpper.includes('BSED') || programUpper.includes('BS ED') || programUpper.includes('BACHELOR OF SECONDARY EDUCATION') ||
        programUpper.includes('BEED') || programUpper.includes('BE ED') || programUpper.includes('BACHELOR OF ELEMENTARY EDUCATION') ||
        programUpper.includes('BTLED') || programUpper.includes('BTL ED') || programUpper.includes('BACHELOR OF TECHNOLOGY AND LIVELIHOOD EDUCATION')) {
      return 'AFEA';
    }
    
    // Default to NONE if no match found
    return 'NONE';
  };

  // Parse Excel/CSV file
  const parseStudentUpload = async (file: File): Promise<{ validUsers: BatchUser[], invalidRows: string[] }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBufferLike);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const sheetData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

          const validUsers: BatchUser[] = [];
          const invalidRows: string[] = [];

          if (!sheetData || sheetData.length === 0) {
            invalidRows.push('The uploaded file is empty.');
            return resolve({ validUsers, invalidRows });
          }

            // Get headers (first row)
          const headers = sheetData[0].map((h: any) => h?.toString().toLowerCase().trim() || '');
          // Find indices
          const firstNameIndex = headers.findIndex((h: string) => h === 'first name' || h === 'firstname' || h === 'first_name');
          const lastNameIndex = headers.findIndex((h: string) => h === 'last name' || h === 'lastname' || h === 'last_name');
          const idNumberIndex = headers.findIndex((h: string) => h === 'id number' || h === 'idnumber' || h === 'id_number' || h === 'id');
          const programIndex = headers.findIndex((h: string) => h === 'program' || h === 'course');

          const missingHeaders: string[] = [];
          if (firstNameIndex === -1) missingHeaders.push('First Name');
          if (lastNameIndex === -1) missingHeaders.push('Last Name');
          if (idNumberIndex === -1) missingHeaders.push('ID Number');
          if (programIndex === -1) missingHeaders.push('Program');
          if (missingHeaders.length > 0) {
            invalidRows.push(`Missing required columns: ${missingHeaders.join(', ')}`);
            return resolve({ validUsers, invalidRows });
          }

          for (let i = 1; i < sheetData.length; i++) {
            const row = sheetData[i];
            if (!row || row.length === 0) continue;
            const firstNameRaw = row[firstNameIndex]?.toString().trim();
            const lastNameRaw = row[lastNameIndex]?.toString().trim();
            const idNumber = row[idNumberIndex]?.toString().trim();
            const program = row[programIndex]?.toString().trim();
            if (!firstNameRaw || !lastNameRaw || !idNumber || !program) {
              invalidRows.push(`Row ${i + 1}: Missing required field(s)`);
              continue;
            }
            const firstName = properCaseName(firstNameRaw);
            const lastName = properCaseName(lastNameRaw);
            const organization = mapProgramToOrganization(program);
            validUsers.push({ firstName, lastName, idNumber, program, organization });
          }
          resolve({ validUsers, invalidRows });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsArrayBuffer(file);
    });
  };

  const parseAlumniInviteFile = async (
    file: File
  ): Promise<{ emails: string[]; invalidRows: string[]; duplicateCount: number }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBufferLike);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const sheetData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

          const invalidRows: string[] = [];
          const emailSet = new Set<string>();
          let duplicateCount = 0;

          if (!sheetData || sheetData.length === 0) {
            invalidRows.push('The uploaded file is empty.');
            return resolve({ emails: [], invalidRows, duplicateCount });
          }

          const headers = (sheetData[0] || []).map((h: any) => h?.toString().trim() || '');
          const normalizedHeaders = headers.map(h => h.toLowerCase());
          const emailColumnIndex = normalizedHeaders.findIndex((h: string) => {
            if (h === 'email') return true;
            const stripped = h.replace(/[^a-z]/g, '');
            return stripped === 'email' || h.includes('email');
          });
          const nonEmptyHeaders = headers.filter(Boolean);

          if (emailColumnIndex === -1) {
            invalidRows.push('Missing required column: Email');
            return resolve({ emails: [], invalidRows, duplicateCount });
          }

          if (nonEmptyHeaders.length > 1) {
            invalidRows.push('Alumni invite sheet must only contain the Email column.');
            return resolve({ emails: [], invalidRows, duplicateCount });
          }

          for (let i = 1; i < sheetData.length; i++) {
            const row = sheetData[i];
            if (!row || row.length === 0) continue;
            const rawEmail = row[emailColumnIndex]?.toString().trim();
            if (!rawEmail) {
              invalidRows.push(`Row ${i + 1}: Missing email`);
              continue;
            }
            const normalized = rawEmail.toLowerCase();
            const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailPattern.test(normalized)) {
              invalidRows.push(`Row ${i + 1}: Invalid email format (${rawEmail})`);
              continue;
            }
            if (emailSet.has(normalized)) {
              duplicateCount++;
              continue;
            }
            emailSet.add(normalized);
          }

          resolve({ emails: Array.from(emailSet), invalidRows, duplicateCount });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsArrayBuffer(file);
    });
  };
  // Create user accounts in Firebase
  const createUserAccounts = async (
    users: BatchUser[],
    mode: CreationMode = 'student'
  ): Promise<{successCount: number, skippedCount: number, errorCount: number, skippedUsers: string[], createdUsers: Array<{ email: string; password: string; name: string; idNumber: string }>}> => {
    let successCount = 0;
    let skippedCount = 0; // Users that already exist
    let errorCount = 0;   // Users that failed for other reasons
    let skippedUsers: string[] = []; // Array to store names of skipped users
    const createdUsersForEmail: Array<{ email: string; password: string; name: string; idNumber: string }> = [];
    const targetRole = mode === 'alumni' ? 'alumni' : 'student';
    const modeLabel = mode === 'alumni' ? 'alumni invite' : 'student account';
      console.log(`🔒 Starting batch ${modeLabel} processing using secondary auth instance`);
    console.log('🔒 Admin session will be preserved during user creation process');
    
    // Begin a protected auth operation
    AuthInstanceManager.beginProtectedOperation();
    
    for (let i = 0; i < users.length; i++) {
      const user = users[i];      
      try {
        // Use the exact ID number for the email address
        // Format: idnumber@bulsuspace.com (exactly as requested)
        const email = `${user.idNumber}@bulsuspace.com`;
        
  // Generate password using the ID number + 5 random letters (upper/lower)
  // Final format: @BS{idNumber}{random5}
  const password = `@BS${user.idNumber}${generateAlphaCode(5)}`;
        
        // Pre-check: Skip if a user with the same ID number/student number already exists in Firestore
        // Handle both hyphenated and non-hyphenated variants to avoid duplicate entries
        try {
          const rawId = (user.idNumber || '').trim();
          const digitsOnly = rawId.replace(/-/g, '');
          const hyphenated = digitsOnly.length === 10 ? `${digitsOnly.slice(0, 4)}-${digitsOnly.slice(4)}` : rawId;
          const idCandidates = Array.from(new Set([rawId, digitsOnly, hyphenated])).filter(Boolean) as string[];

          if (idCandidates.length > 0) {
            const dupQuery = query(collection(db, 'users'), where('idNumber', 'in', idCandidates.slice(0, 10)));
            const dupSnap = await getDocs(dupQuery);
            if (!dupSnap.empty) {
              // Duplicate found by ID number — count as skipped (consistent with email-already-in-use handling)
              skippedCount++;
              skippedUsers.push(`${properCaseName(user.firstName)} ${properCaseName(user.lastName)}`);
              console.log(`⚠️ Duplicate ID detected for ${user.firstName} ${user.lastName} (idNumber: ${user.idNumber}) — skipping`);
              
              // Update progress state before continuing to next
              setState(prev => ({
                ...prev,
                processedUsers: i + 1
              }));
              
              continue; // Skip Auth creation
            }
          }
        } catch (dupCheckErr) {
          // If duplicate check fails, proceed with creation attempt to avoid blocking the batch
          console.warn('Duplicate ID pre-check failed; proceeding with creation attempt:', dupCheckErr);
        }
        
        try {
          // Use the secondary auth instance to create users
          // This prevents the primary auth instance from changing state
          const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
            // Add user data to Firestore using the user's UID from secondary auth
          await setDoc(doc(db, 'users', userCredential.user.uid), {
            email,
            name: `${user.firstName} ${user.lastName}`,
            idNumber: user.idNumber,
            program: user.program,
            department: user.organization || 'NONE', // Map organization to department field
            role: targetRole,
            profile_pic: `https://ui-avatars.com/api/?name=${encodeURIComponent(user.firstName + ' ' + user.lastName)}&background=0D8ABC&color=fff`,
            isNewUser: true, // Set as new user to show terms modal
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          // Create corresponding device document for the new user (non-blocking inside helper)
          await createDeviceDocument(userCredential.user.uid);
          
          // Safely sign out from secondary auth to clean up
          await AuthInstanceManager.safelySignOutSecondary(secondaryAuth);
          
          successCount++;
          console.log(`✅ Successfully created account for ${user.firstName} ${user.lastName} (${email})`);
          // Queue for credentials email dispatch
          createdUsersForEmail.push({ email, password, name: `${user.firstName} ${user.lastName}`, idNumber: user.idNumber });
          
        } catch (innerError: any) {
          if (innerError?.code === 'auth/email-already-in-use') {
            // User already exists - this is not an error, just skip
            skippedCount++;
            skippedUsers.push(`${properCaseName(user.firstName)} ${properCaseName(user.lastName)}`);
            console.log(`⚠️ Account already exists for ${user.firstName} ${user.lastName} (${email}) - skipping`);
          } else {
            // Other authentication errors
            errorCount++;
            console.error(`❌ Error creating account for ${user.firstName} ${user.lastName}:`, innerError);
            console.error(`Failed ID: "${user.idNumber}", Email format: "${email}"`);
          }
        }
        
        // Update progress state
        setState(prev => ({
          ...prev,
          processedUsers: i + 1
        }));
        
        // Add small delay to avoid hitting Firebase rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        errorCount++;
        console.error(`❌ Unexpected error processing ${user.firstName} ${user.lastName}:`, error);
        // Continue with next user despite errors
      }
    }    
    // End the protected auth operation
    AuthInstanceManager.endProtectedOperation();
    
    console.log('🔒 Batch processing completed. Admin session preserved.');
    console.log(`📊 Results: ${successCount} created, ${skippedCount} skipped, ${errorCount} failed`);
    
    // Activity logging for batch account creation (admins/super admins only)
    if (
      currentUser?.role === 'super admin' ||
      (currentUser?.role === 'admin' && 'office' in (currentUser || {}) && ((currentUser as any).office?.toLowerCase() === 'registrar'))
    ) {
      const logger = ActivityLogger.getInstance();
      await logger.logActivity(
        'batch_accounts_created',
        `${mode === 'alumni' ? 'Alumni invites' : 'Batch account creation'}: ${successCount} created, ${skippedCount} skipped, ${errorCount} failed`,
        {
          filename: state.file?.name || '',
          usersCreated: successCount,
          usersSkipped: skippedCount,
          usersErrored: errorCount,
          totalUsers: users.length,
          skippedUsers,
        },
        'medium'
      );
    }
    return { successCount, skippedCount, errorCount, skippedUsers, createdUsers: createdUsersForEmail };
  };

  // Helper: send credentials via callable, fallback to HTTP endpoint on network/proxy errors
  const sendCredentialsBatchWithFallback = async (users: Array<{ email: string; password: string; name?: string; idNumber?: string; mfaEmail?: string }>) => {
    if (!users || users.length === 0) return { success: true, sent: 0, failed: 0 } as any;
    try {
      const functions = getFunctions();
      const sendBatch = httpsCallable(functions, 'sendNewAccountCredentialsBatch');
      const result: any = await sendBatch({ users });
      return result?.data || { success: true };
    } catch (err) {
      // Fallback to HTTP endpoint with explicit CORS allowed by the function
      try {
        const resp = await fetch('https://us-central1-bulsuspace.cloudfunctions.net/sendNewAccountCredentialsBatchHttp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ users })
        });
        const data = await resp.json();
        return data;
      } catch (httpErr) {
        console.error('[AccountCreator] Email dispatch failed (callable and HTTP fallback):', httpErr);
        return { success: false, message: 'Dispatch failed' };
      }
    }
  };

  const sendAlumniInvitesWithFallback = async (
    invites: Array<{ email: string; invitedBy?: string; invitedByName?: string; sourceFile?: string }>
  ) => {
    if (!invites || invites.length === 0) return { success: true, sent: 0, failed: 0, skipped: 0 } as any;
    try {
      const functions = getFunctions();
      const sendBatch = httpsCallable(functions, 'sendAlumniInvitesBatch');
      const result: any = await sendBatch({ invites });
      return result?.data || { success: true };
    } catch (err) {
      try {
        const resp = await fetch('https://us-central1-bulsuspace.cloudfunctions.net/sendAlumniInvitesBatchHttp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invites })
        });
        const data = await resp.json();
        return data;
      } catch (httpErr) {
        console.error('[AccountCreator] Alumni invite dispatch failed (callable and HTTP fallback):', httpErr);
        return { success: false, message: 'Dispatch failed' };
      }
    }
  };

  // Admin creation state
  const [adminState, setAdminState] = useState<AdminCreationState>({
    isOpen: false,
    email: '',
    name: '',
  office: '',
    password: '',
    adminNumber: '',
    isLoading: false,
    error: null,
    success: null
  });  
  // Dean creation state
  const [deanState, setDeanState] = useState<DeanCreationState>({
    isOpen: false,
    name: '',
    email: '',
    password: '',
    deanNumber: '',
    isLoading: false,
    error: null,
    success: null
  });
  // Infirmary and Librarian creation state
  const [infirmaryState, setInfirmaryState] = useState<InfirmaryCreationState>({
    isOpen: false,
    name: 'Infirmary',
    email: '',
    password: '',
    isLoading: false,
    error: null,
    success: null
  });
  const [librarianState, setLibrarianState] = useState<LibrarianCreationState>({
    isOpen: false,
    name: 'Librarian',
    email: '',
    password: '',
    isLoading: false,
    error: null,
    success: null
  });

  // Unified modal state for creating various staff roles (dean/admin/infirmary/librarian/faculty)
  const [unifiedModalOpen, setUnifiedModalOpen] = useState(false);
  // Use a plain string here to avoid strict union mismatch across different code paths (we compare against literals below)
  const [unifiedRole, setUnifiedRole] = useState<string>('admin');
  const [unifiedName, setUnifiedName] = useState('');
  const [unifiedOffice, setUnifiedOffice] = useState('');
  const [unifiedMfaEmail, setUnifiedMfaEmail] = useState('');
  // Suggestions for MFA email domain (auto-complete only for allowed domains)
  const [unifiedMfaSuggestions, setUnifiedMfaSuggestions] = useState<string[]>([]);
  const [showUnifiedMfaSuggestions, setShowUnifiedMfaSuggestions] = useState(false);
  // Email-already-in-use modal state
  const [showEmailInUseModal, setShowEmailInUseModal] = useState(false);
  const [emailInUseMessage, setEmailInUseMessage] = useState('');
  const [unifiedLoading, setUnifiedLoading] = useState(false);
  const unifiedNameRef = useRef<HTMLInputElement | null>(null);
  // Unified faculty fields (for manual faculty creation from Add Role)
  const [unifiedFacultyFirstName, setUnifiedFacultyFirstName] = useState('');
  const [unifiedFacultyLastName, setUnifiedFacultyLastName] = useState('');
  const [unifiedFacultyId, setUnifiedFacultyId] = useState('');
  const [unifiedFacultyDepartment, setUnifiedFacultyDepartment] = useState('');
    // Real upload history for actual uploads
  const [uploadHistory, setUploadHistory] = useState<UploadHistoryItem[]>([]);
  
  // Faculty access requests state
  const [facultyRequests, setFacultyRequests] = useState<FacultyRequestsState>({
    requests: [],
    isLoading: false,
    error: null
  });

  // State for tracking requests with pending actions
  const [pendingActions, setPendingActions] = useState<{[key: string]: 'approving' | 'rejecting'}>({});
  // Keep a ref to the latest pendingActions so real-time listeners can access up-to-date values
  const pendingActionsRef = useRef<{[key: string]: 'approving' | 'rejecting'}>({});

  // Sync ref whenever pendingActions state changes
  useEffect(() => {
    pendingActionsRef.current = pendingActions;
  }, [pendingActions]);

  // Keep a ref to the latest facultyRequests.requests so we can preserve row data while actions are pending
  const facultyRequestsRef = useRef<FacultyAccessRequest[]>([]);
  useEffect(() => {
    facultyRequestsRef.current = facultyRequests.requests || [];
  }, [facultyRequests.requests]);
  
  // Skipped users notification state
  const [skippedNotification, setSkippedNotification] = useState<SkippedUsersNotification>({
    isVisible: false,
    skippedUsers: [],
    totalCount: 0
  });
    // Dashboard statistics
  const [stats, setStats] = useState<DashboardStats>({
    totalAccounts: 0,
    recentUploads: 0,
    successRate: 98.5,
    studentCount: 0,
    facultyCount: 0, 
    alumniCount: 0,
    staffCount: 0,
    adminCount: 0,
    superAdminCount: 0,
    deanCount: 0,
    infirmaryCount: 0,
    librarianCount: 0
  });

  // Dean-only student stats (imported/viewed from Community Access logic)
  const [allUsersForStats, setAllUsersForStats] = useState<any[]>([]);
  const [studentStatsCollapsed, setStudentStatsCollapsed] = useState(true);

  // Real-time listener for users to compute student stats for dean view
  useEffect(() => {
    const usersRef = collection(db, 'users');
    const unsubscribe = onSnapshot(usersRef, snap => {
      const list: any[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      setAllUsersForStats(list);
    }, err => {
      console.error('[AccountCreator] users realtime for stats failed:', err);
    });
    return () => unsubscribe();
  }, []);

  const archivedStudentStats = React.useMemo(() => {
    const archivedStudents = allUsersForStats.filter(u => (u.role || '').toLowerCase() === 'student' && u.restricted && !u.revoked);
    const totals = { archived: archivedStudents.length };
    const byRemark: Record<string, number> = {};
    for (const s of archivedStudents) {
      const remark = ((s as any).archiveRemark || 'Unspecified').toString();
      byRemark[remark] = (byRemark[remark] || 0) + 1;
    }
    return { totals, byRemark };
  }, [allUsersForStats]);

  const enrolledStudentStats = React.useMemo(() => {
    const enrolledStudents = allUsersForStats.filter(u => (u.role || '').toLowerCase() === 'student' && !u.restricted && !u.revoked);
    const totals = { enrolled: enrolledStudents.length };
    const byDepartment: Record<string, number> = {};
    for (const s of enrolledStudents) {
      const dept = ((s as any).department || 'Unspecified').toString();
      byDepartment[dept] = (byDepartment[dept] || 0) + 1;
    }
    return { totals, byDepartment };
  }, [allUsersForStats]);

  


  // For upload history display
  const [filteredHistory, setFilteredHistory] = useState<UploadHistoryItem[]>([]);

  // Accessibility: close unified modal on ESC and autofocus first field
  useEffect(() => {
    if (!unifiedModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setUnifiedModalOpen(false);
    };
    window.addEventListener('keydown', onKey);
    // autofocus
    setTimeout(() => unifiedNameRef.current?.focus(), 0);
    return () => window.removeEventListener('keydown', onKey);
  }, [unifiedModalOpen]);

  // Action alert (success/error) shown after approve/reject operations
  const [actionAlert, setActionAlert] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  // Success dialog (ConfirmModal style)
  const [successDialog, setSuccessDialog] = useState<{ open: boolean; title: string; description: string }>(
    { open: false, title: '', description: '' }
  );
  
  // Pagination state for upload history
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(5); // Show 5 items per page
  const [paginatedHistory, setPaginatedHistory] = useState<UploadHistoryItem[]>([]);

  // Show welcome animation on first load
  const [showWelcome, setShowWelcome] = useState(true);
  
  // Ref for file input to create a custom button
  const fileInputRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
    const timer = setTimeout(() => {
      setShowWelcome(false);
    }, 1500);
    
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    // Update filtered history when upload history changes
    setFilteredHistory(uploadHistory);
  }, [uploadHistory]);

  // Update paginated history when filtered history or pagination changes
  useEffect(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    setPaginatedHistory(filteredHistory.slice(startIndex, endIndex));
  }, [filteredHistory, currentPage, itemsPerPage]);
  const acceptedFileTypes = [
    '.xlsx', 
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setState(prev => ({ 
        ...prev, 
        file,
        errorMessage: null,
        successMessage: null
      }));
        // Here we would normally validate the file format
      // For demo purposes, we'll just check the extension
      const fileExt = file.name.split('.').pop()?.toLowerCase();
      if (!fileExt || !['xlsx'].includes(fileExt)) {
        setState(prev => ({
          ...prev,
          errorMessage: 'Please upload a valid Excel (.xlsx) file only.'
        }));
      } else if (file.size > 10 * 1024 * 1024) { // 10MB limit
        setState(prev => ({
          ...prev,
          errorMessage: 'File size exceeds 10MB limit.'
        }));
      }
    }
  };
  
  // Trigger file input click when custom button is clicked
  const triggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!state.file) {
      setState(prev => ({
        ...prev,
        errorMessage: 'Please select a file to upload.'
      }));
      return;
    }

    setState(prev => ({
      ...prev,
      isUploading: true,
      errorMessage: null,
      successMessage: null,
      parsedUsers: [],
      parsedEmails: [],
      invalidData: [],
      processedUsers: 0
    }));

    try {
      if (isAlumniMode) {
        const { emails, invalidRows, duplicateCount } = await parseAlumniInviteFile(state.file);
        setState(prev => ({
          ...prev,
          parsedEmails: emails,
          invalidData: invalidRows,
          usersToProcess: emails.length
        }));

        const totalRows = emails.length + invalidRows.length + duplicateCount;

        if (invalidRows.length > 0 || emails.length === 0) {
          const validationFailedItem: UploadHistoryItem = {
            id: `up-${Date.now()}`,
            timestamp: new Date(),
            filename: state.file.name,
            usersCreated: 0,
            usersSkipped: 0,
            usersErrored: invalidRows.length || totalRows || 0,
            totalUsers: totalRows || invalidRows.length || 0,
            status: 'failed'
          };
          setUploadHistory(prev => [validationFailedItem, ...prev]);
          setCurrentPage(1);
          try {
            await saveUploadHistory(validationFailedItem, currentUser?.id, currentUser?.name);
          } catch (error) {
            console.error('Error saving alumni validation failure to Firestore:', error);
          }

          setState(prev => ({
            ...prev,
            isUploading: false,
            errorMessage: invalidRows.length > 0
              ? `Upload failed. Please fix the following issues: ${invalidRows.join(', ')}`
              : 'Upload failed. Please provide at least one valid email address.',
            usersToProcess: null,
            processedUsers: 0
          }));
          return;
        }

        const invitePayloads = emails.map(email => ({
          email,
          invitedBy: currentUser?.id,
          invitedByName: currentUser?.name,
          sourceFile: state.file?.name
        }));

        const inviteResult: any = await sendAlumniInvitesWithFallback(invitePayloads);
        const sentCount = inviteResult?.sent || 0;
        const failedCount = inviteResult?.failed || (inviteResult?.failures?.length ?? 0);
        const backendSkipped = inviteResult?.skipped || 0;
        const totalSkipped = backendSkipped + duplicateCount;

        setState(prev => ({ ...prev, processedUsers: emails.length }));

        const inviteHistoryItem: UploadHistoryItem = {
          id: `up-${Date.now()}`,
          timestamp: new Date(),
          filename: state.file.name,
          usersCreated: sentCount,
          usersSkipped: totalSkipped,
          usersErrored: failedCount,
          totalUsers: emails.length,
          status: failedCount === 0 ? 'completed' : sentCount > 0 ? 'partial' : 'failed'
        };
        setUploadHistory(prev => [inviteHistoryItem, ...prev]);
        setCurrentPage(1);
        try {
          await saveUploadHistory(inviteHistoryItem, currentUser?.id, currentUser?.name);
        } catch (error) {
          console.error('Error saving alumni invite history to Firestore:', error);
        }

        if (sentCount === 0 && failedCount > 0) {
          setState(prev => ({
            ...prev,
            isUploading: false,
            errorMessage: inviteResult?.message || 'Failed to send alumni invites. Please try again.',
            usersToProcess: null,
            processedUsers: 0
          }));
          return;
        }

        let successMessage = `Sent ${sentCount} alumni invite${sentCount === 1 ? '' : 's'}.`;
        if (totalSkipped > 0) {
          successMessage += ` ${totalSkipped} duplicate email${totalSkipped === 1 ? '' : 's'} were skipped.`;
        }
        if (failedCount > 0) {
          successMessage += ` ${failedCount} invite${failedCount === 1 ? '' : 's'} failed to send.`;
        }

        setState(prev => ({
          ...prev,
          isUploading: false,
          successMessage,
          file: null,
          usersToProcess: null,
          processedUsers: 0,
          parsedEmails: [],
          parsedUsers: []
        }));

        if (currentUser && ((currentUser.role || '').toLowerCase() === 'super admin' || isAdminRegistrar)) {
          try {
            const logger = ActivityLogger.getInstance();
            await logger.logActivity(
              'alumni_invites_sent',
              `Uploaded ${emails.length} alumni invite${emails.length === 1 ? '' : 's'} (${sentCount} sent)`,
              {
                filename: state.file.name,
                invitesQueued: emails.length,
                invitesSent: sentCount,
                invitesFailed: failedCount,
                duplicatesSkipped: totalSkipped
              },
              'medium'
            );
          } catch (logErr) {
            console.error('Error logging alumni invite activity:', logErr);
          }
        }

        return;
      }

      // Student batch upload flow
      const { validUsers, invalidRows } = await parseStudentUpload(state.file);
      setState(prev => ({
        ...prev,
        parsedUsers: validUsers,
        invalidData: invalidRows,
        usersToProcess: validUsers.length
      }));
      if (invalidRows.length > 0) {
        const validationFailedItem: UploadHistoryItem = {
          id: `up-${Date.now()}`,
          timestamp: new Date(),
          filename: state.file.name,
          usersCreated: 0,
          usersSkipped: 0,
          usersErrored: invalidRows.length,
          totalUsers: validUsers.length + invalidRows.length,
          status: 'failed'
        };
        setUploadHistory(prev => [validationFailedItem, ...prev]);
        setCurrentPage(1);
        try {
          await saveUploadHistory({
            filename: state.file.name,
            usersCreated: 0,
            usersSkipped: 0,
            usersErrored: invalidRows.length,
            totalUsers: validUsers.length + invalidRows.length,
            status: 'failed'
          }, currentUser?.id, currentUser?.name);
        } catch (error) {
          console.error('Error saving validation failed upload to Firestore:', error);
        }
        setState(prev => ({
          ...prev,
          isUploading: false,
          errorMessage: `Upload failed. Please fix the following issues: ${invalidRows.join(', ')}`,
          usersToProcess: null,
          processedUsers: 0
        }));
        return;
      }

      const { successCount, skippedCount, errorCount, skippedUsers, createdUsers } = await createUserAccounts(validUsers, creationMode);
        // Add to upload history
      const newUploadItem: UploadHistoryItem = {
        id: `up-${Date.now()}`,
        timestamp: new Date(),
        filename: state.file.name,
        usersCreated: successCount,
        usersSkipped: skippedCount,
        usersErrored: errorCount,
        totalUsers: validUsers.length,
        status: errorCount > 0 ? 'partial' : 'completed'
      };
        setUploadHistory(prev => [newUploadItem, ...prev]);
      
      // Reset pagination to first page for new upload
      setCurrentPage(1);
      
      // Save successful upload to Firestore
      try {
        await saveUploadHistory(newUploadItem, currentUser?.id, currentUser?.name);
      } catch (error) {
        console.error('Error saving successful upload to Firestore:', error);
      }
      
      // Create a detailed success message (student batch flow only)
      const noun = 'user account';
      const recordNoun = 'users';
      const actionVerb = 'created';
      const pluralize = (value: number) => (value === 1 ? '' : 's');
      let successMessage = `Successfully ${actionVerb} ${successCount} ${noun}${pluralize(successCount)}.`;
      if (skippedCount > 0) {
        successMessage += ` ${skippedCount} ${recordNoun} already existed and were skipped.`;
      }
      if (errorCount > 0) {
        successMessage += ` ${errorCount} ${recordNoun} failed due to errors.`;
      }
        // Update success state
      setState(prev => ({
        ...prev,
        isUploading: false,
        successMessage,
        file: null,
        usersToProcess: null,
        processedUsers: 0,
        parsedEmails: []
      }));

        // After successful creation, send credentials to @ms.bulsu.edu.ph for newly created users
        try {
          if (createdUsers && createdUsers.length > 0) {
            const data: any = await sendCredentialsBatchWithFallback(createdUsers);
            console.log('[AccountCreator] Credentials email dispatch result:', data);
            if (data?.success) {
              const sent = data?.sent || 0;
              const failed = data?.failed || 0;
              const extra = failed > 0 ? ` (${failed} email${failed === 1 ? '' : 's'} failed)` : '';
              setState(prev => ({
                ...prev,
                successMessage: `${successMessage} Emails sent to ${sent} newly created user${sent === 1 ? '' : 's'}.${extra}`
              }));
            }
          }
        } catch (emailErr) {
          console.error('[AccountCreator] Error sending credential emails:', emailErr);
          setState(prev => ({
            ...prev,
            successMessage: `${successMessage} (Note: notification emails could not be sent automatically)`
          }));
        }

      // Show notification if users were skipped
      if (skippedCount > 0 && skippedUsers.length > 0) {
        setSkippedNotification({
          isVisible: true,
          skippedUsers: skippedUsers,
          totalCount: skippedCount
        });
      }

      // Update account stats after successful upload
      try {
        const counts = await getUserCounts();
        setStats(prev => ({
          ...counts,
          recentUploads: prev.recentUploads + 1,
          successRate: prev.successRate
        }));
      } catch (error) {
        console.error('Error updating user counts:', error);
      }
        } catch (error) {
      console.error('Error processing file:', error);
      
      // Add failed upload to history if we have file information
      if (state.file) {
        const failedUploadItem: UploadHistoryItem = {
          id: `up-${Date.now()}`,
          timestamp: new Date(),
          filename: state.file.name,
          usersCreated: 0,
          usersSkipped: 0,
          usersErrored: state.usersToProcess || 0,
          totalUsers: state.usersToProcess || 0,
          status: 'failed'
        };
        
        setUploadHistory(prev => [failedUploadItem, ...prev]);
        
        // Reset pagination to first page for new upload
        setCurrentPage(1);
        
        // Save failed upload to Firestore
        try {
          await saveUploadHistory(failedUploadItem, currentUser?.id, currentUser?.name);
        } catch (error) {
          console.error('Error saving failed upload to Firestore:', error);
        }
      }
      
      setState(prev => ({
        ...prev,
        isUploading: false,
        errorMessage: 'An error occurred while processing the file. Please try again.',
        usersToProcess: null,
        processedUsers: 0,
        parsedEmails: []
      }));
    }
  };

  const clearFile = () => {
    setState(prev => ({
      ...prev,
      file: null,
      errorMessage: null,
      successMessage: null,
      parsedUsers: [],
      parsedEmails: [],
      usersToProcess: null,
      processedUsers: 0
    }));
  };
  
  // Handle opening and closing the admin creation modal
  const openAdminModal = () => {
    setAdminState(prev => ({ ...prev, isOpen: true, error: null, success: null }));
    // Pre-compute display name if office already set
    if (adminState.office) {
      computeAndSetNextAdminName(adminState.office).catch(err => console.error(err));
    }
  };

  // Dean modal handlers
  const openDeanModal = () => {
    setDeanState(prev => ({ ...prev, isOpen: true, error: null, success: null }));
  };
  const closeDeanModal = () => {
    setDeanState({
      isOpen: false,
      name: '',
      email: '',
      password: '',
      deanNumber: '',
      isLoading: false,
      error: null,
      success: null
    });
  };

  // QR Code modal state and handlers (visible only to super admin)
  // QR UI removed: QR modal state/handlers and QR generation have been removed

  const closeAdminModal = () => {
    setAdminState(prev => ({
      ...prev,
      isOpen: false,
      isLoading: false,
      email: '',
      name: '',
      office: '',
      password: '',
      adminNumber: '',
      error: null,
      success: null
    }));
  };

  // Close skipped users notification
  const closeSkippedNotification = () => {
    setSkippedNotification({
      isVisible: false,
      skippedUsers: [],
      totalCount: 0
    });
  };
  
  // Format date for upload history
  const formatDate = (date: Date): string => {
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 24) {
      return diffInHours === 0 
        ? 'Just now' 
        : `${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'} ago`;
    } else if (diffInHours < 48) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: now.getFullYear() !== date.getFullYear() ? 'numeric' : undefined
      });
    }
  };
  // Handle admin form input changes for both input and select elements
  const handleAdminInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setAdminState(prev => ({
      ...prev,
      [name]: value,
      error: null
    }));

    // If office changed, compute the next sequential admin display name
    if (name === 'office') {
      // fire-and-forget: compute and set the display name for preview
      computeAndSetNextAdminName(value).catch(err => console.error('Error computing admin display name:', err));
    }
  };
    // Generate admin number (with leading zeros)
  const generateAdminNumber = async () => {
    // In a real app, this would fetch the last admin number from database
    // For this demo, we'll use a random number between 1-999
    const num = Math.floor(Math.random() * 999) + 1;
    return num.toString().padStart(3, '0');
  };
  // Generate a 6-character mixed-case alphabetic code for additional password entropy
  const generateAdminCode = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let out = '';
    for (let i = 0; i < 6; i++) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  };
  
  // Generate an N-character alphabetic code (A-Z, a-z) for student batch passwords
  const generateAlphaCode = (length: number = 5) => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let out = '';
    for (let i = 0; i < length; i++) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  };

  // Compute next sequential admin display name for a given office using existing admin accounts
  const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const titleCase = (s: string) => s.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());

  const computeNextAdminName = async (office: string): Promise<string> => {
    if (!office) return '';
    const isSuper = office.toLowerCase() === 'super admin' || office.toLowerCase() === 'super-admin' || office.toLowerCase() === 'superadmin';
    const displayBase = isSuper ? 'Super Admin' : `Admin ${titleCase(office)}`;
    try {
      const roleQuery = isSuper ? where('role', '==', 'super admin') : where('role', '==', 'admin');
      const officeQuery = isSuper ? null : where('office', '==', office);
      const q = officeQuery ? query(collection(db, 'users'), roleQuery, officeQuery) : query(collection(db, 'users'), roleQuery);
      const snap = await getDocs(q);
      let maxNum = 0;
      const rx = new RegExp(`^${escapeRegex(displayBase)}(?:\\s+(\\d+))?$`, 'i');
      snap.forEach(docSnap => {
        const n = (docSnap.data().name || '').toString();
        const m = n.match(rx);
        if (m) {
          const parsed = m[1] ? parseInt(m[1], 10) : 0;
          if (!isNaN(parsed) && parsed > maxNum) maxNum = parsed;
        }
      });
      const next = maxNum + 1;
      return `${displayBase} ${next}`;
    } catch (err) {
      console.error('computeNextAdminName error', err);
      return `${displayBase} 1`;
    }
  };

  const computeAndSetNextAdminName = async (office: string) => {
    const name = await computeNextAdminName(office);
    setAdminState(prev => ({ ...prev, name }));
  };
  // Handle admin creation submission
  // handleAdminSubmit accepts an optional overrides object so callers (like the unified modal)
  // can pass office/name/mfaEmail directly and avoid a race with setState.
  const handleAdminSubmit = async (e: React.FormEvent, overrides?: { office?: string; name?: string; mfaEmail?: string }) => {
    e.preventDefault();

    // Prefer overrides if provided (unified modal passes these), otherwise use adminState
    const officeVal = overrides?.office ?? adminState.office;

    // Validate form fields - removed idNumber requirement
    if (!officeVal) {
      setAdminState(prev => ({
        ...prev,
        error: 'Office is required.'
      }));
      return;
    }

    setAdminState(prev => ({
      ...prev,
      isLoading: true,
      error: null
    }));
      try {
      // Begin a protected auth operation
      AuthInstanceManager.beginProtectedOperation();
      
      // Generate admin number (XXX in the format)
      const adminNumber = await generateAdminNumber();

  // Determine if creating a super admin (use officeVal)
  const isSuper = officeVal && (officeVal.toLowerCase() === 'super admin' || officeVal.toLowerCase() === 'super-admin' || officeVal.toLowerCase() === 'superadmin');

  // Compute display name first for super admin email generation. Prefer override name, then adminState.name, then computed sequence
  const providedName = overrides?.name ?? adminState.name;
  const computedName = providedName && providedName.trim() !== '' ? providedName.trim() : await computeNextAdminName(officeVal);

      // Generate email and password according to role
      let email = '';
      if (isSuper) {
        // For super admins use superadmin{N}@bulsuspace.com where N is the sequential number
        const match = computedName.match(/(\d+)$/);
        const seq = match ? match[1] : adminNumber;
        email = `superadmin${seq}@bulsuspace.com`;
      } else {
        email = `admin-bs-${adminNumber}@bulsuspace.com`;
      }

  // Generate password (prefix depends on role)
  const adminCode = generateAdminCode();
  const password = isSuper ? `@superadmin${adminNumber}${adminCode}` : `@adminBS${adminNumber}${adminCode}`;

      // Actually create the user in Firebase Auth using secondary instance
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);

  // Determine role to save
  const saveRole = isSuper ? 'super admin' : 'admin';

      // Add admin profile to Firestore
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        email,
        name: computedName,
        idNumber: `A-${adminNumber}`,
        role: saveRole,
        office: officeVal,
        mfaEmail: overrides?.mfaEmail || '',
        profile_pic: `https://ui-avatars.com/api/?name=${encodeURIComponent(computedName)}&background=0D8ABC&color=fff`,
        isNewUser: false, // Admins don't need to see terms modal
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
  // Create corresponding device document for the new admin (non-blocking inside helper)
  await createDeviceDocument(userCredential.user.uid);
      
      // Send credentials to MFA email (non-blocking) with fallback
      try {
        await sendCredentialsBatchWithFallback([
          {
            email,
            password,
            name: computedName,
            idNumber: `A-${adminNumber}`,
            mfaEmail: overrides?.mfaEmail || undefined,
          },
        ]);
      } catch (emailErr) {
        console.error('[AccountCreator] Admin credentials email dispatch failed:', emailErr);
      }

      // Safely sign out from secondary auth to clean up
      await AuthInstanceManager.safelySignOutSecondary(secondaryAuth);
      
      console.log('🔒 Admin account created using secondary auth. Super admin session preserved.');
      // Activity logging for super admin creating an admin account
      if (currentUser?.role === 'super admin') {
        const logger = ActivityLogger.getInstance();
        await logger.logActivity(
          'admin_account_created',
          `Super admin created admin account: ${computedName} (${email})`,
            {
              adminName: computedName,
            adminEmail: email,
            adminOffice: adminState.office,
            adminNumber: adminNumber,
          },
          'medium',
          email,
          'user'
        );
      }
        // Update state with generated credentials
      setAdminState(prev => ({
        ...prev,
        isLoading: false,
        email: email,
        password: password,
        adminNumber: adminNumber,
        success: `Admin account for ${computedName} was successfully created.`,
        name: computedName,
        office: officeVal,
      }));      
      // Open success dialog
      setSuccessDialog({
        open: true,
        title: 'Account Created',
        description: `${saveRole === 'super admin' ? 'Super admin' : 'Admin'} account created for ${computedName} (${email}).`
      });
      // End the protected auth operation
      AuthInstanceManager.endProtectedOperation();
      
      // Update account stats after successful admin creation
      try {
        const counts = await getUserCounts();
        setStats(prev => ({
          ...prev,
          ...counts,
          recentUploads: prev.recentUploads,
          successRate: prev.successRate
        }));
      } catch (error) {
        console.error('Error updating user counts:', error);
      }
        } catch (error: any) {
      // Make sure we end the protected operation even if there's an error
      AuthInstanceManager.endProtectedOperation();
      
      console.error('Error creating admin account:', error);
      setAdminState(prev => ({
        ...prev,
        isLoading: false,
        error: error.message || 'An error occurred while creating the admin account. Please try again.'
      }));
    }
  };
  // Determine next dean sequence using existing dean accounts.
  // Prefer deterministic identifiers (email/idNumber) over display name,
  // because dean names can be custom and may not follow "Dean <n>".
  const computeNextDeanNameAndSeq = async (): Promise<{ name: string; seq: number; }> => {
    try {
      const q = query(collection(db, 'users'), where('role', '==', 'dean'));
      const snap = await getDocs(q);
      let maxSeq = 0;
      snap.forEach(docSnap => {
        const data = docSnap.data() || {};
        const candidates = [
          (data.email || '').toString(),      // dean12@bulsuspace.com
          (data.idNumber || '').toString(),   // D-012
          (data.deanNumber || '').toString(), // 012
          (data.name || '').toString(),       // fallback: Dean 12
        ];

        const extractors: Array<RegExp> = [
          /^dean(\d+)@/i,
          /^D-(\d+)$/i,
          /^(\d+)$/,
          /Dean\s+(\d+)$/i,
        ];

        candidates.forEach((value) => {
          if (!value) return;
          for (const rx of extractors) {
            const m = value.match(rx);
            if (!m) continue;
            const num = parseInt(m[1], 10);
            if (!isNaN(num) && num > maxSeq) {
              maxSeq = num;
            }
            break;
          }
        });
      });
      return { name: `Dean ${maxSeq + 1}`, seq: maxSeq + 1 };
    } catch (err) {
      console.error('computeNextDeanName error', err);
      return { name: 'Dean 1', seq: 1 };
    }
  };

  const generateDeanCode = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let out = '';
    for (let i = 0; i < 4; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  };

  // Accept an optional overrideName so callers (like the unified modal) can pass the name
  // directly and avoid a race with setState. Also accept optional mfaEmail.
  const handleDeanSubmit = async (e?: React.FormEvent, overrideName?: string, overrideMfaEmail?: string) => {
    if (e && typeof (e as any).preventDefault === 'function') (e as any).preventDefault();
  const providedName = ((overrideName ?? deanState.name) || '').trim();
    if (!providedName) {
      setDeanState(prev => ({ ...prev, error: 'Name is required.' }));
      return;
    }
    setDeanState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      AuthInstanceManager.beginProtectedOperation();
      // Always preserve the user-provided name; only use sequential counter for email/id
  let { seq } = await computeNextDeanNameAndSeq();
  const displayName = providedName; // keep custom name (could be 'Dean of Campus', etc.)
          // We'll attempt to create with up to a few retries if the deterministic email is already taken
          let userCredential: any = null;
          let attempt = 0;
          const maxAttempts = 30;
          // Ensure these are declared in outer scope so they can be used after the loop
          let email: string = '';
          let password: string = '';
          let deanNumber: string = '';
          while (attempt < maxAttempts) {
            attempt++;
            // Email pattern dean{seq}@bulsuspace.com
            deanNumber = seq.toString().padStart(3, '0');
            email = `dean${seq}@bulsuspace.com`;
            // Password pattern @dean{seq}{code}
            password = `@dean${deanNumber}${generateDeanCode()}`;
        try {
          // log for debugging when collisions happen
          // eslint-disable-next-line no-console
          console.log(`Attempt ${attempt}: creating dean account with email=`, email);
          userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
          // success
          // attach email/password/deanNumber to deanState after success below
          break;
        } catch (err: any) {
          // If email already exists, try to recompute a new seq and retry
          if (err?.code === 'auth/email-already-in-use') {
            // eslint-disable-next-line no-console
            console.warn('Email already in use for dean creation, retrying with next sequence', { attempt, seq, error: err });
            // recompute next seq from Firestore to reduce collision chance
            const res = await computeNextDeanNameAndSeq();
            // if compute returns same seq, bump by 1 to avoid infinite loop
            seq = (res.seq && res.seq > seq) ? res.seq : seq + 1;
            // try again
            continue;
          }
          // other errors should be thrown upwards
          throw err;
        }
      }
      if (!userCredential) {
        throw new Error('Failed to create dean account after multiple attempts (email collisions)');
      }
      // write user document (use values from created credential and computed deanNumber)
      const createdDeanNumber = (userCredential && userCredential.user && userCredential.user.email)
        ? userCredential.user.email.match(/^dean(\d+)/)?.[1]?.padStart(3, '0')
        : seq.toString().padStart(3, '0');
      const createdIdNumber = `D-${createdDeanNumber}`;
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        email: userCredential.user.email,
        name: displayName,
        idNumber: createdIdNumber,
        role: 'dean',
        mfaEmail: overrideMfaEmail || '',
        profile_pic: `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=8B5CF6&color=fff`,
        isNewUser: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      await createDeviceDocument(userCredential.user.uid);
      // Send credentials email to MFA address if provided (with fallback)
      try {
        await sendCredentialsBatchWithFallback([
          {
            email,
            password,
            name: displayName,
            idNumber: createdIdNumber,
            mfaEmail: (overrideMfaEmail || '').trim() || undefined,
          },
        ]);
      } catch (emailErr) {
        console.error('[AccountCreator] Dean credentials email dispatch failed:', emailErr);
      }
      await AuthInstanceManager.safelySignOutSecondary(secondaryAuth);
      if (currentUser?.role === 'super admin') {
        const logger = ActivityLogger.getInstance();
        await logger.logActivity(
          'dean_account_created',
          `Super admin created dean account: ${displayName} (${email})`,
          { deanName: displayName, deanEmail: email, deanSeq: seq },
          'medium',
          email,
          'user'
        );
      }
      setDeanState(prev => ({
        ...prev,
        isLoading: false,
        email,
        password,
        deanNumber,
        success: `Dean account for ${displayName} was successfully created.`,
        name: displayName
      }));
      // Open success dialog for dean creation
      setSuccessDialog({
        open: true,
        title: 'Account Created',
        description: `Dean account created for ${displayName} (${email}).`
      });
      AuthInstanceManager.endProtectedOperation();
      try {
        const counts = await getUserCounts();
        // Merge new counts into existing stats to avoid wiping fields during brief state updates
        setStats(prev => ({ ...prev, ...counts, recentUploads: prev.recentUploads, successRate: prev.successRate }));
      } catch (err) { console.error('Error updating counts after dean creation', err); }
    } catch (error: any) {
      AuthInstanceManager.endProtectedOperation();
      console.error('Error creating dean account', error);
      setDeanState(prev => ({ ...prev, isLoading: false, error: error.message || 'Failed to create dean account.' }));
    }
  };

  // Infirmary creation handler
  const handleInfirmarySubmit = async (e?: React.FormEvent, overrideMfaEmail?: string) => {
    if (e) e.preventDefault();
    setInfirmaryState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      AuthInstanceManager.beginProtectedOperation();
      // Username format: infirmary1@bulsuspace.com
      // We'll use '1' as default sequential index; for safety, compute next existing count
      const q = query(collection(db, 'users'), where('role', '==', 'infirmary'));
      const snap = await getDocs(q);
      // Try creating with a sequence-based email, retrying if the email is already taken
      let seq = snap.size + 1;
      let userCredential: any = null;
      let attempt = 0;
      const maxAttempts = 10;
      let email = '';
      let password = '';
      while (attempt < maxAttempts) {
        attempt++;
        email = `infirmary${seq}@bulsuspace.com`;
        password = `@BSInfirmary${seq}`;
        try {
          userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
          break;
        } catch (err: any) {
          if (err?.code === 'auth/email-already-in-use') {
            // collision: increment sequence and retry
            seq = seq + 1;
            continue;
          }
          throw err;
        }
      }
      if (!userCredential) {
        throw new Error('Failed to create infirmary account after multiple email collisions');
      }
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        email,
        name: infirmaryState.name || `Infirmary ${seq}`,
        idNumber: `INF-${seq.toString().padStart(3, '0')}`,
        role: 'infirmary',
        mfaEmail: overrideMfaEmail || '',
        profile_pic: `https://ui-avatars.com/api/?name=${encodeURIComponent(infirmaryState.name || 'Infirmary')}&background=0D8ABC&color=fff`,
        isNewUser: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      await createDeviceDocument(userCredential.user.uid);
      // Send credentials email to MFA address if provided (with fallback)
      try {
        await sendCredentialsBatchWithFallback([
          {
            email,
            password,
            name: infirmaryState.name || `Infirmary ${seq}`,
            idNumber: `INF-${seq.toString().padStart(3, '0')}`,
            mfaEmail: (overrideMfaEmail || '').trim() || undefined,
          },
        ]);
      } catch (emailErr) {
        console.error('[AccountCreator] Infirmary credentials email dispatch failed:', emailErr);
      }
      await AuthInstanceManager.safelySignOutSecondary(secondaryAuth);
      if (currentUser?.role === 'super admin') {
        const logger = ActivityLogger.getInstance();
        await logger.logActivity(
          'admin_account_created',
          `Super admin created infirmary account: ${infirmaryState.name || email}`,
          { email },
          'medium',
          email,
          'user'
        );
      }
      setInfirmaryState(prev => ({ ...prev, isLoading: false, email, password, success: `Infirmary account ${email} created.`, name: infirmaryState.name || `Infirmary ${seq}` }));
      AuthInstanceManager.endProtectedOperation();
  try { const counts = await getUserCounts(); setStats(prev => ({ ...prev, ...counts, recentUploads: prev.recentUploads, successRate: prev.successRate })); } catch(e){console.error(e)}
    } catch (err: any) {
      AuthInstanceManager.endProtectedOperation();
      console.error('Error creating infirmary account', err);
      setInfirmaryState(prev => ({ ...prev, isLoading: false, error: err?.message || 'Failed to create infirmary account.' }));
    }
  };

  // Librarian creation handler
  const handleLibrarianSubmit = async (e?: React.FormEvent, overrideMfaEmail?: string) => {
    if (e) e.preventDefault();
    setLibrarianState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      AuthInstanceManager.beginProtectedOperation();
      const q = query(collection(db, 'users'), where('role', '==', 'librarian'));
      const snap = await getDocs(q);
      // Try creating with a sequence-based email, retrying if the email is already taken
      let seq = snap.size + 1;
      let userCredential: any = null;
      let attempt = 0;
      const maxAttempts = 10;
      let email = '';
      let password = '';
      while (attempt < maxAttempts) {
        attempt++;
        email = `librarian${seq}@bulsuspace.com`;
        password = `@BSLibrarian${seq}`;
        try {
          userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
          break;
        } catch (err: any) {
          if (err?.code === 'auth/email-already-in-use') {
            // collision: increment sequence and retry
            seq = seq + 1;
            continue;
          }
          throw err;
        }
      }
      if (!userCredential) {
        throw new Error('Failed to create librarian account after multiple email collisions');
      }
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        email,
        name: librarianState.name || `Librarian ${seq}`,
        idNumber: `LIB-${seq.toString().padStart(3, '0')}`,
        role: 'librarian',
        mfaEmail: overrideMfaEmail || '',
        profile_pic: `https://ui-avatars.com/api/?name=${encodeURIComponent(librarianState.name || 'Librarian')}&background=0D8ABC&color=fff`,
        isNewUser: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      await createDeviceDocument(userCredential.user.uid);
      // Send credentials email to MFA address if provided (with fallback)
      try {
        await sendCredentialsBatchWithFallback([
          {
            email,
            password,
            name: librarianState.name || `Librarian ${seq}`,
            idNumber: `LIB-${seq.toString().padStart(3, '0')}`,
            mfaEmail: (overrideMfaEmail || '').trim() || undefined,
          },
        ]);
      } catch (emailErr) {
        console.error('[AccountCreator] Librarian credentials email dispatch failed:', emailErr);
      }
      await AuthInstanceManager.safelySignOutSecondary(secondaryAuth);
      if (currentUser?.role === 'super admin') {
        const logger = ActivityLogger.getInstance();
        await logger.logActivity(
          'admin_account_created',
          `Super admin created librarian account: ${librarianState.name || email}`,
          { email },
          'medium',
          email,
          'user'
        );
      }
      setLibrarianState(prev => ({ ...prev, isLoading: false, email, password, success: `Librarian account ${email} created.`, name: librarianState.name || `Librarian ${seq}` }));
      AuthInstanceManager.endProtectedOperation();
  try { const counts = await getUserCounts(); setStats(prev => ({ ...prev, ...counts, recentUploads: prev.recentUploads, successRate: prev.successRate })); } catch(e){console.error(e)}
    } catch (err: any) {
      AuthInstanceManager.endProtectedOperation();
      console.error('Error creating librarian account', err);
      setLibrarianState(prev => ({ ...prev, isLoading: false, error: err?.message || 'Failed to create librarian account.' }));
    }
  };

  // Handler to create faculty account from unified modal (manual create)
  const handleUnifiedFacultyCreate = async () => {
    // Basic validation
    if (!unifiedFacultyFirstName.trim() || !unifiedFacultyLastName.trim() || !unifiedFacultyId.trim()) {
      setActionAlert({ message: 'First name, last name and ID are required for faculty creation.', type: 'error' });
      setTimeout(() => setActionAlert(null), 3000);
      return;
    }

    setUnifiedLoading(true);
    try {
      // Ensure current user's profile document exists so rules can resolve their role (esp. for deans)
      try {
        if (currentUser?.id) {
          const meRef = doc(db, 'users', currentUser.id);
          const meSnap = await getDoc(meRef);
          if (!meSnap.exists()) {
            await setDoc(meRef, {
              email: currentUser.email || undefined,
              name: currentUser.name || undefined,
              role: (currentUser.role || '').toString().toLowerCase(),
              updatedAt: serverTimestamp(),
              createdAt: serverTimestamp(),
            }, { merge: true });
          }
        }
      } catch (e) {
        console.warn('[AccountCreator] Could not ensure current user profile exists:', e);
      }

      AuthInstanceManager.beginProtectedOperation();
      const secondary = AuthInstanceManager.getSecondaryAuth() || secondaryAuth;
      const idLower = unifiedFacultyId.trim().toLowerCase();
      const lastPrefix = unifiedFacultyLastName.trim().substring(0, 3).toLowerCase();
      const password = `@BS${idLower}${lastPrefix}`;

      // Build email username as {firstname}.{lastname} (lowercased, sanitized) with numeric fallback on collision
      const sanitize = (s: string) => (s || '')
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toLowerCase();
      const first = sanitize(unifiedFacultyFirstName.trim());
      const last = sanitize(unifiedFacultyLastName.trim());
      const baseLocal = [first, last].filter(Boolean).join('.') || idLower;
      let email = '';
      let userCredential: any = null;
      {
        let attempt = 0;
        const maxAttempts = 25;
        while (attempt < maxAttempts) {
          const candidate = `${baseLocal}${attempt === 0 ? '' : attempt}@bulsuspace.com`;
          try {
            userCredential = await createUserWithEmailAndPassword(secondary, candidate, password);
            email = candidate;
            break;
          } catch (err: any) {
            if (err?.code === 'auth/email-already-in-use') {
              attempt++;
              continue;
            }
            throw err;
          }
        }
        if (!userCredential) {
          throw new Error('Failed to create faculty account: all email variants are in use');
        }
      }

      const newUserRef = doc(db, 'users', userCredential.user.uid);
      await setDoc(newUserRef, {
  email,
        name: `${properCaseName(unifiedFacultyFirstName.trim())} ${properCaseName(unifiedFacultyLastName.trim())}`,
        idNumber: unifiedFacultyId.trim(),
        department: unifiedFacultyDepartment.trim() || '',
        role: 'faculty',
        mfaEmail: unifiedMfaEmail.trim() || '',
        profile_pic: `https://ui-avatars.com/api/?name=${encodeURIComponent(unifiedFacultyFirstName.trim() + ' ' + unifiedFacultyLastName.trim())}&background=E07A5F&color=fff`,
        isNewUser: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      // Ensure the newly-created user doc is visible before device write (rules read it to allow dean provisioning)
      try {
        const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
        for (let i = 0; i < 5; i++) {
          const snap = await getDoc(newUserRef);
          if (snap.exists()) break;
          await delay(200);
        }
      } catch (_) { /* swallow */ }

      await createDeviceDocument(userCredential.user.uid);
      await AuthInstanceManager.safelySignOutSecondary(secondary);

      // Send credentials to MFA email (with fallback)
      try {
        await sendCredentialsBatchWithFallback([
          {
            email,
            password,
            name: `${properCaseName(unifiedFacultyFirstName.trim())} ${properCaseName(unifiedFacultyLastName.trim())}`,
            idNumber: unifiedFacultyId.trim(),
            mfaEmail: unifiedMfaEmail.trim() || undefined,
          },
        ]);
      } catch (emailErr) {
        console.error('[AccountCreator] Faculty credentials email dispatch failed:', emailErr);
      }

      // Success feedback
      setActionAlert({ message: `Faculty account created: ${unifiedFacultyFirstName} ${unifiedFacultyLastName}`, type: 'success' });
      setTimeout(() => setActionAlert(null), 3000);
      // Open success dialog for faculty creation
      setSuccessDialog({
        open: true,
        title: 'Account Created',
        description: `Faculty account created for ${properCaseName(unifiedFacultyFirstName.trim())} ${properCaseName(unifiedFacultyLastName.trim())} (${email}).`
      });

      // Refresh counts
      try { const counts = await getUserCounts(); setStats(prev => ({ ...prev, ...counts })); } catch (e) { console.error(e); }

      // Clear fields
      setUnifiedFacultyFirstName('');
      setUnifiedFacultyLastName('');
      setUnifiedFacultyId('');
      setUnifiedFacultyDepartment('');
    } catch (err: any) {
      console.error('Error creating faculty account (unified):', err);
      // If email already exists in Auth, show a confirm-style dialog with friendly message
      if (err?.code === 'auth/email-already-in-use') {
        const userEmail = `${unifiedFacultyId.trim().toLowerCase()}@bulsuspace.com`;
        setEmailInUseMessage(`The email ${userEmail} is already in use. Please try a different ID or contact your administrator.`);
        setShowEmailInUseModal(true);
      } else {
        setActionAlert({ message: err?.message || 'Failed to create faculty account', type: 'error' });
        setTimeout(() => setActionAlert(null), 4000);
      }
    } finally {
      AuthInstanceManager.endProtectedOperation();
      setUnifiedLoading(false);
    }
  };
    // Handle drag and drop functionality
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      const file = files[0];
      
      // Validate file type
      const fileExt = file.name.split('.').pop()?.toLowerCase();
      if (!fileExt || !['xlsx'].includes(fileExt)) {
        setState(prev => ({
          ...prev,
          errorMessage: 'Please upload a valid Excel (.xlsx) file only.'
        }));
        return;
      }
      
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        setState(prev => ({
          ...prev,
          errorMessage: 'File size exceeds 10MB limit.'
        }));
        return;
      }
      
      // Set the file if validation passes
      setState(prev => ({ 
        ...prev, 
        file,
        errorMessage: null,
        successMessage: null
      }));
    }
  };

  // State for drag over visual feedback
  const [isDragOver, setIsDragOver] = useState(false);
  // Creator mode toggles between student batch creation and alumni invites.
  const [creationMode, setCreationMode] = useState<CreationMode>('student');
  const isAlumniMode = creationMode === 'alumni';

  // Determine if current user is an admin in the Registrar office
  const isAdminRegistrar = currentUser?.role === 'admin' && ('office' in (currentUser || {})) && ((currentUser as any).office?.toLowerCase() === 'registrar');

  const sampleTemplatePath = encodeURI(isAlumniMode ? ALUMNI_TEMPLATE_PATH : STUDENT_TEMPLATE_PATH);
  const sampleTemplateLabel = isAlumniMode ? 'Alumni Template' : 'Student Template';
  const modeTitle = isAlumniMode ? 'Alumni Invite Upload' : 'Batch Account Creation';
  const modeBadge = isAlumniMode ? 'Invite Mode' : 'Excel Only';
  const modeDescription = isAlumniMode
    ? 'Upload an alumni invite sheet that contains a single "Email" column. Each address receives an invite message with a link to complete the alumni creation flow.'
    : 'Upload a file containing multiple user accounts to create them all at once.';
  const dropLabel = isAlumniMode ? 'alumni invite sheet' : 'Excel file';
  const selectButtonLabel = isAlumniMode ? 'Select Invite Sheet' : 'Select File';
  const fileTypeLabel = isAlumniMode ? 'Alumni template (.xlsx)' : 'Excel (.xlsx)';
  const successTitle = isAlumniMode ? 'Invites Ready!' : 'Upload Successful!';
  const successBody = isAlumniMode
    ? 'All alumni invites have been queued and notifications sent.'
    : 'All accounts have been created and notifications sent.';
  const creationModeOptions: Array<{ key: CreationMode; label: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>> }> = [
    { key: 'student', label: 'Batch Creator', icon: AcademicCapIcon },
    { key: 'alumni', label: 'Alumni Invite', icon: EnvelopeOpenIcon }
  ];
  const activeOptionIndex = Math.max(0, creationModeOptions.findIndex(option => option.key === creationMode));
  const highlightWidthExpression = `(100% - 0.5rem) / ${creationModeOptions.length}`;
  const toggleHighlightStyle = {
    width: `calc(${highlightWidthExpression})`,
    left: `calc(0.25rem + ${activeOptionIndex} * (${highlightWidthExpression}))`
  } as React.CSSProperties;

  return (
    <MainLayout>
      <div
        className={`container mx-auto px-4 py-8 transition-all duration-700 ${showWelcome ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'}`}
      >
        {/* QR UI removed */}
  {/* Account Type Distribution */}
  {!isAdminRegistrar && (
  <>
  <div className="mb-6 sm:mb-10">
          {/* Account Type Distribution header is now above with the Add Admin button */}          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-6 gap-2 sm:gap-3">
            {/* Student Accounts */}            <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/20 rounded-xl border border-blue-800/30 p-1.5 sm:p-3 transform hover:translate-y-[-2px] transition-all hover:shadow hover:shadow-blue-900/10">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="bg-blue-900/40 p-1 sm:p-2 rounded-lg border border-blue-700/30">
                  <AcademicCapIcon className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-lg text-white">{stats.studentCount.toLocaleString()}</h3>
                  <p className="text-blue-300 text-xs font-medium">Student</p>
                </div>
              </div>              <div className="mt-1.5 sm:mt-2 bg-blue-900/20 rounded-lg p-1 sm:p-1.5 flex flex-col items-start justify-between text-[10px] sm:text-xs">
                <span className="text-blue-300">{stats.totalAccounts > 0 ? Math.round((stats.studentCount / stats.totalAccounts) * 100) : 0}% of total</span>
                <span className="mt-0.5 sm:mt-1 px-1 sm:px-1.5 py-0.5 bg-blue-800/40 rounded-lg text-blue-300 border border-blue-700/30 whitespace-nowrap">
                  {stats.recentStudents ? `+${stats.recentStudents} this week` : stats.studentCount > 0 ? 'Active' : 'No accounts'}
                </span>
              </div>
            </div>{/* Faculty Accounts */}            <div className="bg-gradient-to-br from-amber-900/30 to-amber-800/20 rounded-xl border border-amber-800/30 p-1.5 sm:p-3 transform hover:translate-y-[-2px] transition-all hover:shadow hover:shadow-amber-900/10">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="bg-amber-900/40 p-1 sm:p-2 rounded-lg border border-amber-700/30">
                  <UserIcon className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-lg text-white">{stats.facultyCount.toLocaleString()}</h3>
                  <p className="text-amber-300 text-xs font-medium">Faculty</p>
                </div>
              </div>              <div className="mt-1.5 sm:mt-2 bg-amber-900/20 rounded-lg p-1 sm:p-1.5 flex flex-col items-start justify-between text-[10px] sm:text-xs">
                <span className="text-amber-300">{stats.totalAccounts > 0 ? Math.round((stats.facultyCount / stats.totalAccounts) * 100) : 0}% of total</span>
                <span className="mt-0.5 sm:mt-1 px-1 sm:px-1.5 py-0.5 bg-amber-800/40 rounded-lg text-amber-300 border border-amber-700/30 whitespace-nowrap">
                  {stats.recentFaculty ? `+${stats.recentFaculty} this week` : stats.facultyCount > 0 ? 'Active' : 'No accounts'}
                </span>
              </div>
            </div>{/* Alumni Accounts */}            <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/20 rounded-xl border border-purple-800/30 p-1.5 sm:p-3 transform hover:translate-y-[-2px] transition-all hover:shadow hover:shadow-purple-900/10">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="bg-purple-900/40 p-1 sm:p-2 rounded-lg border border-purple-700/30">
                  <BuildingLibraryIcon className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-lg text-white">{stats.alumniCount.toLocaleString()}</h3>
                  <p className="text-purple-300 text-xs font-medium">Alumni</p>
                </div>
              </div>              <div className="mt-1.5 sm:mt-2 bg-purple-900/20 rounded-lg p-1 sm:p-1.5 flex flex-col items-start justify-between text-[10px] sm:text-xs">
                <span className="text-purple-300">{stats.totalAccounts > 0 ? Math.round((stats.alumniCount / stats.totalAccounts) * 100) : 0}% of total</span>
                <span className="mt-0.5 sm:mt-1 px-1 sm:px-1.5 py-0.5 bg-purple-800/40 rounded-lg text-purple-300 border border-purple-700/30 whitespace-nowrap">
                  {stats.recentAlumni ? `+${stats.recentAlumni} this week` : stats.alumniCount > 0 ? 'Active' : 'No accounts'}
                </span>
              </div>            </div>{/* Admin Accounts */}            <div className="bg-gradient-to-br from-green-900/30 to-green-800/20 rounded-xl border border-green-800/30 p-1.5 sm:p-3 transform hover:translate-y-[-2px] transition-all hover:shadow hover:shadow-green-900/10">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="bg-green-900/40 p-1 sm:p-2 rounded-lg border border-green-700/30">
                  <BriefcaseIcon className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-green-400" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-lg text-white">{stats.adminCount?.toLocaleString() || 0}</h3>
                  <p className="text-green-300 text-xs font-medium">Admin</p>
                </div>
              </div>              <div className="mt-1.5 sm:mt-2 bg-green-900/20 rounded-lg p-1 sm:p-1.5 flex flex-col items-start justify-between text-[10px] sm:text-xs">
                <span className="text-green-300">{stats.totalAccounts > 0 ? Math.round(((stats.adminCount || 0) / stats.totalAccounts) * 100) : 0}% of total</span>
                <span className="mt-0.5 sm:mt-1 px-1 sm:px-1.5 py-0.5 bg-green-800/40 rounded-lg text-green-300 border border-green-700/30 whitespace-nowrap">
                  {stats.adminCount && stats.adminCount > 0 ? 'Active' : 'No accounts'}
                </span>
              </div>
            </div>
            {/* Infirmary Accounts */}
            <div className="bg-gradient-to-br from-teal-900/30 to-teal-800/20 rounded-xl border border-teal-800/30 p-1.5 sm:p-3 transform hover:translate-y-[-2px] transition-all hover:shadow hover:shadow-teal-900/10">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="bg-teal-900/40 p-1 sm:p-2 rounded-lg border border-teal-700/30">
                  <ShieldCheckIcon className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-teal-400" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-lg text-white">{(stats.infirmaryCount || 0).toLocaleString()}</h3>
                  <p className="text-teal-300 text-xs font-medium">Infirmary</p>
                </div>
              </div>
              <div className="mt-1.5 sm:mt-2 bg-teal-900/20 rounded-lg p-1 sm:p-1.5 flex flex-col items-start justify-between text-[10px] sm:text-xs">
                <span className="text-teal-300">{stats.totalAccounts > 0 ? Math.round(((stats.infirmaryCount || 0) / stats.totalAccounts) * 100) : 0}% of total</span>
                <span className="mt-0.5 sm:mt-1 px-1 sm:px-1.5 py-0.5 bg-teal-800/40 rounded-lg text-teal-300 border border-teal-700/30 whitespace-nowrap">
                  {(stats.infirmaryCount || 0) > 0 ? 'Active' : 'No accounts'}
                </span>
              </div>
            </div>
            {/* Librarian Accounts */}
            <div className="bg-gradient-to-br from-sky-900/30 to-sky-800/20 rounded-xl border border-sky-800/30 p-1.5 sm:p-3 transform hover:translate-y-[-2px] transition-all hover:shadow hover:shadow-sky-900/10">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="bg-sky-900/40 p-1 sm:p-2 rounded-lg border border-sky-700/30">
                  <BuildingLibraryIcon className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-sky-400" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-lg text-white">{(stats.librarianCount || 0).toLocaleString()}</h3>
                  <p className="text-sky-300 text-xs font-medium">Librarian</p>
                </div>
              </div>
              <div className="mt-1.5 sm:mt-2 bg-sky-900/20 rounded-lg p-1 sm:p-1.5 flex flex-col items-start justify-between text-[10px] sm:text-xs">
                <span className="text-sky-300">{stats.totalAccounts > 0 ? Math.round(((stats.librarianCount || 0) / stats.totalAccounts) * 100) : 0}% of total</span>
                <span className="mt-0.5 sm:mt-1 px-1 sm:px-1.5 py-0.5 bg-sky-800/40 rounded-lg text-sky-300 border border-sky-700/30 whitespace-nowrap">
                  {(stats.librarianCount || 0) > 0 ? 'Active' : 'No accounts'}
                </span>
              </div>
            </div>
          </div>
    </div>        {/* Account Type Distribution header with Add Admin button */}
        
  <div className="flex justify-between items-center mb-4 px-1 gap-2 sm:gap-0">
          <div className="flex items-center gap-2 sm:gap-3">
            <h2 className="text-base sm:text-lg font-bold text-white items-center hidden md:flex">
              <UserGroupIcon className="h-4 w-4 sm:h-5 sm:w-5 mr-1 sm:mr-2 text-green-500" />
              Account Distribution
            </h2>
            
    {/* Mode Toggle (compact minimalist) */}
            {/* Creation mode toggle */}
            <div className="relative flex items-center gap-1 bg-gray-950/70 border border-gray-700/40 rounded-full p-1 text-xs overflow-hidden text-white">
              <span
                className={`absolute top-1 bottom-1 rounded-full transition-all duration-300 ease-in-out ${
                  isAlumniMode
                    ? 'bg-gradient-to-r from-purple-600/90 to-purple-500/80 shadow-purple-900/40'
                    : 'bg-gradient-to-r from-green-600/90 to-teal-500/80 shadow-green-900/40'
                } shadow-md`}
                style={toggleHighlightStyle}
              />
              {creationModeOptions.map(option => {
                const isActive = creationMode === option.key;
                const Icon = option.icon;
                const labelTone = isActive ? 'opacity-100' : 'opacity-70 hover:opacity-100';
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setCreationMode(option.key)}
                    aria-pressed={isActive}
                    className={`relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors duration-200 text-white bg-transparent ${
                      isActive
                        ? 'drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]'
                        : 'opacity-75 hover:opacity-100'
                    }`}
                  >
                    <Icon className={`h-4 w-4 text-white ${labelTone}`} />
                    <span className={`font-medium tracking-wide text-white ${labelTone}`}>{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          
          {/* Add Admin Account Button (Only for Super Admins) */}
          {(currentUser && (['super admin'].includes((currentUser.role || '').toLowerCase()))) || (currentUser && ((currentUser.role || '').toLowerCase() === 'dean')) ? (
            <div className="flex gap-2 items-center">
              {/* Unified Add button: label depends on user role (dean => Add Faculty) */}
              <button
                onClick={() => {
                  // If dean opens the modal, preselect faculty and open modal
                  if (currentUser && ((currentUser.role || '').toLowerCase() === 'dean')) {
                    setUnifiedRole('faculty');
                  }
                  setUnifiedModalOpen(true);
                }}
                aria-label={currentUser && ((currentUser.role || '').toLowerCase() === 'dean') ? 'Add faculty' : 'Add role'}
                title={currentUser && ((currentUser.role || '').toLowerCase() === 'dean') ? 'Add faculty' : 'Add role'}
                className="flex items-center justify-center gap-0 px-3 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-lg shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5 text-sm"
              >
                <UserPlusIcon className="h-5 w-5 mr-2" />
                <span className="hidden sm:inline">{currentUser && ((currentUser.role || '').toLowerCase() === 'dean') ? 'Add Faculty' : 'Add Role'}</span>
              </button>
            </div>
          ) : null}
  </div>
  {/* Dean-only Student Statistics (imported from Community Access) */}
  {currentUser && ((currentUser.role || '').toLowerCase() === 'dean') && (
    <div className="mb-4">
      <div className="bg-gradient-to-b from-gray-900/85 to-gray-800/85 border border-green-700/20 rounded-xl p-3 shadow">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-green-100">Student Statistics</h2>
            <div className="text-[11px] text-green-400">Updated {new Date().toLocaleDateString()}</div>
          </div>
          <button
            onClick={() => setStudentStatsCollapsed(s => !s)}
            className="px-2 py-1 rounded-md bg-gray-800/50 border border-green-700/10 text-green-200 text-sm hover:bg-gray-800/70 transition"
            aria-expanded={!studentStatsCollapsed}
          >
            {studentStatsCollapsed ? 'Show' : 'Hide'}
          </button>
        </div>

        {!studentStatsCollapsed && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-full flex flex-col justify-between bg-gray-900/60 p-4 rounded-lg border border-green-700/10">
              <div>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-orange-200">Archived</div>
                  <div className="text-3xl font-extrabold text-orange-300">{archivedStudentStats.totals.archived}</div>
                </div>
                <div className="mt-3 text-xs text-green-300">By remark</div>
                <div className="mt-3 flex flex-wrap gap-2 max-h-36 overflow-auto pr-1">
                  {Object.keys(archivedStudentStats.byRemark).length === 0 ? (
                    <div className="text-green-400 text-sm">—</div>
                  ) : (
                    Object.entries(archivedStudentStats.byRemark).map(([remark, count]) => (
                      <div key={remark} className="flex items-center gap-2 px-2 py-0.5 rounded-full bg-gray-800/60 border border-green-700/10 text-green-100 text-sm truncate">
                        <span className="truncate max-w-[10rem]">{remark}</span>
                        <span className="ml-1 text-green-300 font-semibold">{count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="h-full flex flex-col justify-between bg-gray-900/60 p-4 rounded-lg border border-green-700/10">
              <div>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-green-100">Enrolled</div>
                  <div className="text-3xl font-extrabold text-green-200">{enrolledStudentStats.totals.enrolled}</div>
                </div>
                <div className="mt-3 text-xs text-green-300">By department</div>
                <div className="mt-3 flex flex-wrap gap-2 max-h-36 overflow-auto pr-1">
                  {Object.keys(enrolledStudentStats.byDepartment).length === 0 ? (
                    <div className="text-green-400 text-sm">—</div>
                  ) : (
                    Object.entries(enrolledStudentStats.byDepartment).map(([dept, count]) => (
                      <div key={dept} className="flex items-center gap-2 px-2 py-0.5 rounded-full bg-gray-800/60 border border-green-700/10 text-green-100 text-sm truncate">
                        <span className="truncate max-w-[10rem]">{dept}</span>
                        <span className="ml-1 text-green-300 font-semibold">{count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )}
  </>
  )}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mb-4 sm:mb-6">
          <div className="lg:col-span-2">
            {currentUser && ((currentUser.role || '').toLowerCase() !== 'dean') && (
              <div className="bg-gradient-to-br from-gray-900/80 to-gray-800/80 rounded-xl sm:rounded-2xl border border-green-800/40 shadow-lg overflow-hidden h-full">
                <div className="p-4 sm:p-6 md:p-8">
                  <div className="mb-3 sm:mb-4">
                  <div className="flex justify-between items-center">
                    <h2 className="text-lg sm:text-xl font-bold text-white flex flex-wrap items-center">
                      <CloudArrowUpIcon className={`h-5 w-5 sm:h-6 sm:w-6 mr-2 ${isAlumniMode ? 'text-purple-400' : 'text-green-500'}`} />
                      <span>{modeTitle}</span>
                      <span className={`ml-2 sm:ml-3 px-2 py-0.5 text-xs rounded-full uppercase tracking-wide font-medium ${
                        isAlumniMode ? 'bg-purple-900/60 text-purple-200' : 'bg-green-900/60 text-green-300'
                      }`}>
                        {modeBadge}
                      </span>
                    </h2>
                    
                    <a 
                      href={sampleTemplatePath}
                      download
                      className={`flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 py-1 sm:py-2 rounded-lg shadow-md hover:shadow-lg transition-all transform hover:translate-y-[-1px] text-xs sm:text-sm font-medium ${
                        isAlumniMode
                          ? 'bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white hover:shadow-purple-900/30'
                          : 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white hover:shadow-green-900/30'
                      }`}
                    >
                      <DocumentArrowUpIcon className="h-3 w-3 sm:h-4 sm:w-4 text-white" />
                      <span className="whitespace-nowrap text-white">{sampleTemplateLabel}</span>
                    </a>
                  </div>
                  <p className="text-xs sm:text-sm text-gray-400 mt-1">
                    {modeDescription}
                  </p>

                  {isAlumniMode && (
                    <div className="mt-4 text-xs sm:text-sm bg-purple-900/20 border border-purple-800/40 rounded-xl p-4 text-purple-100 space-y-2">
                      <div className="flex items-center gap-2 font-semibold text-purple-200">
                        <SparklesIcon className="h-4 w-4 text-purple-300" />
                        <span>How Alumni Invite mode works</span>
                      </div>
                      <p>Upload an Excel sheet with a single column labeled Email. Each address receives a BulSU Space invite that links directly to the alumni creation page.</p>
                      <p className="text-purple-200/80">Tip: Double-check that every email belongs to the intended alumnus before uploading to avoid bounced invites.</p>
                    </div>
                  )}
                </div>
                
                <form onSubmit={handleUpload} className="space-y-6">
                  {!state.file && !state.successMessage ? (
                    <div className="group relative">
                      <div className="absolute inset-0 bg-gradient-to-r from-green-500/5 to-green-400/5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>                      <label 
                        htmlFor="fileUpload" 
                        className={`w-full h-72 flex flex-col items-center justify-center px-4 py-10 border-2 border-dashed rounded-xl cursor-pointer transition-all group-hover:shadow-lg group-hover:shadow-green-900/20 ${
                          isDragOver 
                            ? 'border-green-500 bg-green-900/20 shadow-lg shadow-green-500/20' 
                            : 'border-green-700/40 bg-gray-800/50 hover:bg-gray-800/70 group-hover:border-green-600/60'
                        }`}
                        onDragOver={handleDragOver}
                        onDragEnter={handleDragEnter}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                      >
                        <input
                          ref={fileInputRef}
                          id="fileUpload"
                          name="fileUpload"
                          type="file"
                          accept={acceptedFileTypes.join(',')}
                          className="sr-only"
                          onChange={handleFileChange}
                        />
                        
                        <div className="space-y-5 text-center">
                          <div className="bg-gray-800/40 p-4 rounded-full border border-green-800/30 mx-auto group-hover:scale-105 transform transition-all">
                            <DocumentArrowUpIcon className="h-10 w-10 text-green-500 mx-auto group-hover:text-green-400 transition-colors" />
                          </div>
                            <div className="space-y-2">
                              <h3 className="text-2xl font-bold text-green-300">
                                {isDragOver ? `Drop your ${dropLabel} here` : `Drop your ${dropLabel}`}
                              </h3>
                              <p className="text-sm text-gray-400 mt-1">
                                {isDragOver ? 'Release to upload' : 'or click to browse your device'}
                              </p>
                            </div>
                            <div className="flex flex-wrap justify-center gap-2 text-xs">
                            <span className="px-2 py-1 bg-gray-800/60 rounded-md text-gray-300">{fileTypeLabel}</span>
                            <span className="px-2 py-1 bg-gray-800/60 rounded-md text-gray-300">Max: 10MB</span>
                          </div>
                          
                          <button
                            type="button"
                            onClick={triggerFileInput}
                            className="mx-auto px-4 py-2 bg-gray-800/50 hover:bg-gray-700 text-gray-300 rounded-lg border border-green-900/30 flex items-center gap-2 transition-all group-hover:bg-green-600/20"
                          >
                            <DocumentMagnifyingGlassIcon className="h-4 w-4" />
                            <span>{selectButtonLabel}</span>
                          </button>
                        </div>
                      </label>
                    </div>
                  ) : state.successMessage ? (
                    <div className="flex flex-col items-center justify-center py-12 px-4">
                      <div className="flex items-center justify-center w-20 h-20 rounded-full bg-green-900/20 mb-6">
                        <CheckCircleIcon className="h-14 w-14 text-green-500 animate-pulse" />
                      </div>
                      
                      <div className="text-center max-w-md mx-auto">
                        <h3 className="text-2xl font-bold text-green-300 mb-2">{successTitle}</h3>
                        <p className="text-gray-400 mb-5">{state.successMessage}</p>
                        
                        <div className="bg-gray-800/50 border border-green-800/20 rounded-lg p-4 mb-6">
                          <div className="flex items-center gap-2 text-sm text-gray-300">
                            <DocumentTextIcon className="h-5 w-5 text-green-500" />
                            <span>{successBody}</span>
                          </div>
                        </div>
                        
                        <button
                          type="button"                          onClick={() => setState({
                            file: null,
                            isUploading: false,
                            errorMessage: null,
                            successMessage: null,
                            usersToProcess: null,
                            processedUsers: 0,
                            parsedUsers: [],
                            parsedEmails: [],
                            invalidData: []
                          })}
                          className="px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white rounded-lg transition-colors shadow hover:shadow-md hover:shadow-green-800/20"
                        >
                          {isAlumniMode ? 'Upload Another Invite Sheet' : 'Upload Another File'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-gray-800/50 rounded-lg p-6 border border-green-800/30 shadow-sm">
                      <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-4">
                          <div className="bg-gray-700/50 p-3 rounded-lg border border-green-900/20">
                            <DocumentArrowUpIcon className="h-8 w-8 text-green-500" />
                          </div>
                          <div className="truncate">
                            <h3 className="text-green-200 font-medium truncate">{state.file?.name}</h3>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-xs text-gray-400">
                                {(state.file?.size && (state.file.size / 1024 / 1024).toFixed(2)) || 0} MB
                              </span>
                              <span className="w-1 h-1 bg-gray-500 rounded-full"></span>
                              <span className="text-xs text-gray-400">
                                {state.file?.type || "Unknown type"}
                              </span>
                            </div>
                          </div>
                        </div>
                        {!state.isUploading && (
                          <button
                            type="button"
                            onClick={clearFile}
                            className="text-gray-400 hover:text-gray-300 hover:bg-gray-700/50 p-2 rounded-lg transition-colors"
                          >
                            <XMarkIcon className="h-5 w-5" />
                          </button>
                        )}
                      </div>
                      
                      {state.isUploading && state.usersToProcess ? (
                        <div className="mt-6">
                          <div className="flex justify-between text-sm mb-2">
                            <span className="text-gray-400">Processing {isAlumniMode ? 'alumni invites' : 'accounts'}...</span>
                            <span className="text-green-300 font-medium">
                              {state.processedUsers} / {state.usersToProcess}
                            </span>
                          </div>
                          <div className="w-full bg-gray-700 rounded-full h-2.5 overflow-hidden">
                            <div 
                              className="bg-gradient-to-r from-green-500 to-green-400 h-2.5 rounded-full transition-all duration-300 ease-in-out"
                              style={{ width: `${(state.processedUsers / state.usersToProcess) * 100}%` }}
                            ></div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                  
                  {/* Error message */}
                  {state.errorMessage && (
                    <div className="bg-red-900/20 border border-red-800 text-red-400 px-5 py-4 rounded-lg text-sm flex items-start">
                      <ExclamationTriangleIcon className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5" />
                      <span>{state.errorMessage}</span>
                    </div>
                  )}
                    {/* Submit button */}
                  {state.file && !state.isUploading && !state.successMessage && (
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        className="px-6 py-3 rounded-lg text-white font-medium bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 transition-colors flex items-center gap-2 shadow-md hover:shadow-green-900/30"
                      >
                        <ArrowUpTrayIcon className="h-5 w-5" />
                        Process File
                      </button>
                    </div>
                  )}
                </form>
              </div>
            </div>
          )}
          </div>
          
          {/* Right Side Panel (hide for dean role) */}
          {currentUser && ((currentUser.role || '').toLowerCase() !== 'dean') && (
            <div className="lg:col-span-1">
            {/* Recent Uploads Panel */}
            <div className="bg-gradient-to-br from-gray-900/80 to-gray-800/80 rounded-2xl border border-green-800/40 shadow-lg overflow-hidden h-full">
              <div className="p-6">
                <div className="flex items-center mb-5">
                  <h2 className="text-lg font-bold text-white flex items-center">
                    <ClockIcon className="h-5 w-5 mr-2 text-green-500" />
                    Recent Uploads
                  </h2>
                </div>
                <div className="flex flex-col h-96">
                  <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-gray-900 mobile-scrollbar-hide space-y-3">
                    {paginatedHistory.length > 0 ? (
                      paginatedHistory.map(item => (
                        <div key={item.id} className="bg-gray-800/50 rounded-lg p-3.5 border border-gray-700/40 hover:border-green-800/40 transition-all hover:bg-gray-800">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <div className="rounded-md bg-gray-700/40 p-2 flex-shrink-0">
                                <TableCellsIcon className="h-6 w-6 text-green-400" />
                              </div>
                              <div>
                                <h3 className="text-sm font-medium text-gray-200 truncate max-w-[140px]">{item.filename}</h3>
                                <div className="flex items-center text-xs text-gray-400 mt-1">
                                  <CalendarIcon className="h-3.5 w-3.5 mr-1" />
                                  {formatDate(item.timestamp)}
                                </div>
                                {/* Uploader name */}
                                <div className="text-xs text-gray-400 mt-1">
                                  Uploaded by: {item.uploadedBy || (item.userId && currentUser?.id === item.userId ? currentUser?.name : 'Unknown')}
                                </div>
                                <div className="text-xs text-gray-400 mt-1.5 space-y-0.5">
                                  <div className="flex items-center gap-1">
                                    <CheckCircleIcon className="h-3 w-3 text-green-400" />
                                    <span>{item.usersCreated} created</span>
                                  </div>
                                  {item.usersSkipped > 0 && (
                                    <div className="flex items-center gap-1">
                                      <InformationCircleIcon className="h-3 w-3 text-blue-400" />
                                      <span>{item.usersSkipped} skipped</span>
                                    </div>
                                  )}
                                  {item.usersErrored > 0 && (
                                    <div className="flex items-center gap-1">
                                      <ExclamationTriangleIcon className="h-3 w-3 text-red-400" />
                                      <span>{item.usersErrored} errors</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-col items-end">
                              <span className={`text-xs px-2 py-0.5 rounded-full border ${
                                item.status === 'completed'
                                  ? 'bg-green-900/30 text-green-400 border-green-900/50'
                                  : item.status === 'partial'
                                  ? 'bg-yellow-900/30 text-yellow-400 border-yellow-900/50'
                                  : 'bg-red-900/30 text-red-400 border-red-900/50'
                              }`}>
                                {item.status}
                              </span>
                              <span className="text-xs text-gray-400 mt-1">{item.totalUsers} total</span>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-6 text-gray-400">
                        <p className="text-sm">No uploads found</p>
                      </div>
                    )}
                  </div>
                  {filteredHistory.length > itemsPerPage && (
                    <div className="mt-4 pt-4 border-t border-gray-700/40">
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-gray-400">
                          Showing {Math.min((currentPage - 1) * itemsPerPage + 1, filteredHistory.length)}-{Math.min(currentPage * itemsPerPage, filteredHistory.length)} of {filteredHistory.length}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                            disabled={currentPage === 1}
                            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <ChevronLeftIcon className="h-4 w-4" />
                          </button>
                          <span className="text-xs text-gray-400 px-2">
                            {currentPage} / {Math.ceil(filteredHistory.length / itemsPerPage)}
                          </span>
                          <button
                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(filteredHistory.length / itemsPerPage)))}
                            disabled={currentPage >= Math.ceil(filteredHistory.length / itemsPerPage)}
                            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <ChevronRightIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            </div>
          )}
        </div>        {/* Admin Creation Modal */}
        {adminState.isOpen && typeof document !== 'undefined' && ReactDOM.createPortal(
          <div className="fixed inset-0 z-[2147483647] pointer-events-none">
            {/* Backdrop (captures clicks to close) */}
            <div
              className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-fadeIn pointer-events-auto"
              onClick={closeAdminModal}
            />

            {/* Centering container so modal can appear above everything */}
            <div className="fixed inset-0 flex items-center justify-center px-4">
              <div
                className="w-full max-w-md max-h-[80vh] overflow-auto pointer-events-auto inline-block bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl border border-green-800/40 shadow-xl shadow-green-800/20 text-left transform transition-all duration-300 ease-out animate-modalSlideIn"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="relative">
                {/* Modal Header */}
                {adminState.success && (
                  <div className="absolute -top-6 left-1/2 transform -translate-x-1/2">
                    <div className="px-4 py-1 rounded-full bg-green-600 text-white text-sm font-semibold shadow-lg">
                      Admin Created
                    </div>
                  </div>
                )}
                
                {/* Modal Content */}
                <div className="p-6 pt-8 space-y-5 relative">
                  {/* Compact modal without header */}
                    {adminState.success ? (
                    <div className="py-6 text-center">
                      <div className="space-y-3">
                        <div className="max-w-sm mx-auto mt-6">
                          <div className="bg-gray-800/70 border border-green-700/30 rounded-lg p-5 text-left">
                            <h4 className="text-green-200 font-medium mb-3">Account Credentials:</h4>
                            <div className="space-y-3">
                              <div>                                <p className="text-xs text-gray-400 mb-1">Email Address:</p>
                                <div className="flex items-center justify-between bg-gray-900/60 rounded-lg p-3 border border-green-900/30 group hover:border-green-700/50 transition-all">
                                  <code className="text-green-300 font-mono overflow-auto">{adminState.email}</code>
                                  <button 
                                    onClick={() => {
                                      navigator.clipboard.writeText(adminState.email);
                                      // Optional: Show a small tooltip or flash effect to indicate copied
                                    }}
                                    className="text-gray-400 hover:text-green-300 transition-colors group-hover:text-green-400"
                                    title="Copy to clipboard"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                                <div>
                                <p className="text-xs text-gray-400 mb-1">Password:</p>
                                <div className="flex items-center justify-between bg-gray-900/60 rounded-lg p-3 border border-green-900/30 group hover:border-green-700/50 transition-all">
                                  <code className="text-green-300 font-mono overflow-auto">{adminState.password}</code>
                                  <button 
                                    onClick={() => {
                                      navigator.clipboard.writeText(adminState.password);
                                      // Optional: Show a small tooltip or flash effect to indicate copied
                                    }}
                                    className="text-gray-400 hover:text-green-300 transition-colors group-hover:text-green-400"
                                    title="Copy to clipboard"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                            <div className="mt-4 text-sm text-gray-300 bg-gray-800/50 p-3 rounded-lg border border-green-900/20">
                            <p className="flex items-center">
                              <span className="text-green-400 mr-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </span>
                              Please securely share these credentials with the admin user.
                            </p>
                          </div>
                        </div>
                          <button
                          onClick={closeAdminModal}
                          className="mt-6 px-8 py-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white rounded-lg shadow-lg hover:shadow-green-900/30 transition-all inline-block transform hover:scale-105"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleAdminSubmit} className="space-y-5">
                      <div>
                        <label className="block text-sm font-medium text-green-200 mb-1.5">Full Name (Display)</label>
                        <div className="relative">
                          <div className="w-full px-4 py-3 bg-gray-900/60 border border-gray-700 rounded-xl text-gray-200 shadow-sm transition-all">
                            {adminState.name || '—'}
                          </div>
                        </div>
                        <p className="mt-1 text-xs text-gray-400">Display name is generated automatically as a sequential Admin name for the selected office.</p>
                      </div>
                        <div>
                        <label htmlFor="office" className="block text-sm font-medium text-green-200 mb-1.5">Admin Type:</label>                        <div className="relative">
                          <select
                            id="office"
                            name="office"
                            value={adminState.office}
                            onChange={handleAdminInputChange}
                            className="w-full px-4 py-3 bg-gray-800/70 border border-gray-700 focus:border-green-500 rounded-xl focus:ring-2 focus:ring-green-600/30 focus:outline-none text-gray-200 shadow-sm transition-all appearance-none"
                          >
                            <option value="">Select Admin Type</option>
                            <option value="registrar">Registrar</option>
                            <option value="program chair">Program Chair</option>
                            <option value="super admin">Super Admin</option>
                          </select>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500 absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />                          </svg>
                        </div>
                      </div>
                        
                      
                      {/* Error message */}
                      {adminState.error && (
                        <div className="bg-red-900/20 border border-red-800/50 text-red-300 px-4 py-3 rounded-lg text-sm flex items-start">
                          <ExclamationTriangleIcon className="h-5 w-5 mr-2 text-red-500 flex-shrink-0" />
                          <span>{adminState.error}</span>
                        </div>
                      )}
                      
                      <div className="flex justify-end pt-4">                        <button
                          type="button"
                          onClick={closeAdminModal}
                          className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg mr-3 transition-colors hover:shadow-md"
                          disabled={adminState.isLoading}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className={`px-5 py-2.5 rounded-lg text-white font-medium flex items-center gap-2 transition-all shadow-lg ${adminState.isLoading 
                            ? 'bg-gray-600 cursor-not-allowed' 
                            : 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 hover:shadow-green-900/20 transform hover:translate-y-[-1px]'}`}
                          disabled={adminState.isLoading}
                        >
                          {adminState.isLoading ? (
                            <>
                              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              <span>Creating...</span>
                            </>
                          ) : (
                            <>
                              <UserPlusIcon className="h-5 w-5" />
                              <span>Create Admin</span>
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
              </div>
      </div>          </div>, document.body)
    }

        {/* Dean Creation Modal */}
        {deanState.isOpen && typeof document !== 'undefined' && ReactDOM.createPortal(
          <div className="fixed inset-0 z-[2147483647] pointer-events-none">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-fadeIn pointer-events-auto" onClick={closeDeanModal} />
            <div className="fixed inset-0 flex items-center justify-center px-4">
              <div className="w-full max-w-md max-h-[80vh] overflow-auto pointer-events-auto inline-block bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl border border-fuchsia-500/40 shadow-xl shadow-fuchsia-800/30 text-left transform transition-all duration-300 ease-out animate-modalSlideIn" onClick={(e)=>e.stopPropagation()}>
                <div className="relative p-6 pt-8 space-y-5">
                  {deanState.success ? (
                    <div className="py-4">
                      <h3 className="text-xl font-bold text-fuchsia-300 mb-4 text-center">Dean Account Created</h3>
                      <div className="bg-gray-800/70 border border-fuchsia-700/30 rounded-lg p-5">
                        <h4 className="text-fuchsia-200 font-medium mb-3">Account Credentials</h4>
                        <div className="space-y-4">
                          <div>
                            <p className="text-xs text-gray-400 mb-1">Email:</p>
                            <div className="flex items-center justify-between bg-gray-900/60 rounded-lg p-3 border border-fuchsia-900/30">
                              <code className="text-fuchsia-300 font-mono overflow-auto">{deanState.email}</code>

                      {/* QR UI removed */}
                              <button onClick={()=>navigator.clipboard.writeText(deanState.email)} className="text-gray-400 hover:text-fuchsia-300" title="Copy email">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                              </button>
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400 mb-1">Password:</p>
                            <div className="flex items-center justify-between bg-gray-900/60 rounded-lg p-3 border border-fuchsia-900/30">
                              <code className="text-fuchsia-300 font-mono overflow-auto">{deanState.password}</code>
                              <button onClick={()=>navigator.clipboard.writeText(deanState.password)} className="text-gray-400 hover:text-fuchsia-300" title="Copy password">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                              </button>
                            </div>
                          </div>
                        </div>
                        <p className="mt-4 text-xs text-gray-400">Share these credentials securely with the dean. They can change the password after first login.</p>
                      </div>
                      <div className="mt-6 flex justify-center">
                        <button onClick={closeDeanModal} className="px-6 py-2 bg-gradient-to-r from-fuchsia-600 to-purple-700 hover:from-fuchsia-500 hover:to-purple-600 rounded-lg text-white font-medium">Close</button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleDeanSubmit} className="space-y-5">
                      <div>
                        <label className="block text-sm font-medium text-fuchsia-200 mb-1.5">Dean Name</label>
                        <input
                          type="text"
                          value={deanState.name}
                          onChange={e=>setDeanState(prev=>({...prev,name:e.target.value,error:null}))}
                          placeholder="e.g. Dean 1"
                          className="w-full px-4 py-3 bg-gray-800/70 border border-gray-700 focus:border-fuchsia-500 rounded-xl focus:ring-2 focus:ring-fuchsia-600/30 focus:outline-none text-gray-200 shadow-sm transition-all"
                          required
                        />
                        <p className="mt-1 text-xs text-gray-400">If you leave off a number a sequential one will be assigned.</p>
                      </div>
                      {deanState.error && (
                        <div className="bg-red-900/20 border border-red-800/50 text-red-300 px-4 py-3 rounded-lg text-sm flex items-start">
                          <span className="material-symbols-outlined text-red-400 mr-2 text-base">error</span>
                          <span>{deanState.error}</span>
                        </div>
                      )}
                      <div className="flex justify-end pt-2">
                        <button type="button" onClick={closeDeanModal} className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg mr-3 transition-colors" disabled={deanState.isLoading}>Cancel</button>
                        <button type="submit" disabled={deanState.isLoading} className={`px-5 py-2.5 rounded-lg text-white font-medium flex items-center gap-2 transition-all shadow-lg ${deanState.isLoading ? 'bg-gray-600 cursor-not-allowed' : 'bg-gradient-to-r from-fuchsia-600 to-purple-700 hover:from-fuchsia-500 hover:to-purple-600'}`}> 
                          {deanState.isLoading ? (
                            <>
                              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                              <span>Creating...</span>
                            </>
                          ) : (
                            <>
                              <span className="material-symbols-outlined text-base">crown</span>
                              <span>Create Dean</span>
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </div>, document.body)
        }

        {/* Skipped Users Notification Dialog */}
        {skippedNotification.isVisible && typeof document !== 'undefined' && ReactDOM.createPortal(
          <div className="fixed inset-0 z-[2147483647] flex items-center justify-center px-4 animate-fadeIn">
            <div
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={closeSkippedNotification}
            />
            <div
              className="relative w-full max-w-lg bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl border border-yellow-800/40 shadow-xl shadow-yellow-800/20 text-left transform transition-all duration-300 ease-out animate-modalSlideIn"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute top-0 left-0 right-0 h-20 overflow-hidden rounded-t-2xl">
                <div className="absolute inset-0 bg-gradient-to-r from-yellow-800/20 to-yellow-600/10" />
                <div className="absolute top-0 right-0 w-40 h-40 bg-yellow-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
              </div>

              <div className="relative p-8 pt-10 space-y-6">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-gradient-to-br from-yellow-600 to-yellow-700 rounded-xl shadow-lg shadow-yellow-900/20">
                      <InformationCircleIcon className="h-6 w-6 text-white" />
                    </div>
                    <h2 className="text-xl font-bold text-yellow-200 drop-shadow-sm">Users Skipped</h2>
                  </div>
                  <button
                    onClick={closeSkippedNotification}
                    className="text-gray-400 hover:text-white hover:bg-gray-800/80 p-2 rounded-lg transition-all hover:shadow-md hover:shadow-black/20"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                <div className="py-6 text-center">
                  <div className="flex items-center justify-center w-20 h-20 mx-auto rounded-full bg-yellow-900/20 mb-6">
                    <ExclamationTriangleIcon className="h-14 w-14 text-yellow-500" />
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-2xl font-bold text-yellow-300">
                      {skippedNotification.skippedUsers.length > 0 && (
                        skippedNotification.skippedUsers.length === 1
                          ? `${skippedNotification.skippedUsers[0]} was skipped`
                          : skippedNotification.skippedUsers.length === 2
                            ? `${skippedNotification.skippedUsers[0]} and ${skippedNotification.skippedUsers[1]} were skipped`
                            : `${skippedNotification.skippedUsers[0]} and ${skippedNotification.totalCount - 1} others were skipped`
                      )}
                    </h3>

                    <p className="text-gray-400 mb-5">
                      {skippedNotification.totalCount === 1
                        ? "This user already exists in the system."
                        : "These users already exist in the system."}
                    </p>

                    <div className="bg-gray-800/50 border border-yellow-800/20 rounded-lg p-4 mb-6">
                      <div className="flex items-center gap-2 text-sm text-gray-300">
                        <InformationCircleIcon className="h-5 w-5 text-yellow-500" />
                        <span>No action is required. Existing accounts were not modified.</span>
                      </div>
                    </div>

                    <button
                      onClick={closeSkippedNotification}
                      className="mt-6 px-8 py-3 bg-gradient-to-r from-yellow-600 to-yellow-700 hover:from-yellow-500 hover:to-yellow-600 text-white rounded-lg shadow-lg hover:shadow-yellow-900/30 transition-all inline-block transform hover:scale-105"
                    >
                      Understood
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Infirmary Creation Modal */}
        {infirmaryState.isOpen && typeof document !== 'undefined' && ReactDOM.createPortal(
          <div className="fixed inset-0 z-[2147483647] pointer-events-none">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-fadeIn pointer-events-auto" onClick={() => { if(!infirmaryState.isLoading) setInfirmaryState(prev => ({ ...prev, isOpen: false })); }} />
            <div className="fixed inset-0 flex items-center justify-center px-4">
              <div className="w-full max-w-md max-h-[80vh] overflow-auto pointer-events-auto inline-block bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl border border-teal-800/40 shadow-xl shadow-teal-800/20 text-left transform transition-all duration-300 ease-out animate-modalSlideIn" onClick={(e)=>e.stopPropagation()}>
                <div className="relative p-6 pt-8 space-y-5">
                  {infirmaryState.success ? (
                    <div className="py-6 text-center">
                      <h3 className="text-xl font-bold text-teal-300 mb-4">Infirmary Account Created</h3>
                      <div className="bg-gray-800/70 border border-teal-700/30 rounded-lg p-5">
                        <h4 className="text-teal-200 font-medium mb-3">Account Credentials</h4>
                        <div className="space-y-4">
                          <div>
                            <p className="text-xs text-gray-400 mb-1">Email:</p>
                            <div className="flex items-center justify-between bg-gray-900/60 rounded-lg p-3 border border-teal-900/30">
                              <code className="text-teal-300 font-mono overflow-auto">{infirmaryState.email}</code>
                              <button onClick={()=>navigator.clipboard.writeText(infirmaryState.email)} className="text-gray-400 hover:text-teal-300" title="Copy email">Copy</button>
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400 mb-1">Password:</p>
                            <div className="flex items-center justify-between bg-gray-900/60 rounded-lg p-3 border border-teal-900/30">
                              <code className="text-teal-300 font-mono overflow-auto">{infirmaryState.password}</code>
                              <button onClick={()=>navigator.clipboard.writeText(infirmaryState.password)} className="text-gray-400 hover:text-teal-300" title="Copy password">Copy</button>
                            </div>
                          </div>
                        </div>
                        <p className="mt-4 text-xs text-gray-400">Share these credentials securely with the infirmary account holder. They can change the password after first login.</p>
                      </div>
                      <div className="mt-6 flex justify-center">
                        <button onClick={()=>setInfirmaryState({ isOpen:false, name:'Infirmary', email:'', password:'', isLoading:false, error:null, success:null })} className="px-6 py-2 bg-gradient-to-r from-teal-600 to-teal-700 rounded-lg text-white font-medium">Close</button>
                      </div>
                    </div>
                  ) : (
                    <div className="py-6 text-center">
                      <h3 className="text-lg font-medium text-teal-200 mb-2">Create Infirmary Account</h3>
                      <p className="text-sm text-gray-400 mb-4">This will create an account with a default infirmary role and restricted messaging access.</p>
                      {infirmaryState.error && (<div className="bg-red-900/20 border border-red-800/50 text-red-300 px-4 py-3 rounded-lg text-sm">{infirmaryState.error}</div>)}
                      <div className="mt-4 flex justify-end gap-3">
                        <button onClick={()=>setInfirmaryState(prev=>({...prev,isOpen:false}))} className="px-4 py-2 bg-gray-800 rounded-lg text-gray-300">Cancel</button>
                        <button onClick={() => void handleInfirmarySubmit()} disabled={infirmaryState.isLoading} className={`px-4 py-2 rounded-lg text-white ${infirmaryState.isLoading ? 'bg-gray-600' : 'bg-gradient-to-r from-teal-600 to-teal-700'}`}>{infirmaryState.isLoading ? 'Creating...' : 'Create Infirmary'}</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>, document.body)
        }

        {/* Librarian Creation Modal */}
        {librarianState.isOpen && typeof document !== 'undefined' && ReactDOM.createPortal(
          <div className="fixed inset-0 z-[2147483647] pointer-events-none">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-fadeIn pointer-events-auto" onClick={() => { if(!librarianState.isLoading) setLibrarianState(prev => ({ ...prev, isOpen: false })); }} />
            <div className="fixed inset-0 flex items-center justify-center px-4">
              <div className="w-full max-w-md max-h-[80vh] overflow-auto pointer-events-auto inline-block bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl border border-sky-800/40 shadow-xl shadow-sky-800/20 text-left transform transition-all duration-300 ease-out animate-modalSlideIn" onClick={(e)=>e.stopPropagation()}>
                <div className="relative p-6 pt-8 space-y-5">
                  {librarianState.success ? (
                    <div className="py-6 text-center">
                      <h3 className="text-xl font-bold text-sky-300 mb-4">Librarian Account Created</h3>
                      <div className="bg-gray-800/70 border border-sky-700/30 rounded-lg p-5">
                        <h4 className="text-sky-200 font-medium mb-3">Account Credentials</h4>
                        <div className="space-y-4">
                          <div>
                            <p className="text-xs text-gray-400 mb-1">Email:</p>
                            <div className="flex items-center justify-between bg-gray-900/60 rounded-lg p-3 border border-sky-900/30">
                              <code className="text-sky-300 font-mono overflow-auto">{librarianState.email}</code>
                              <button onClick={()=>navigator.clipboard.writeText(librarianState.email)} className="text-gray-400 hover:text-sky-300" title="Copy email">Copy</button>
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400 mb-1">Password:</p>
                            <div className="flex items-center justify-between bg-gray-900/60 rounded-lg p-3 border border-sky-900/30">
                              <code className="text-sky-300 font-mono overflow-auto">{librarianState.password}</code>
                              <button onClick={()=>navigator.clipboard.writeText(librarianState.password)} className="text-gray-400 hover:text-sky-300" title="Copy password">Copy</button>
                            </div>
                          </div>
                        </div>
                        <p className="mt-4 text-xs text-gray-400">Share these credentials securely with the librarian. They can change the password after first login.</p>
                      </div>
                      <div className="mt-6 flex justify-center">
                        <button onClick={()=>setLibrarianState({ isOpen:false, name:'Librarian', email:'', password:'', isLoading:false, error:null, success:null })} className="px-6 py-2 bg-gradient-to-r from-sky-600 to-sky-700 rounded-lg text-white font-medium">Close</button>
                      </div>
                    </div>
                  ) : (
                    <div className="py-6 text-center">
                      <h3 className="text-lg font-medium text-sky-200 mb-2">Create Librarian Account</h3>
                      <p className="text-sm text-gray-400 mb-4">This will create an account with a librarian role and restricted messaging access.</p>
                      {librarianState.error && (<div className="bg-red-900/20 border border-red-800/50 text-red-300 px-4 py-3 rounded-lg text-sm">{librarianState.error}</div>)}
                      <div className="mt-4 flex justify-end gap-3">
                        <button onClick={()=>setLibrarianState(prev=>({...prev,isOpen:false}))} className="px-4 py-2 bg-gray-800 rounded-lg text-gray-300">Cancel</button>
                        <button onClick={() => void handleLibrarianSubmit()} disabled={librarianState.isLoading} className={`px-4 py-2 rounded-lg text-white ${librarianState.isLoading ? 'bg-gray-600' : 'bg-gradient-to-r from-sky-600 to-sky-700'}`}>{librarianState.isLoading ? 'Creating...' : 'Create Librarian'}</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>, document.body)
        }
      </div>
        {/* Unified creation modal - enhanced overlay */}
        {unifiedModalOpen && ReactDOM.createPortal(
          <div className="fixed inset-0 z-[2147483647] flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="unified-modal-title">
            {/* backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { if(!unifiedLoading) setUnifiedModalOpen(false); }} />

            {/* modal panel */}
            <div className="relative w-full max-w-xl mx-auto p-4 z-50">
              <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl border border-gray-800/40 shadow-xl p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 id="unified-modal-title" className="text-lg font-semibold text-white">Create account</h3>
                    <p className="text-sm text-gray-400">Choose a role and provide minimal details. Existing creation logic will be used.</p>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      aria-label="Close"
                      onClick={() => { if(!unifiedLoading) setUnifiedModalOpen(false); }}
                      className="text-gray-400 hover:text-white p-2 rounded-md bg-gray-800/40 hover:bg-gray-800/60"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3">
                  <div>
                    <label className="block text-xs text-gray-300 mb-1">Role</label>
                    <select
                      value={unifiedRole}
                      onChange={(e) => setUnifiedRole(e.target.value as any)}
                      className="w-full bg-gray-800 border border-gray-700 text-white rounded-md px-3 py-2"
                      disabled={!!unifiedLoading || (currentUser ? ((currentUser.role || '').toLowerCase() === 'dean') : false)}
                    >
                      {currentUser && ((currentUser.role || '').toLowerCase() === 'dean') ? (
                        <>
                          <option value="faculty">Faculty</option>
                        </>
                      ) : (
                        <>
                          <option value="admin">Admin</option>
                          <option value="super admin">Super Admin</option>
                          <option value="dean">Dean</option>
                          <option value="infirmary">Infirmary</option>
                          <option value="librarian">Librarian</option>
                          <option value="faculty">Faculty</option>
                        </>
                      )}
                    </select>
                  </div>

                  {/* Hide the generic Display Name input for faculty since we show First/Last name fields */}
                  {unifiedRole !== 'faculty' && (
                    <div>
                      <label className="block text-xs text-gray-300 mb-1">Name</label>
                      <input
                        ref={unifiedNameRef}
                        value={unifiedName}
                        onChange={(e) => setUnifiedName(e.target.value)}
                        placeholder="Display name (optional for admin)"
                        className="w-full bg-gray-800 border border-gray-700 text-white rounded-md px-3 py-2"
                        disabled={unifiedLoading}
                      />
                    </div>
                  )}

                  {/* Admin-specific office dropdown (Super Admin does not require office) */}
                  {unifiedRole === 'admin' && (
                    <div>
                      <label className="block text-xs text-gray-300 mb-1">Office</label>
                      <select
                        value={unifiedOffice}
                        onChange={(e) => {
                          const val = e.target.value;
                          setUnifiedOffice(val);
                          if (val) void computeAndSetNextAdminName(val).catch(err => console.error(err));
                        }}
                        className="w-full bg-gray-800 border border-gray-700 text-white rounded-md px-3 py-2"
                        disabled={unifiedLoading}
                      >
                        <option value="">Select Office</option>
                        <option value="registrar">Registrar</option>
                        <option value="program chair">Program Chair</option>
                      </select>
                    </div>
                  )}

                  {/* For super admin, show a hint that office is not required */}
                  {unifiedRole === 'super admin' && (
                    <div className="text-xs text-gray-400">Super Admin does not require an office; an appropriate account name/email will be generated.</div>
                  )}

                  {/* Faculty manual creation fields */}
                  {unifiedRole === 'faculty' && (
                    <>
                      {/* First and Last name on one responsive row */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-300 mb-1">First name</label>
                          <input
                            value={unifiedFacultyFirstName}
                            onChange={(e) => setUnifiedFacultyFirstName(e.target.value)}
                            placeholder="First name"
                            className="w-full bg-gray-800 border border-gray-700 text-white rounded-md px-3 py-2"
                            disabled={unifiedLoading}
                          />
                        </div>

                        <div>
                          <label className="block text-xs text-gray-300 mb-1">Last name</label>
                          <input
                            value={unifiedFacultyLastName}
                            onChange={(e) => setUnifiedFacultyLastName(e.target.value)}
                            placeholder="Last name"
                            className="w-full bg-gray-800 border border-gray-700 text-white rounded-md px-3 py-2"
                            disabled={unifiedLoading}
                          />
                        </div>
                      </div>

                      {/* ID and Department on one responsive row */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-300 mb-1">ID Number</label>
                          <input
                            value={unifiedFacultyId}
                            onChange={(e) => setUnifiedFacultyId(e.target.value)}
                            placeholder="e.g. 2020-00001"
                            className="w-full bg-gray-800 border border-gray-700 text-white rounded-md px-3 py-2"
                            disabled={unifiedLoading}
                          />
                        </div>

                        <div>
                          <label className="block text-xs text-gray-300 mb-1">Department</label>
                          <select
                            value={unifiedFacultyDepartment}
                            onChange={(e) => setUnifiedFacultyDepartment(e.target.value)}
                            className="w-full bg-gray-800 border border-gray-700 text-white rounded-md px-3 py-2"
                            disabled={unifiedLoading}
                          >
                            <option value="">Select Department</option>
                            <option value="BSIT">BSIT</option>
                            <option value="BSTM">BSTM</option>
                            <option value="BIT">BIT</option>
                            <option value="BSHM">BSHM</option>
                            <option value="BSEd">BSEd</option>
                            <option value="BEEd">BEEd</option>
                            <option value="BSTLEd">BSTLEd</option>
                          </select>
                        </div>
                      </div>
                    </>
                  )}

                  {/* MFA Email field for all roles */}
                  <div>
                    <label className="block text-xs text-gray-300 mb-1">
                      MFA Email <span className="text-red-400">*</span>
                    </label>
                    <input
                      value={unifiedMfaEmail}
                      onChange={(e) => {
                        const v = e.target.value || '';
                        setUnifiedMfaEmail(v);
                        // compute suggestions
                        const domains = ['@bulsu.edu.ph', '@ms.bulsu.edu.ph'];
                        const trimmed = v.trim();
                        let suggestions: string[] = [];
                        if (trimmed.length > 0) {
                          const atIndex = trimmed.indexOf('@');
                          const local = atIndex === -1 ? trimmed : trimmed.slice(0, atIndex);
                          const domainPart = atIndex === -1 ? '' : trimmed.slice(atIndex + 1).toLowerCase();
                          if (local.length > 0) {
                            if (domainPart === '') {
                              suggestions = domains.map(d => `${local}${d}`);
                            } else {
                              suggestions = domains
                                .filter(d => d.slice(1).startsWith(domainPart))
                                .map(d => `${local}${d}`);
                            }
                          }
                        }
                        setUnifiedMfaSuggestions(suggestions);
                        setShowUnifiedMfaSuggestions(suggestions.length > 0);
                      }}
                      onFocus={() => {
                        // show suggestions if available for current value
                        const v = unifiedMfaEmail.trim();
                        const domains = ['@bulsu.edu.ph', '@ms.bulsu.edu.ph'];
                        if (v.length > 0) {
                          const atIndex = v.indexOf('@');
                          const local = atIndex === -1 ? v : v.slice(0, atIndex);
                          if (local.length > 0) setUnifiedMfaSuggestions(domains.map(d => `${local}${d}`));
                        }
                        setShowUnifiedMfaSuggestions(true);
                      }}
                      onBlur={() => {
                        // Delay hiding so click on suggestion can register
                        setTimeout(() => setShowUnifiedMfaSuggestions(false), 150);
                      }}
                      type="email"
                      placeholder="Enter email for multi-factor authentication"
                      className="w-full bg-gray-800 border border-gray-700 text-white rounded-md px-3 py-2"
                      disabled={unifiedLoading}
                      required
                    />
                    <p className="mt-1 text-xs text-gray-500">This email will be used for account security and recovery purposes.</p>
                    {showUnifiedMfaSuggestions && unifiedMfaSuggestions.length > 0 && (
                      <div className="mt-2 bg-gray-900 border border-gray-700 rounded-md p-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {unifiedMfaSuggestions.map(s => (
                          <button
                            key={s}
                            type="button"
                            onMouseDown={(e) => {
                              // prevent blur from hiding before click
                              e.preventDefault();
                              setUnifiedMfaEmail(s);
                              setUnifiedMfaSuggestions([]);
                              setShowUnifiedMfaSuggestions(false);
                            }}
                            className="text-left text-sm px-2 py-1 rounded-md bg-gray-800 hover:bg-gray-800/80 border border-gray-700 text-gray-200"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end items-center gap-3 pt-2">
                    <button
                      onClick={() => { if(!unifiedLoading) setUnifiedModalOpen(false); }}
                      className="px-4 py-2 rounded-md bg-gray-800 text-gray-300 border border-gray-700"
                      disabled={unifiedLoading}
                    >
                      Cancel
                    </button>

                    <button
                      onClick={async () => {
                        if (unifiedLoading) return;
                        
                        // Validate MFA Email is provided
                        if (!unifiedMfaEmail || !unifiedMfaEmail.trim()) {
                          setActionAlert({ message: 'MFA Email is required for account creation.', type: 'error' });
                          setTimeout(() => setActionAlert(null), 3000);
                          return;
                        }
                        
                        // Basic email validation
                        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                        if (!emailRegex.test(unifiedMfaEmail.trim())) {
                          setActionAlert({ message: 'Please enter a valid email address for MFA.', type: 'error' });
                          setTimeout(() => setActionAlert(null), 3000);
                          return;
                        }
                        
                        setUnifiedLoading(true);
                        try {
                          // Delegate to the specific handler and await completion so that stats are updated
                          if (unifiedRole === 'dean') {
                            setDeanState(prev => ({ ...prev, name: unifiedName || prev.name, error: null, success: null, isOpen: true }));
                            await handleDeanSubmit?.({ preventDefault: () => {} } as any, unifiedName || undefined, unifiedMfaEmail || undefined);
                          } else if (unifiedRole === 'infirmary') {
                            setInfirmaryState(prev => ({ ...prev, name: unifiedName || prev.name, error: null, success: null, isOpen: true }));
                            await handleInfirmarySubmit?.(undefined, unifiedMfaEmail || undefined);
                          } else if (unifiedRole === 'librarian') {
                            setLibrarianState(prev => ({ ...prev, name: unifiedName || prev.name, error: null, success: null, isOpen: true }));
                            await handleLibrarianSubmit?.(undefined, unifiedMfaEmail || undefined);
                          } else if (unifiedRole === 'faculty') {
                            // Use manual faculty create flow (mfaEmail already in state)
                            await handleUnifiedFacultyCreate();
                          } else if (unifiedRole === 'admin' || unifiedRole === 'super admin') {
                            const officeVal = unifiedRole === 'super admin' ? 'super admin' : (unifiedOffice || adminState.office || '');
                            setAdminState(prev => ({ ...prev, office: officeVal, name: unifiedName || prev.name, error: null, success: null, isOpen: true }));
                            await handleAdminSubmit?.({ preventDefault: () => {} } as any, { office: officeVal, name: unifiedName || undefined, mfaEmail: unifiedMfaEmail || undefined });
                          }
                        } catch (err) {
                          console.error('Unified create error', err);
                        } finally {
                          // Close and reset immediately after handler finishes
                          setUnifiedModalOpen(false);
                          setUnifiedName('');
                          setUnifiedOffice('');
                          setUnifiedMfaEmail('');
                          setUnifiedRole('admin');
                          setUnifiedFacultyFirstName('');
                          setUnifiedFacultyLastName('');
                          setUnifiedFacultyId('');
                          setUnifiedFacultyDepartment('');
                          setUnifiedLoading(false);
                        }
                      }}
                      className={`px-4 py-2 rounded-md text-white ${unifiedLoading ? 'bg-gray-600 cursor-not-allowed' : 'bg-gradient-to-r from-indigo-600 to-indigo-700'}`}
                      aria-disabled={unifiedLoading}
                    >
                      {unifiedLoading ? 'Creating...' : 'Create'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>, document.body)
        }

      {/* Email already in use dialog (uses ConfirmModal styling) */}
      <ConfirmModal
        open={showEmailInUseModal}
        title="Email already in use"
        description={emailInUseMessage}
        confirmText="OK"
        cancelText="Close"
        onConfirm={() => setShowEmailInUseModal(false)}
        onCancel={() => setShowEmailInUseModal(false)}
        isLoading={false}
      />

      {/* Generic success dialog (uses ConfirmModal styling) */}
      <ConfirmModal
        open={successDialog.open}
        title={successDialog.title || 'Success'}
        description={successDialog.description}
        confirmText="OK"
        cancelText="Close"
        onConfirm={() => setSuccessDialog({ open: false, title: '', description: '' })}
        onCancel={() => setSuccessDialog({ open: false, title: '', description: '' })}
        isLoading={false}
      />
    </MainLayout>
  );
};

export default AccountCreatorPage;
