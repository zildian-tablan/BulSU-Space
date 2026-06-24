import axios from 'axios';
import { User, Post, Comment } from '../types';
import { auth } from '../firebase/config';

// API Base URL Configuration
// Previous implementation hard‑coded a local LAN IP for production which causes
// "Network Error" in deployed environments (unreachable / mixed content).
// Strategy:
// 1. Allow explicit override via REACT_APP_API_URL (set this to the root, without trailing /api if you like either form is normalized).
// 2. In development (localhost) point to local Express server.
// 3. In other cases fall back to relative '/api' (use a reverse proxy / rewrites) or optional secondary patterns.
const getApiBaseUrl = (): string => {
  try {
    const explicit = (process.env.REACT_APP_API_URL || '').trim();
    if (explicit) {
      // Normalize so we always end with /api
      const cleaned = explicit.replace(/\/$/, '').replace(/\/api\/?$/, '');
      return `${cleaned}/api`;
    }

    const { hostname, protocol } = window.location;
    const isLocal = ['localhost', '127.0.0.1'].includes(hostname);
    if (isLocal) {
      // Prefer 5000; if unreachable developer can set REACT_APP_API_URL or we'll attempt 5001 as alt (server auto-fallback)
      return 'http://localhost:5000/api';
    }

    // If hosted under a domain with a dedicated API subdomain pattern, allow using it (e.g. api.example.com)
    // You can customize this logic; by default just use relative path to leverage same-origin proxy/rewrite.
    return '/api';
  } catch (e) {
    // Fallback safest default (dev)
    return 'http://localhost:5000/api';
  }
};

// Create an axios instance with dynamic base URL
// Dynamic base URL (dev fallback from 5000 -> 5001) handled lazily.
let resolvedBaseURL = getApiBaseUrl();

// In dev, if pointing explicitly at localhost:5000, probe once and fallback to 5001 if 5000 is not responding.
if (resolvedBaseURL.startsWith('http://localhost:5000') && typeof window !== 'undefined') {
  // Fire and forget probe
  fetch('http://localhost:5000/api/health-dev-probe', { method: 'HEAD' })
    .catch(() => {
      // Only adjust if 5001 likely hosting (server auto-fallback prints log we can't read here)
      resolvedBaseURL = 'http://localhost:5001/api';
      api.defaults.baseURL = resolvedBaseURL;
      console.info('[api] Fallback baseURL ->', resolvedBaseURL);
    });
}

const api = axios.create({
  baseURL: resolvedBaseURL,
  timeout: 10000, // 10 second timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add a request interceptor to include the auth token in all requests
api.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Auth API
export const authAPI = {
  // Get current user profile
  getCurrentUser: async (): Promise<User | null> => {
    try {
      const response = await api.get('/auth/profile');
      return response.data;
    } catch (error) {
      console.error('Error fetching current user:', error);
      return null;
    }
  },
  
  // Update user profile
  updateProfile: async (userData: Partial<User>): Promise<boolean> => {
    try {
      await api.put('/auth/profile', userData);
      return true;
    } catch (error) {
      console.error('Error updating profile:', error);
      return false;
    }
  }
};

// Users API
export const usersAPI = {
  // Get all users
  getAllUsers: async (): Promise<User[]> => {
    try {
      const response = await api.get('/users');
      return response.data;
    } catch (error) {
      console.error('Error fetching users:', error);
      return [];
    }
  },
  
  // Get user by ID
  getUserById: async (userId: string): Promise<User | null> => {
    try {
      const response = await api.get(`/users/${userId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching user ${userId}:`, error);
      return null;
    }
  },

  // Permanently delete a user (admin only)
  deleteUser: async (userId: string): Promise<boolean> => {
    try {
      await api.delete(`/users/${userId}`);
      return true;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`Error deleting user ${userId}: status=${error.response?.status} data=`, error.response?.data);
      } else {
        console.error(`Error deleting user ${userId}:`, error);
      }
      return false;
    }
  }
};

// Posts API
export const postsAPI = {
  // Get all posts
  getAllPosts: async (): Promise<Post[]> => {
    try {
      const response = await api.get('/posts');
      return response.data;
    } catch (error) {
      console.error('Error fetching posts:', error);
      return [];
    }
  },
  
  // Get post by ID
  getPostById: async (postId: string): Promise<Post | null> => {
    try {
      const response = await api.get(`/posts/${postId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching post ${postId}:`, error);
      return null;
    }
  },
  
  // Create new post
  createPost: async (postData: Partial<Post>): Promise<Post | null> => {
    try {
      const response = await api.post('/posts', postData);
      return response.data;
    } catch (error) {
      console.error('Error creating post:', error);
      return null;
    }
  },
  
  // Update post
  updatePost: async (postId: string, postData: Partial<Post>): Promise<boolean> => {
    try {
      await api.put(`/posts/${postId}`, postData);
      return true;
    } catch (error) {
      console.error(`Error updating post ${postId}:`, error);
      return false;
    }
  },
  
  // Delete post
  deletePost: async (postId: string): Promise<boolean> => {
    try {
      await api.delete(`/posts/${postId}`);
      return true;
    } catch (error) {
      console.error(`Error deleting post ${postId}:`, error);
      return false;
    }
  },
  
  // Like a post
  likePost: async (postId: string): Promise<boolean> => {
    try {
      await api.post(`/posts/${postId}/like`);
      return true;
    } catch (error) {
      console.error(`Error liking post ${postId}:`, error);
      return false;
    }
  },
  
  // Add comment to a post
  addComment: async (postId: string, content: string): Promise<Comment | null> => {
    try {
      const response = await api.post(`/posts/${postId}/comments`, { content });
      return response.data;
    } catch (error) {
      console.error(`Error adding comment to post ${postId}:`, error);
      return null;
    }
  },
  
  // Get comments for a post
  getComments: async (postId: string): Promise<Comment[]> => {
    try {
      const response = await api.get(`/posts/${postId}/comments`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching comments for post ${postId}:`, error);
      return [];
    }
  }
};

export { api };
