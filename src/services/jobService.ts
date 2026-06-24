import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  orderBy, 
  getDoc, 
  doc, 
  deleteDoc, 
  updateDoc,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { JobOpening } from '../types';

// Collection reference
const JOBS_COLLECTION = 'job_openings';
const DEFAULT_COMPANY_LOGO = "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";

/**
 * Add a new job opening to Firestore
 */
export const createJobOpening = async (
  jobData: Omit<JobOpening, 'id' | 'posted_date'> & { requirements?: string | string[], logo?: string, expiresAt?: string },
  userId: string
): Promise<string> => {
  try {
    console.log('Creating job opening with data:', jobData);
    
    // Process requirements if needed
    let processedRequirements: string[] = [];
    
    if (typeof jobData.requirements === 'string') {
      // If requirements is a string, split it by newline
      processedRequirements = (jobData.requirements as string).split('\n').filter((req: string) => req.trim() !== '');
    } else if (Array.isArray(jobData.requirements)) {
      // If already an array, use it directly
      processedRequirements = jobData.requirements;
    }
    
    console.log('Processed requirements:', processedRequirements);
    
    // Prepare job data with server timestamp
    const newJobData = {
      ...jobData,
      logo: jobData.logo || DEFAULT_COMPANY_LOGO,
      posted_date: serverTimestamp(),
      createdBy: userId,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
      // Parse requirements string to array if it's a string 
      requirements: processedRequirements,
      // Handle expiration date
      expiresAt: jobData.expiresAt ? new Date(jobData.expiresAt).toISOString() : null
    };
    
    console.log(`Adding job to collection ${JOBS_COLLECTION}:`, newJobData);
    const jobRef = await addDoc(collection(db, JOBS_COLLECTION), newJobData);
    console.log(`Job created with ID: ${jobRef.id}`);
    return jobRef.id;
  } catch (error) {
    console.error('Error creating job opening:', error);
    throw error;
  }
};

/**
 * Get all job openings, sorted by newest first
 */
export const getJobOpenings = async (): Promise<JobOpening[]> => {
  try {
    console.log(`Getting job openings from collection: ${JOBS_COLLECTION}`);
    const jobsQuery = query(collection(db, JOBS_COLLECTION), orderBy('posted_date', 'desc'));
    const jobsSnapshot = await getDocs(jobsQuery);
    
    const jobs = jobsSnapshot.docs.map(doc => {
      const data = doc.data();
      console.log(`Found job: ${doc.id}`, data);
      return {
        id: doc.id,
        ...data,
        posted_date: (data.posted_date as Timestamp).toDate().toISOString().split('T')[0]
      };
    }) as JobOpening[];
    
    console.log(`Total jobs found: ${jobs.length}`);
    return jobs;
  } catch (error) {
    console.error('Error fetching job openings:', error);
    throw error;
  }
};

/**
 * Get only active (non-expired) job openings, sorted by newest first
 */
export const getActiveJobOpenings = async (): Promise<JobOpening[]> => {
  try {
    console.log(`Getting active job openings from collection: ${JOBS_COLLECTION}`);
    const jobsQuery = query(collection(db, JOBS_COLLECTION), orderBy('posted_date', 'desc'));
    const jobsSnapshot = await getDocs(jobsQuery);
    
    const now = new Date();
    const activeJobs = jobsSnapshot.docs
      .map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          posted_date: (data.posted_date as Timestamp).toDate().toISOString().split('T')[0]
        } as JobOpening;
      })
      .filter(job => {
        // If no expiration date, job is always active
        if (!job.expiresAt) return true;
        
        // Check if job has expired
        const expirationDate = new Date(job.expiresAt);
        return expirationDate > now;
      });
    
    console.log(`Active jobs found: ${activeJobs.length} out of ${jobsSnapshot.docs.length} total`);
    return activeJobs;
  } catch (error) {
    console.error('Error fetching active job openings:', error);
    throw error;
  }
};

/**
 * Get a specific job opening by ID
 */
export const getJobById = async (jobId: string): Promise<JobOpening | null> => {
  try {
    const jobDoc = await getDoc(doc(db, JOBS_COLLECTION, jobId));
    
    if (!jobDoc.exists()) {
      return null;
    }
    
    const jobData = jobDoc.data();
    return {
      id: jobDoc.id,
      ...jobData,
      posted_date: (jobData.posted_date as Timestamp).toDate().toISOString().split('T')[0]
    } as JobOpening;
  } catch (error) {
    console.error('Error fetching job opening:', error);
    throw error;
  }
};

/**
 * Update an existing job opening
 */
export const updateJobOpening = async (
  jobId: string, 
  jobData: Partial<Omit<JobOpening, 'id' | 'posted_date'>> & { requirements?: string | string[] }
): Promise<void> => {
  try {
    // Process requirements if needed
    if (jobData.requirements) {
      if (typeof jobData.requirements === 'string') {
        // If requirements is a string, split it by newline
        jobData.requirements = (jobData.requirements as string).split('\n').filter((req: string) => req.trim() !== '');
      }
    }
    
    const updateData = {
      ...jobData,
      updated_at: serverTimestamp()
    };
    
    await updateDoc(doc(db, JOBS_COLLECTION, jobId), updateData);
  } catch (error) {
    console.error('Error updating job opening:', error);
    throw error;
  }
};

/**
 * Delete a job opening
 */
export const deleteJobOpening = async (jobId: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, JOBS_COLLECTION, jobId));
  } catch (error) {
    console.error('Error deleting job opening:', error);
    throw error;
  }
};

/**
 * Filter job openings by type
 */
export const filterJobsByType = async (jobType: string): Promise<JobOpening[]> => {
  try {
    // Get all jobs first
    const allJobs = await getJobOpenings();
    
    // Filter by type
    return allJobs.filter(job => job.type === jobType);
  } catch (error) {
    console.error('Error filtering jobs:', error);
    throw error;
  }
};

/**
 * Clean up expired job openings
 */
export const cleanupExpiredJobOpenings = async (): Promise<number> => {
  try {
    console.log('Cleaning up expired job openings...');
    const jobsQuery = query(collection(db, JOBS_COLLECTION));
    const jobsSnapshot = await getDocs(jobsQuery);
    
    const now = new Date();
    let deletedCount = 0;
    
    for (const doc of jobsSnapshot.docs) {
      const data = doc.data();
      if (data.expiresAt) {
        const expirationDate = new Date(data.expiresAt);
        if (expirationDate <= now) {
          await deleteDoc(doc.ref);
          deletedCount++;
          console.log(`Deleted expired job: ${doc.id}`);
        }
      }
    }
    
    console.log(`Cleanup completed. Deleted ${deletedCount} expired job openings.`);
    return deletedCount;
  } catch (error) {
    console.error('Error cleaning up expired job openings:', error);
    throw error;
  }
};

/**
 * Schedule automatic cleanup of expired job openings
 * Call this function when the app starts to set up periodic cleanup
 */
export const scheduleJobCleanup = (intervalMinutes: number = 60): NodeJS.Timeout => {
  console.log(`Scheduling job cleanup every ${intervalMinutes} minutes`);
  
  // Run cleanup immediately
  cleanupExpiredJobOpenings().catch(error => {
    console.error('Initial job cleanup failed:', error);
  });
  
  // Schedule periodic cleanup
  return setInterval(() => {
    cleanupExpiredJobOpenings().catch(error => {
      console.error('Scheduled job cleanup failed:', error);
    });
  }, intervalMinutes * 60 * 1000);
};
