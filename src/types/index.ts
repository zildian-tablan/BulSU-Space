export interface User {
  id: number;
  name: string;
  role: string;
  profile_pic: string;
}

export interface NavItem {
  icon: string;
  label: string;
  notifications: number;
  tab: string;
}

export interface Event {
  title: string;
  date: string;
  image?: string;
  description?: string;
}

export interface Group {
  name: string;
  members: number;
  image: string;
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

export interface SidebarSection {
  title: string;
  icon: string;
  content: (Event | Group | FriendSuggestion | Weather)[];
}

export interface Post {
  id: number;
  user: User;
  content: string;
  type: string;
  created_at: string;
  likes: number;
  comments: number;
  image?: string;
}
