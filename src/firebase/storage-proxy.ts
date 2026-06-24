/**
 * Firebase Storage Proxy
 * 
 * This module provides a proxy for Firebase Storage that handles CORS issues
 * when accessing Firebase Storage resources from localhost during development.
 */
import { ref, getDownloadURL } from 'firebase/storage';
import { storage } from './config';

// Simple in-memory cache so we don't mutate the URL (and re-trigger fetch) every re-render
const processedUrlCache = new Map<string, string>();

// Download URL cache with timestamp for expiry detection
interface CachedUrl {
  url: string;
  timestamp: number;
  token?: string;
}
const downloadUrlCache = new Map<string, CachedUrl>();
const CACHE_EXPIRY_MS = 55 * 60 * 1000; // 55 minutes (Firebase tokens expire in 1 hour)

// Stable hash for a path so we can derive a deterministic cache-busting key (instead of Date.now which flickers)
const stableHash = (input: string): string => {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
  }
  // Convert to unsigned & shorten
  return (h >>> 0).toString(36);
};

// Check if a cached URL has expired
const isCacheExpired = (cached: CachedUrl): boolean => {
  return Date.now() - cached.timestamp > CACHE_EXPIRY_MS;
};

/**
 * Get a download URL for a Firebase Storage file with CORS handling
 * @param path The path to the file in Firebase Storage
 * @param forceRefresh Force a fresh URL from Firebase (bypasses cache)
 * @returns Promise with the download URL
 */
export const getStorageDownloadUrl = async (path: string, forceRefresh: boolean = false): Promise<string> => {
  if (!path) {
    throw new Error('Storage path is required');
  }

  // Check cache first (unless force refresh)
  if (!forceRefresh && downloadUrlCache.has(path)) {
    const cached = downloadUrlCache.get(path)!;
    if (!isCacheExpired(cached)) {
      console.log(`[StorageProxy] Using cached URL for: ${path}`);
      return cached.url;
    } else {
      console.log(`[StorageProxy] Cache expired for: ${path}, fetching fresh URL`);
      downloadUrlCache.delete(path);
    }
  }

  try {
    // Create a reference to the file
    const fileRef = ref(storage, path);
    
    // Get the download URL with timeout
    const url = await Promise.race([
      getDownloadURL(fileRef),
      new Promise<string>((_, reject) => 
        setTimeout(() => reject(new Error('Download URL request timeout')), 15000)
      )
    ]);
    
    // Extract token from URL for cache validation
    const urlObj = new URL(url);
    const token = urlObj.searchParams.get('token') || undefined;
    
    // Cache the result
    downloadUrlCache.set(path, {
      url,
      timestamp: Date.now(),
      token
    });
    
    // Add CORS parameters to the URL
    return addCorsParameters(url);
  } catch (error: any) {
    console.error(`[StorageProxy] Error getting storage download URL for ${path}:`, error);
    
    // If we have an expired cached version, use it as fallback
    if (downloadUrlCache.has(path)) {
      console.warn(`[StorageProxy] Using expired cache as fallback for: ${path}`);
      return downloadUrlCache.get(path)!.url;
    }
    
    throw error;
  }
};

/**
 * Add CORS parameters to a Firebase Storage URL
 * @param url The Firebase Storage URL
 * @returns URL with CORS parameters
 */
export const addCorsParameters = (url: string): string => {
  if (!url) return '';
  if (processedUrlCache.has(url)) return processedUrlCache.get(url)!;

  try {
    if (url.includes('firebasestorage.googleapis.com')) {
      const urlObj = new URL(url);
      // alt=media for direct access
      urlObj.searchParams.set('alt', 'media');
      // Only add a stable cache-buster if one not already present (t= or v= or token=)
      if (!urlObj.searchParams.has('t') && !urlObj.searchParams.has('v')) {
        // Derive stable value from object path so it does not change every render
        const key = stableHash(urlObj.pathname + (urlObj.searchParams.get('token') || ''));
        urlObj.searchParams.set('t', key);
      }
      const finalUrl = urlObj.toString();
      
      // Limit cache size to prevent memory bloat
      if (processedUrlCache.size > 500) {
        const firstKey = processedUrlCache.keys().next().value;
        if (firstKey) {
          processedUrlCache.delete(firstKey);
        }
      }
      
      processedUrlCache.set(url, finalUrl);
      return finalUrl;
    }
    processedUrlCache.set(url, url);
    return url;
  } catch (error) {
    console.error('Error adding CORS parameters:', error);
    return url; // fail open
  }
};

/**
 * Process a Firebase Storage URL that's already been retrieved
 * @param url The Firebase Storage URL
 * @returns URL with CORS parameters
 */
export const processStorageUrl = (url: string): string => {
  if (!url) return '';
  if (!url.includes('firebasestorage.googleapis.com')) return url; // Non-storage URL
  return addCorsParameters(url);
};

/**
 * Attempt to re-resolve a Firebase Storage URL (token might have expired).
 * Provide the original reference/path if available.
 */
export const refreshDownloadUrl = async (maybeUrlOrPath: string): Promise<string> => {
  // If it's already a full URL, try to extract object path
  try {
    if (maybeUrlOrPath.startsWith('http')) {
      const u = new URL(maybeUrlOrPath);
      if (u.hostname.includes('firebasestorage.googleapis.com')) {
        // Path pattern: /v0/b/<bucket>/o/<encodedPath>
        const parts = u.pathname.split('/');
        const oIndex = parts.indexOf('o');
        if (oIndex !== -1 && parts.length > oIndex + 1) {
          const encoded = parts[oIndex + 1];
          const decodedPath = decodeURIComponent(encoded);
          
          // Force a fresh URL from Firebase
          console.log(`[StorageProxy] Refreshing URL for path: ${decodedPath}`);
          const fresh = await getStorageDownloadUrl(decodedPath, true);
          return fresh;
        }
      }
      // If not resolvable, just return processed original
      console.warn('[StorageProxy] Could not extract path from URL, using processed original');
      return processStorageUrl(maybeUrlOrPath);
    }
    // Treat as storage path and force refresh
    console.log(`[StorageProxy] Refreshing URL for storage path: ${maybeUrlOrPath}`);
    const fresh = await getStorageDownloadUrl(maybeUrlOrPath, true);
    return fresh;
  } catch (e) {
    console.warn('[StorageProxy] refreshDownloadUrl failed, using original', e);
    return processStorageUrl(maybeUrlOrPath);
  }
};

/**
 * Validate if a Firebase Storage URL might be expired
 * @param url The URL to validate
 * @returns true if the URL appears to be valid and fresh
 */
export const isUrlFresh = (url: string): boolean => {
  if (!url || !url.includes('firebasestorage.googleapis.com')) {
    return true; // Non-storage URLs are considered valid
  }
  
  try {
    const urlObj = new URL(url);
    const token = urlObj.searchParams.get('token');
    
    if (!token) {
      return false; // Storage URLs should have a token
    }
    
    // Check if we have this in our cache and if it's expired
    for (const [path, cached] of downloadUrlCache.entries()) {
      if (cached.token === token) {
        return !isCacheExpired(cached);
      }
    }
    
    // If not in cache, assume it's valid
    return true;
  } catch (e) {
    console.warn('[StorageProxy] Error validating URL freshness:', e);
    return true; // Assume valid if we can't parse
  }
};
