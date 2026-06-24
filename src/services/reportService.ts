import { 
  collection, 
  doc, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  updateDoc,
  serverTimestamp,
  Timestamp,
  deleteDoc,
  getDoc
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { PostReport, ReportReasonId, REPORT_REASONS } from '../models/Post';
import { activityLogger } from './activityLogService';
import { markPostAsReported } from './postService';
import { notifyModeratorsPostReported } from './notificationTriggers';

// Collection paths
const REPORTS_COLLECTION = 'reports';
const POSTS_COLLECTION = 'posts';

/**
 * Report a post
 */
export const reportPost = async (
  postId: string, 
  userId: string, 
  reason: ReportReasonId, 
  details?: string
): Promise<string> => {
  try {
    // Check if the user is an admin or super admin
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists() && (userSnap.data()?.role === 'admin' || userSnap.data()?.role === 'super admin')) {
      throw new Error('Admins and super admins cannot report posts');
    }
    
    // Create report document
    const reportData = {
      postId,
      userId,
      reason,
      details,
      createdAt: serverTimestamp(),
      status: 'pending' as const
    };

    const reportRef = await addDoc(collection(db, REPORTS_COLLECTION), reportData);
    
    // Mark the post as reported
    await markPostAsReported(postId, reason);
    
    // Log activity for report creation
    await activityLogger.logActivity(
      'post_reported',
      `Post reported by user ${userId}`,
      { postId, reportId: reportRef.id, reason },
      'medium',
      postId,
      'post'
    );

    try {
      await notifyModeratorsPostReported(postId, userId, reason, details);
    } catch (notifyError) {
      console.error('Failed to notify moderators about reported post:', notifyError);
    }

    return reportRef.id;
  } catch (error) {
    console.error('Error reporting post:', error);
    throw error;
  }
};

/**
 * Get all reported posts for admins
 */
export const getReportedPosts = async (): Promise<PostReport[]> => {
  try {
    const reportsQuery = query(
      collection(db, REPORTS_COLLECTION),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );

    const snapshot = await getDocs(reportsQuery);
    const reports: PostReport[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      reports.push({
        id: doc.id,
        postId: data.postId,
        userId: data.userId,
        reason: data.reason,
        details: data.details,
        createdAt: data.createdAt,
        status: data.status
      });
    });

    return reports;
  } catch (error) {
    console.error('Error fetching reported posts:', error);
    throw error;
  }
};

/**
 * Update report status
 */
export const updateReportStatus = async (
  reportId: string, 
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed'
): Promise<void> => {
  try {
    await updateDoc(doc(db, REPORTS_COLLECTION, reportId), {
      status,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error updating report status:', error);
    throw error;
  }
};

/**
 * Get report reason label
 */
export const getReportReasonLabel = (reason: ReportReasonId): string => {
  const reportReason = REPORT_REASONS.find(r => r.id === reason);
  return reportReason ? reportReason.label : 'Unknown reason';
};

/**
 * Get report reason description
 */
export const getReportReasonDescription = (reason: ReportReasonId): string => {
  const reportReason = REPORT_REASONS.find(r => r.id === reason);
  return reportReason ? reportReason.description : 'No description available';
};

/**
 * Get report reason color for badge
 */
export const getReportReasonColor = (reason: ReportReasonId): string => {
  const colorMap: Record<ReportReasonId, string> = {
    inappropriate: 'bg-red-500',
    spam: 'bg-yellow-500',
    harassment: 'bg-orange-500',
    hate_speech: 'bg-red-600',
    violence: 'bg-red-700',
    intellectual_property: 'bg-purple-500',
    other: 'bg-gray-500'
  };
  
  return colorMap[reason] || 'bg-gray-500';
}; 

export const unreportPost = async (postId: string) => {
  // Delete all reports for this post
  const reportsQuery = query(
    collection(db, 'reports'),
    where('postId', '==', postId)
  );
  const reportsSnapshot = await getDocs(reportsQuery);
  const deletePromises = reportsSnapshot.docs.map(reportDoc => deleteDoc(reportDoc.ref));
  await Promise.all(deletePromises);

  // Update the post to clear reported fields
  const postRef = doc(db, 'posts', postId);
  await updateDoc(postRef, {
    reported: false,
    reportReason: null
  });
}; 