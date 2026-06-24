export interface NavItem {
  icon: string;
  label: string;
  notifications: number;
  tab: string;
}

export interface CalendarEvent {
  title: string;
  date: string;
}

export interface Event {
  title: string;
  date: string;
  image?: string;
  description?: string;
}

export interface AcademicTerm {
  title: string;
  date: string;
  events: CalendarEvent[];
}

export interface Group {
  name: string;
  members: number;
  image?: string;
  description?: string;
}

export interface FriendSuggestion {
  name: string;
  role: string;
  profile_pic: string;
  mutual_friends: number;
}

export interface Weather {
  location: string;
  temperature: number;
  condition: string;
  icon: string;
  humidity?: number;
  windSpeed?: number;
}

export interface JobOpening {
  id: string;
  title: string;
  company: string;
  logo?: string;
  location: string;
  type: 'Full-time' | 'Part-time' | 'Contract' | 'Internship' | 'Remote';
  posted_date: string;
  salary_range?: string;
  description: string;
  requirements?: string[];
  applicationUrl?: string;
  createdBy?: string; // ID of the user who created the job
  expiresAt?: string; // ISO date string for when the job posting expires
}

export interface SidebarSection {
  title: string;
  icon: string;
  content: AcademicTerm[] | Event[] | Group[] | FriendSuggestion[] | JobOpening[];
}

export interface Comment {
  id: number;
  post_id: number;
  user_id: number;
  user_name: string;
  user_profile_pic: string;
  content: string;
  created_at: string;
}

export interface FileAttachment {
  name: string;
  url: string;
  size: string;
  type: 'pdf' | 'docx' | 'ppt' | 'xlsx' | 'other';
  icon?: string;
}

export interface ImageAttachment {
  url: string;
  caption?: string;
}

export interface VideoAttachment {
  url: string;
  thumbnail?: string;
  duration?: string;
}

export interface PostAttachments {
  images?: ImageAttachment[];
  video?: VideoAttachment;
  files?: FileAttachment[];
}

export interface Post {
  id: number;
  user_id: number;
  user_name: string;
  user_role: string;
  user_profile_pic: string;
  content: string;
  attachments?: PostAttachments;
  type: 'academic' | 'question' | 'resource' | 'event' | 'announcement' | 'post';
  isAdmin?: boolean; // For announcement posts
  likes: number;
  shares: number;
  comments: Comment[];
  created_at: string;
}

// User types
export type UserRole = 'student' | 'faculty' | 'alumni' | 'admin' | 'super admin' | 'dean' | 'guest' | 'infirmary' | 'librarian';

export interface User {
  id: string;
  email: string;
  name: string;
  idNumber: string;
  role: UserRole;
  profile_pic?: string;
  phoneNumber?: string;
  resetEmail?: string;
  emailVerified?: boolean;
  mfaEnabled?: boolean;
  restricted?: boolean;
  restrictedAt?: string | null;
  restrictionExpiresAt?: string | null;
}
