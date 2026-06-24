/**
 * CORS Proxy Helper for Firebase
 * 
 * This module provides functions to help with CORS issues when accessing Firebase services
 * from localhost during development.
 */

const stableHash = (input: string): string => {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (Math.imul(31, hash) + input.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
};

/**
 * Adds CORS headers to fetch requests to Firebase services
 * @param url The Firebase URL to fetch from
 * @param options Fetch options
 * @returns Promise with the fetch response
 */
export const fetchWithCORS = async (url: string, options: RequestInit = {}) => {
  // Add CORS mode and credentials to options
  const corsOptions: RequestInit = {
    ...options,
    mode: 'cors',
    credentials: 'same-origin',
    headers: {
      ...options.headers,
      'Access-Control-Allow-Origin': window.location.origin,
    }
  };

  try {
    return await fetch(url, corsOptions);
  } catch (error) {
    console.error('CORS fetch error:', error);
    throw error;
  }
};

/**
 * Creates a URL object with CORS headers for Firebase Storage
 * @param url The Firebase Storage URL
 * @returns URL with CORS headers
 */
export const createCORSStorageURL = (url: string): string => {
  if (!url) return url;

  if (url.includes('firebasestorage.googleapis.com')) {
    try {
      const parsed = new URL(url);
      const token = parsed.searchParams.get('token');

      parsed.search = '';
      parsed.searchParams.set('alt', 'media');
      if (token) parsed.searchParams.set('token', token);
      const stableKey = stableHash(parsed.pathname + (token || ''));
      parsed.searchParams.set('t', stableKey);

      return parsed.toString();
    } catch (error) {
      console.error('Failed to create CORS-safe storage URL:', error);
      return url;
    }
  }

  return url;
};

/**
 * Checks if the current environment is localhost
 * @returns boolean indicating if running on localhost
 */
export const isLocalhost = (): boolean => {
  const hostname = window.location.hostname;
  return hostname === 'localhost' ||
         hostname === '127.0.0.1';
};

/**
 * Proxy function to safely get Firebase Storage URLs
 * This function handles CORS issues by modifying the URL structure
 * @param url The original Firebase Storage URL
 * @returns A CORS-friendly URL
 */
export const getProxiedStorageUrl = (url: string): string => {
  if (!url) return '';
  
  // Only apply proxy for localhost development
  if (!isLocalhost()) return url;
  
  // Handle Firebase Storage URLs
  if (url.includes('firebasestorage.googleapis.com')) {
    // Extract the download token if present
    const tokenMatch = url.match(/token=([^&]+)/);
    const token = tokenMatch ? tokenMatch[1] : '';
    
    // Create a direct download URL with the token
    const baseUrl = url.split('?')[0];
    const stableKey = stableHash(baseUrl + (token || ''));
    return `${baseUrl}?alt=media${token ? `&token=${token}` : ''}&t=${stableKey}`;
  }
  
  return url;
};
