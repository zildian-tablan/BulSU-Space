import { Timestamp } from "firebase/firestore";

export type PostVisibility = 'public' | 'students' | 'faculty' | 'alumni' | 'admin' | 'friends' | 'classmates' | 'colleagues' | 'school' | 'poshed' | 'fipo' | 'afea' | 'shatmo' | 'group';

export interface MediaItem {
  type: 'image' | 'video' | 'document';
  url: string;
  name: string;
  size?: number;
  thumbnailUrl?: string;
  // Full storage path in the bucket (e.g. "posts/{userId}/{fileId}_name")
  storagePath?: string;
}

export interface PostReaction {
  userId: string;
  type: 'heart';
  timestamp: Timestamp;
}

export interface Post {
  id: string;
  userId: string;
  userName: string;
  userProfilePic: string;
  userRole: string;
  content: string;
  media?: MediaItem[];
  mediaUrls?: string[];
  visibility: PostVisibility;
  createdAt: Timestamp;
  updatedAt: Timestamp;  isPinned: boolean;
  pinnedAt?: Timestamp;
  isEdited: boolean;
  commentCount: number;
  reactionCount: number;
  reactions?: { [userId: string]: string }; // Add reactions field
  viewCount: number;
  viewedBy?: string[];
  viewRoleBreakdown?: Record<string, number>;
  tags?: string[];
  taggedFriends?: string[];
  taggedGroups?: string[];
  isOptimistic?: boolean; // Flag for optimistic updates
  reported?: boolean; // Flag for reported posts
  reportReason?: ReportReasonId; // Reason for report
  draft?: boolean; // Optional draft flag used to hide newly-created posts until fully initialized (e.g., polls)
  // Poll fields
  isPoll?: boolean; // Indicates this post has a poll
  hasPoll?: boolean; // Legacy field for backward compatibility
  pollId?: string; // ID of the poll in the polls collection
  pollOptionCount?: number; // Number of poll options
  // Sharing feature fields
  isShare?: boolean; // Indicates this post is a shared post
  sharedFromPostId?: string; // Original post ID
  sharedFromUserId?: string; // Original author user ID
  sharedFromUserName?: string; // Original author name
  // Root/original source when multiple shares chain exists
  originalPostId?: string; // The root original post ID (first author's post)
  originalPostUserId?: string; // The root original author user ID
  originalPostUserName?: string; // The root original author name
  sharedAt?: Timestamp; // When the post was shared
  shareCount?: number; // Number of times this post has been shared
  // Shared post reference (stored in shared_posts collection)
  sharedPostRefId?: string;
  sharedPostSnapshot?: SharedPostRecord;
  // Annual archive metadata
  annual_archive_date?: Timestamp;
  archive_school_year?: string; // e.g. "S.Y. 2025-2026"
  archived?: boolean;
}

export interface SharedPostRecord {
  id: string;
  originalPostId: string;
  originalPostAuthorId: string;
  originalPostAuthorName: string;
  originalPostAuthorProfilePic?: string;
  originalPostContent: string;
  originalPostMedia?: MediaItem[];
  originalPostCreatedAt?: Timestamp;
  originalPostUpdatedAt?: Timestamp;
  sharerId: string;
  sharerName: string;
  sharerProfilePic?: string;
  sharerRole?: string;
  sharerCaption?: string;
  sharedAt: Timestamp;
  visibility: PostVisibility;
}

/**
 * Content moderation status for posts and comments
 */
export type ContentModerationStatus = 'pending' | 'approved' | 'rejected';

/**
 * Extended post interface with content moderation
 */
export interface PostWithModeration extends Post {
  moderationStatus?: ContentModerationStatus;
  moderationReason?: string;
}

export interface Comment {
  id: string;
  postId: string;
  userId: string;
  userName: string;
  userProfilePic: string;
  userRole: string;
  content: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  isEdited: boolean;
  // Optional reference to another comment when this comment is a reply
  replyTo?: string | null;
}

export type ReportReasonId = 'inappropriate' | 'spam' | 'harassment' | 'hate_speech' | 'violence' | 'intellectual_property' | 'other';

export interface ReportReason {
  id: ReportReasonId;
  label: string;
  description: string;
}

export interface PostReport {
  id: string;
  postId: string;
  userId: string;
  reason: ReportReasonId;
  details?: string;
  createdAt: Timestamp;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
}

export const POST_VISIBILITY_OPTIONS: { value: PostVisibility; label: string }[] = [
  { value: 'public', label: 'Everyone at BulSU Space' },
  { value: 'school', label: 'School Only' },
  { value: 'friends', label: 'Friends' },
  { value: 'classmates', label: 'Classmates' },
  { value: 'colleagues', label: 'Colleagues' }
];

export const REPORT_REASONS: ReportReason[] = [
  { id: 'inappropriate', label: 'Inappropriate content', description: 'Content that violates community standards' },
  { id: 'spam', label: 'Spam or misleading', description: 'Unwanted commercial content or misleading information' },
  { id: 'harassment', label: 'Harassment or bullying', description: 'Content that harasses, intimidates, or bullies others' },
  { id: 'hate_speech', label: 'Hate speech', description: 'Content that promotes hate or discrimination' },
  { id: 'violence', label: 'Violence or dangerous behavior', description: 'Content that promotes violence or dangerous activities' },
  { id: 'intellectual_property', label: 'Intellectual property violation', description: 'Content that violates copyright, trademark, or other rights' },
  { id: 'other', label: 'Other reason', description: 'Other issues not covered by the categories above' }
];

 
