import { Timestamp } from "firebase/firestore";

export interface MediaItem {
  type: 'image' | 'video' | 'document';
  url: string;
  name: string;
  size?: number;
  thumbnailUrl?: string;
  storagePath?: string;
}

export interface SpacePostReaction {
  userId: string;
  type: 'heart';
  timestamp: Timestamp;
}

export interface SpacePost {
  id: string;
  userId: string;
  userName: string;
  userProfilePic: string;
  userRole: string;
  content: string;
  groupId: string; // Required field to associate with a specific space
  media?: MediaItem[];
  mediaUrls?: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;  isPinned: boolean;
  pinnedAt?: Timestamp;
  isEdited: boolean;
  commentCount: number;
  reactionCount: number;
  reactions?: { [userId: string]: string };
  viewCount: number;
  viewedBy?: string[];
  tags?: string[];
  isOptimistic?: boolean; // Flag for optimistic updates
}

/**
 * Content moderation status for space posts
 */
export type ContentModerationStatus = 'pending' | 'approved' | 'rejected';

/**
 * Extended space post interface with content moderation
 */
export interface SpacePostWithModeration extends SpacePost {
  moderationStatus?: ContentModerationStatus;
  moderatedBy?: string;
  moderationNotes?: string;
  moderatedAt?: Timestamp;
}

/**
 * Space post creation interface - used when creating new posts
 */
export interface CreateSpacePostData {
  content: string;
  groupId: string;
  media?: File[];
  tags?: string[];
}

/**
 * Space post update interface - used when editing posts
 */
export interface UpdateSpacePostData {
  content?: string;
  media?: MediaItem[];
  tags?: string[];
}
