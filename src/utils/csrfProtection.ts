import { SecurityLogger } from './securityUtils';

// Extend XMLHttpRequest interface to include CSRF properties
declare global {
  interface XMLHttpRequest {
    _csrfMethod?: string;
    _csrfUrl?: string;
    shouldAddCSRF(method: string, url: string): boolean;
  }
}

interface CSRFConfig {
  tokenLength: number;
  headerName: string;
  cookieName: string;
  storageKey: string;
  rotationInterval: number; // in minutes
  maxAge: number; // in minutes
}

interface CSRFToken {
  token: string;
  createdAt: number;
  lastUsed: number;
  requestCount: number;
}

/**
 * CSRF Protection Manager for client-side security
 */
export class CSRFProtection {
  private static readonly DEFAULT_CONFIG: CSRFConfig = {
    tokenLength: 32,
    headerName: 'X-CSRF-Token',
    cookieName: 'csrf_token',
    storageKey: 'bulsu_csrf_token',
    rotationInterval: 60, // Rotate every hour
    maxAge: 120 // 2 hours max age
  };

  private static config: CSRFConfig = this.DEFAULT_CONFIG;
  private static currentToken: CSRFToken | null = null;
  private static rotationTimer: NodeJS.Timeout | null = null;

  /**
   * Initialize CSRF protection
   */
  static initialize(): void {
    try {
      // Load existing token or generate new one
      this.currentToken = this.loadToken() || this.generateNewToken();
      
      // Start token rotation timer
      this.startRotationTimer();
      
      // Set up request interceptors
      this.setupRequestInterceptors();

      console.log('[CSRF] Protection initialized successfully');
      SecurityLogger.logSecurityEvent('csrf_protection_initialized', {
        tokenAge: this.getTokenAge()
      });
    } catch (error) {
      console.error('[CSRF] Error initializing protection:', error);
      SecurityLogger.logSecurityEvent('csrf_initialization_error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Generate a new CSRF token
   */
  private static generateNewToken(): CSRFToken {
    const token = this.generateSecureToken();
    const now = Date.now();
    
    const csrfToken: CSRFToken = {
      token,
      createdAt: now,
      lastUsed: now,
      requestCount: 0
    };

    this.saveToken(csrfToken);
    SecurityLogger.logSecurityEvent('csrf_token_generated', {
      tokenLength: token.length
    });

    return csrfToken;
  }

  /**
   * Generate a cryptographically secure token
   */
  private static generateSecureToken(): string {
    const array = new Uint8Array(this.config.tokenLength);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Get current CSRF token
   */
  static getToken(): string {
    if (!this.currentToken || this.isTokenExpired()) {
      this.currentToken = this.generateNewToken();
    }

    this.currentToken.lastUsed = Date.now();
    this.currentToken.requestCount++;
    this.saveToken(this.currentToken);

    return this.currentToken.token;
  }

  /**
   * Validate CSRF token
   */
  static validateToken(token: string): boolean {
    if (!this.currentToken) {
      console.warn('[CSRF] No current token for validation');
      return false;
    }

    if (this.isTokenExpired()) {
      console.warn('[CSRF] Token expired');
      SecurityLogger.logSecurityEvent('csrf_token_expired', {
        tokenAge: this.getTokenAge()
      });
      return false;
    }

    const isValid = this.currentToken.token === token;
    
    if (!isValid) {
      console.warn('[CSRF] Token validation failed');
      SecurityLogger.logSecurityEvent('csrf_validation_failed', {
        providedToken: token ? 'present' : 'missing',
        expectedTokenAge: this.getTokenAge()
      });
    }

    return isValid;
  }

  /**
   * Check if current token is expired
   */
  private static isTokenExpired(): boolean {
    if (!this.currentToken) return true;
    
    const age = Date.now() - this.currentToken.createdAt;
    return age > (this.config.maxAge * 60 * 1000);
  }

  /**
   * Get token age in minutes
   */
  private static getTokenAge(): number {
    if (!this.currentToken) return 0;
    return Math.round((Date.now() - this.currentToken.createdAt) / 60000);
  }

  /**
   * Rotate token if needed
   */
  static rotateTokenIfNeeded(): void {
    if (!this.currentToken) {
      this.currentToken = this.generateNewToken();
      return;
    }

    const timeSinceCreation = Date.now() - this.currentToken.createdAt;
    const shouldRotate = timeSinceCreation > (this.config.rotationInterval * 60 * 1000);

    if (shouldRotate || this.isTokenExpired()) {
      console.log('[CSRF] Rotating token due to age or expiration');
      this.currentToken = this.generateNewToken();
    }
  }

  /**
   * Start automatic token rotation
   */
  private static startRotationTimer(): void {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
    }

    const intervalMs = this.config.rotationInterval * 60 * 1000;
    this.rotationTimer = setInterval(() => {
      this.rotateTokenIfNeeded();
    }, intervalMs);

    console.log(`[CSRF] Token rotation timer started (${this.config.rotationInterval} minutes)`);
  }

  /**
   * Set up request interceptors for automatic CSRF token inclusion
   */
  private static setupRequestInterceptors(): void {
    // Intercept fetch requests
    const originalFetch = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const enhancedInit = this.addCSRFToRequest(init);
      return originalFetch(input, enhancedInit);
    };    // Intercept XMLHttpRequest
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.open = function(method: string, url: string | URL, async: boolean = true, username?: string | null, password?: string | null) {
      this._csrfMethod = method;
      this._csrfUrl = url.toString();
      return originalOpen.call(this, method, url, async, username, password);
    };

    // Add shouldAddCSRF method to XMLHttpRequest prototype
    XMLHttpRequest.prototype.shouldAddCSRF = function(method: string, url: string): boolean {
      return CSRFProtection.shouldAddCSRF(method, url);
    };

    XMLHttpRequest.prototype.send = function(body?: any) {
      if (this._csrfMethod && this._csrfUrl && this.shouldAddCSRF(this._csrfMethod, this._csrfUrl)) {
        this.setRequestHeader(CSRFProtection.config.headerName, CSRFProtection.getToken());
      }
      return originalSend.call(this, body);
    };

    console.log('[CSRF] Request interceptors configured');
  }

  /**
   * Add CSRF token to request init
   */
  private static addCSRFToRequest(init?: RequestInit): RequestInit {
    if (!init) {
      init = {};
    }

    const method = init.method || 'GET';
    const url = ''; // URL is handled separately in fetch

    if (this.shouldAddCSRF(method, url)) {
      if (!init.headers) {
        init.headers = {};
      }

      if (init.headers instanceof Headers) {
        init.headers.set(this.config.headerName, this.getToken());
      } else if (Array.isArray(init.headers)) {
        init.headers.push([this.config.headerName, this.getToken()]);
      } else {
        (init.headers as Record<string, string>)[this.config.headerName] = this.getToken();
      }
    }

    return init;
  }

  /**
   * Determine if CSRF token should be added to request
   */
  private static shouldAddCSRF(method: string, url: string): boolean {
    // Add CSRF token to state-changing methods
    const stateMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    
    if (!stateMethods.includes(method.toUpperCase())) {
      return false;
    }

    // Only add to same-origin requests or configured API endpoints
    if (url.startsWith('http') && !url.startsWith(window.location.origin)) {
      // Check if it's a configured API endpoint
      const apiBaseUrl = process.env.REACT_APP_API_BASE_URL;
      if (!apiBaseUrl || !url.startsWith(apiBaseUrl)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Load token from storage
   */
  private static loadToken(): CSRFToken | null {
    try {
      const stored = sessionStorage.getItem(this.config.storageKey);
      if (stored) {
        const token = JSON.parse(stored) as CSRFToken;
        
        // Validate token is not expired
        if (!this.isTokenExpiredForToken(token)) {
          return token;
        }
      }
    } catch (error) {
      console.error('[CSRF] Error loading token from storage:', error);
    }
    
    return null;
  }

  /**
   * Save token to storage
   */
  private static saveToken(token: CSRFToken): void {
    try {
      sessionStorage.setItem(this.config.storageKey, JSON.stringify(token));
    } catch (error) {
      console.error('[CSRF] Error saving token to storage:', error);
    }
  }

  /**
   * Check if a specific token is expired
   */
  private static isTokenExpiredForToken(token: CSRFToken): boolean {
    const age = Date.now() - token.createdAt;
    return age > (this.config.maxAge * 60 * 1000);
  }

  /**
   * Clear CSRF token and cleanup
   */
  static cleanup(): void {
    try {
      if (this.rotationTimer) {
        clearInterval(this.rotationTimer);
        this.rotationTimer = null;
      }

      sessionStorage.removeItem(this.config.storageKey);
      this.currentToken = null;

      console.log('[CSRF] Protection cleaned up');
      SecurityLogger.logSecurityEvent('csrf_protection_cleaned_up', {});
    } catch (error) {
      console.error('[CSRF] Error during cleanup:', error);
    }
  }

  /**
   * Get CSRF token information
   */
  static getTokenInfo(): {
    hasToken: boolean;
    tokenAge: number;
    requestCount: number;
    isExpired: boolean;
  } {
    return {
      hasToken: !!this.currentToken,
      tokenAge: this.getTokenAge(),
      requestCount: this.currentToken?.requestCount || 0,
      isExpired: this.isTokenExpired()
    };
  }

  /**
   * Update CSRF configuration
   */
  static updateConfig(newConfig: Partial<CSRFConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('[CSRF] Configuration updated:', this.config);
  }

  /**
   * Get current configuration
   */
  static getConfig(): CSRFConfig {
    return { ...this.config };
  }
}

/**
 * CSRF Protection middleware for API calls
 */
export const withCSRFProtection = async (
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  // Ensure CSRF protection is initialized
  if (!CSRFProtection.getTokenInfo().hasToken) {
    CSRFProtection.initialize();
  }

  // Add CSRF token to headers
  const headers = new Headers(options.headers);
  const method = options.method || 'GET';

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) {
    headers.set('X-CSRF-Token', CSRFProtection.getToken());
  }

  // Make request with CSRF protection
  const response = await fetch(url, {
    ...options,
    headers
  });

  // Log CSRF-related errors
  if (!response.ok && response.status === 403) {
    SecurityLogger.logSecurityEvent('csrf_request_blocked', {
      url,
      method,
      status: response.status
    });
  }

  return response;
};

/**
 * React hook for CSRF protection monitoring
 */
export const useCSRFProtection = () => {
  const [tokenInfo, setTokenInfo] = React.useState(CSRFProtection.getTokenInfo());

  React.useEffect(() => {
    // Initialize CSRF protection
    CSRFProtection.initialize();

    // Update token info periodically
    const interval = setInterval(() => {
      setTokenInfo(CSRFProtection.getTokenInfo());
    }, 30000); // Update every 30 seconds

    return () => {
      clearInterval(interval);
      CSRFProtection.cleanup();
    };
  }, []);

  const refreshToken = () => {
    CSRFProtection.rotateTokenIfNeeded();
    setTokenInfo(CSRFProtection.getTokenInfo());
  };

  return {
    tokenInfo,
    refreshToken,
    isProtected: tokenInfo.hasToken && !tokenInfo.isExpired
  };
};

// Add React import
import React from 'react';
