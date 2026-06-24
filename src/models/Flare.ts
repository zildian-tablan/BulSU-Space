import { Timestamp } from 'firebase/firestore';

export interface Flare {
  id: string;
  userId: string;
  userName: string;
  userProfilePic: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  thumbnail?: string; // For videos
  description?: string; // Short description (max 150 chars)
  createdAt: Timestamp;
  viewCount?: number;
  likeCount?: number;
}

export interface CreateFlareData {
  userId: string;
  mediaFile: File;
  description?: string;
}
