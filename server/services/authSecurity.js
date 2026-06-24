/**
 * Authentication Security Service
 * 
 * Provides server-side security controls for authentication including:
 * - Login attempt tracking
 * - Account lockout mechanisms
 * - IP-based rate limiting
 * - Suspicious activity detection
 */

const admin = require('firebase-admin');
const rateLimit = require('express-rate-limit');

// Constants for security configuration - can be moved to environment variables
// Updated security configuration:
// - Reduce max attempts to 3
// - Reduce lockout duration to 1 minute
// - Keep attempt window at 5 minutes (user has 5 minutes to accrue 3 failures)
const MAX_LOGIN_ATTEMPTS = process.env.MAX_LOGIN_ATTEMPTS || 3;
const LOCKOUT_DURATION_MS = process.env.LOCKOUT_DURATION_MS || 60 * 1000; // 1 minute
const ATTEMPT_WINDOW_MS = process.env.ATTEMPT_WINDOW_MS || 5 * 60 * 1000; // 5 minutes
const IP_RATE_LIMIT_WINDOW_MS = process.env.IP_RATE_LIMIT_WINDOW_MS || 60 * 60 * 1000; // 1 hour
const IP_MAX_ATTEMPTS = process.env.IP_MAX_ATTEMPTS || 20; // Max 20 failed attempts per hour per IP

// Get Firestore instance
let db = null;
try {
  if (admin.apps.length > 0) {
    db = admin.firestore();
  }
} catch (error) {
  console.error('Firebase not available in auth security service:', error.message);
}

/**
 * Create collections if they don't exist
 */
const ensureCollections = async () => {
  if (!db) return;
  
  try {
    // Check if collections exist by attempting to get a document
    const loginAttemptsRef = db.collection('login_attempts').doc('init');
    const accountLocksRef = db.collection('account_locks').doc('init');
    const ipLimitsRef = db.collection('ip_limits').doc('init');
    
    // Create if they don't exist
    const batch = db.batch();
    
    const loginAttemptsDoc = await loginAttemptsRef.get();
    if (!loginAttemptsDoc.exists) {
      batch.set(loginAttemptsRef, { 
        initialized: true, 
        timestamp: admin.firestore.FieldValue.serverTimestamp() 
      });
    }
    
    const accountLocksDoc = await accountLocksRef.get();
    if (!accountLocksDoc.exists) {
      batch.set(accountLocksRef, { 
        initialized: true, 
        timestamp: admin.firestore.FieldValue.serverTimestamp() 
      });
    }
    
    const ipLimitsDoc = await ipLimitsRef.get();
    if (!ipLimitsDoc.exists) {
      batch.set(ipLimitsRef, { 
        initialized: true, 
        timestamp: admin.firestore.FieldValue.serverTimestamp() 
      });
    }
    
    await batch.commit();
  } catch (error) {
    console.error('Error initializing security collections:', error);
  }
};

// Initialize collections when the module is loaded
ensureCollections();

/**
 * Check if an account is locked
 * @param {string} email - The email to check
 * @returns {Promise<{locked: boolean, remainingTime: number}>} - Lockout status and remaining time in ms
 */
const isAccountLocked = async (email) => {
  if (!db) return { locked: false, remainingTime: 0 };
  
  try {
    const normalizedEmail = email.toLowerCase();
    const lockDoc = await db.collection('account_locks').doc(normalizedEmail).get();
    
    if (!lockDoc.exists) {
      return { locked: false, remainingTime: 0 };
    }
    
    const lockData = lockDoc.data();
    const now = Date.now();
    const lockExpires = lockData.lockedUntil?.toMillis?.() || lockData.lockedUntil;
    
    if (now < lockExpires) {
      return { 
        locked: true, 
        remainingTime: lockExpires - now,
        attemptCount: lockData.attemptCount || 0 
      };
    } else {
      // Lock expired, clean it up
      await db.collection('account_locks').doc(normalizedEmail).delete();
      return { locked: false, remainingTime: 0 };
    }
  } catch (error) {
    console.error('Error checking account lock status:', error);
    // Fail open to prevent denial of service
    return { locked: false, remainingTime: 0 };
  }
};

/**
 * Check if an IP is rate limited
 * @param {string} ip - The IP address to check
 * @returns {Promise<{limited: boolean, remainingTime: number}>} - Rate limit status
 */
const isIpLimited = async (ip) => {
  if (!db) return { limited: false, remainingTime: 0 };
  
  try {
    const ipDoc = await db.collection('ip_limits').doc(ip).get();
    
    if (!ipDoc.exists) {
      return { limited: false, remainingTime: 0 };
    }
    
    const ipData = ipDoc.data();
    const now = Date.now();
    
    // Check if limitation window has expired
    if (ipData.limitUntil && now < ipData.limitUntil) {
      return { 
        limited: true, 
        remainingTime: ipData.limitUntil - now,
        attemptCount: ipData.attemptCount || 0
      };
    } else {
      // Check recent attempts within window
      const recentAttempts = await db.collection('login_attempts')
        .where('ip', '==', ip)
        .where('timestamp', '>', now - IP_RATE_LIMIT_WINDOW_MS)
        .where('success', '==', false)
        .get();
      
      if (recentAttempts.size >= IP_MAX_ATTEMPTS) {
        // Too many recent attempts, set a limit
        const limitUntil = now + IP_RATE_LIMIT_WINDOW_MS;
        await db.collection('ip_limits').doc(ip).set({
          ip,
          limitUntil,
          attemptCount: recentAttempts.size,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        return { 
          limited: true, 
          remainingTime: IP_RATE_LIMIT_WINDOW_MS,
          attemptCount: recentAttempts.size
        };
      }
      
      return { limited: false, remainingTime: 0 };
    }
  } catch (error) {
    console.error('Error checking IP rate limit:', error);
    // Fail open to prevent denial of service
    return { limited: false, remainingTime: 0 };
  }
};

/**
 * Record a login attempt
 * @param {Object} attemptData - Login attempt data
 * @param {string} attemptData.email - The email used in the attempt
 * @param {boolean} attemptData.success - Whether the login was successful
 * @param {string} attemptData.ip - IP address of the request
 * @param {string} attemptData.userAgent - User agent string
 * @returns {Promise<Object>} - Result with lockout status if applicable
 */
const recordLoginAttempt = async (attemptData) => {
  const { email, success, ip, userAgent } = attemptData;
  
  if (!db) {
    console.warn('Skipping login attempt recording - Firestore not available');
    return { recorded: false };
  }
  
  try {
    const normalizedEmail = email.toLowerCase();
    const now = Date.now();
    
    // Add the attempt to the login_attempts collection
    await db.collection('login_attempts').add({
      email: normalizedEmail,
      success,
      ip,
      userAgent,
      timestamp: now,
      serverTimestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // If the login was successful, clear any lockouts
    if (success) {
      await db.collection('account_locks').doc(normalizedEmail).delete();
      return { recorded: true, status: 'success' };
    }
    
    // Check recent failed attempts for this email
    const recentAttempts = await db.collection('login_attempts')
      .where('email', '==', normalizedEmail)
      .where('timestamp', '>', now - ATTEMPT_WINDOW_MS)
      .where('success', '==', false)
      .get();
    
    const attemptCount = recentAttempts.size;
    
    // If too many failed attempts, lock the account
    if (attemptCount >= MAX_LOGIN_ATTEMPTS) {
      const lockedUntil = now + LOCKOUT_DURATION_MS;
      
      await db.collection('account_locks').doc(normalizedEmail).set({
        email: normalizedEmail,
        lockedUntil,
        attemptCount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.warn(`Account locked for ${normalizedEmail} due to ${attemptCount} failed attempts`);
      
      return { 
        recorded: true, 
        status: 'locked',
        lockedUntil,
        attemptCount,
        remainingTime: LOCKOUT_DURATION_MS
      };
    }
    
    return { 
      recorded: true, 
      status: 'failed',
      attemptCount,
      attemptsRemaining: MAX_LOGIN_ATTEMPTS - attemptCount
    };
  } catch (error) {
    console.error('Error recording login attempt:', error);
    return { recorded: false, error: error.message };
  }
};

/**
 * Express middleware to check account and IP lockout status
 */
const lockoutMiddleware = async (req, res, next) => {
  // Extract email from request body or params
  const email = req.body?.email || req.query?.email;
  
  if (!email) {
    return next();
  }
  
  try {
    // Get the client IP
    const ip = req.ip || 
               req.connection.remoteAddress || 
               req.headers['x-forwarded-for']?.split(',')[0]?.trim();
    
    // Check IP rate limiting first
    const ipStatus = await isIpLimited(ip);
    if (ipStatus.limited) {
      console.warn(`IP ${ip} is rate limited - too many login attempts`);
      return res.status(429).json({
        error: 'Too many login attempts from this IP address',
        retryAfter: Math.ceil(ipStatus.remainingTime / 1000), // in seconds
        limitType: 'ip'
      });
    }
    
    // Then check account lockout
    const accountStatus = await isAccountLocked(email);
    if (accountStatus.locked) {
      console.warn(`Account ${email} is locked - rejecting login attempt`);
      return res.status(429).json({
        error: 'Account temporarily locked due to too many failed attempts',
        retryAfter: Math.ceil(accountStatus.remainingTime / 1000), // in seconds
        limitType: 'account'
      });
    }
    
    next();
  } catch (error) {
    console.error('Error in lockout middleware:', error);
    // Fail open - better to allow the request than cause denial of service
    next();
  }
};

// Create an Express rate limiter as a backup layer of protection
const ipRateLimiter = rateLimit({
  windowMs: IP_RATE_LIMIT_WINDOW_MS,
  max: IP_MAX_ATTEMPTS * 2, // Double the limit as a backup
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const email = req.body?.email || req.query?.email || 'unknown';
    console.warn(`Rate limit exceeded for IP: ${req.ip}, email attempt: ${email}`);
    
    res.status(429).json({
      error: 'Too many authentication attempts from this IP. Please try again later.',
      retryAfter: Math.ceil(IP_RATE_LIMIT_WINDOW_MS / 1000) // in seconds
    });
  }
});

/**
 * Clean up old login attempts data (can be run periodically)
 * @param {number} olderThanMs - Remove data older than this many ms
 */
const cleanupOldAttempts = async (olderThanMs = 30 * 24 * 60 * 60 * 1000) => {
  if (!db) return { cleaned: false };
  
  try {
    const now = Date.now();
    const cutoff = now - olderThanMs;
    
    const oldAttempts = await db.collection('login_attempts')
      .where('timestamp', '<', cutoff)
      .get();
    
    const batch = db.batch();
    let count = 0;
    
    oldAttempts.forEach(doc => {
      batch.delete(doc.ref);
      count++;
    });
    
    if (count > 0) {
      await batch.commit();
      console.log(`Cleaned up ${count} old login attempt records`);
    }
    
    // Also clean expired locks
    const expiredLocks = await db.collection('account_locks')
      .where('lockedUntil', '<', now)
      .get();
    
    if (!expiredLocks.empty) {
      const lockBatch = db.batch();
      let lockCount = 0;
      
      expiredLocks.forEach(doc => {
        lockBatch.delete(doc.ref);
        lockCount++;
      });
      
      await lockBatch.commit();
      console.log(`Cleaned up ${lockCount} expired account locks`);
    }
    
    return { cleaned: true, attemptCount: count, lockCount: expiredLocks.size };
  } catch (error) {
    console.error('Error cleaning up old attempts:', error);
    return { cleaned: false, error: error.message };
  }
};

module.exports = {
  recordLoginAttempt,
  isAccountLocked,
  isIpLimited,
  lockoutMiddleware,
  ipRateLimiter,
  cleanupOldAttempts,
  MAX_LOGIN_ATTEMPTS,
  LOCKOUT_DURATION_MS,
  ATTEMPT_WINDOW_MS
};
