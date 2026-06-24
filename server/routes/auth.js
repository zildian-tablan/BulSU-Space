const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
// Import the auth security service
const authSecurity = require('../services/authSecurity');

// Get Firebase Auth and Firestore instances (only if Firebase is initialized)
let auth = null;
let db = null;

// Initialize Firebase services if available
const initializeFirebaseServices = () => {
  try {
    if (admin.apps.length > 0) {
      auth = admin.auth();
      db = admin.firestore();
      console.log('Firebase services initialized in auth routes');
    }
  } catch (error) {
    console.log('Firebase not available in auth routes:', error.message);
  }
};

// Try to initialize Firebase services
initializeFirebaseServices();

// Middleware to verify Firebase ID token
const verifyToken = async (req, res, next) => {
  if (!auth) {
    // If Firebase is not available, skip authentication for testing
    console.log('Firebase not available, skipping token verification');
    req.user = { uid: 'test-user-id', email: 'test@example.com' };
    return next();
  }

  const idToken = req.headers.authorization?.split('Bearer ')[1];
  
  if (!idToken) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Error verifying token:', error);
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Get current user profile
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const userRef = db.collection('users').doc(req.user.uid);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    return res.status(200).json(userDoc.data());
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Update user profile
router.put('/profile', verifyToken, async (req, res) => {
  try {
    const { name, idNumber, role, profile_pic } = req.body;
    const userRef = db.collection('users').doc(req.user.uid);
    
    await userRef.update({
      name,
      idNumber,
      role,
      profile_pic,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return res.status(200).json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Error updating user profile:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Register a new user
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, idNumber, role } = req.body;
    
    // Email validation removed - accepting any valid email format
    
    // Validate ID number format based on role - Updated student regex to accept format with or without hyphen
    const idRegexMap = {
      student: /^\d{4}-?\d{6}$/, // Accept both formats: 2022-600218 or 2022600218
      faculty: /^F-\d{6}$/,
      alumni: /^A-\d{6}$/,
      admin: /^A-\d{6}$/
    };
    
    if (!idRegexMap[role]?.test(idNumber)) {
      return res.status(400).json({ 
        error: `Invalid ID format for ${role}. Format should be ${role === 'student' ? 'XXXX-XXXXXX or XXXXXXXXXX' : role === 'faculty' ? 'F-XXXXXX' : 'A-XXXXXX'}` 
      });
    }
    
    // Create user in Firebase Auth
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: name
    });
    
    // Create user document in Firestore
    const profile_pic = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0D8ABC&color=fff`;
    
    await db.collection('users').doc(userRecord.uid).set({
      email,
      name,
      idNumber,
      role,
      profile_pic,
      isNewUser: true, // Set as new user to show terms modal
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error('Error registering user:', error);
    
    if (error.code === 'auth/email-already-exists') {
      return res.status(400).json({ error: 'Email already in use' });
    } else if (error.code === 'auth/invalid-email') {
      return res.status(400).json({ error: 'Invalid email format' });
    } else if (error.code === 'auth/weak-password') {
      return res.status(400).json({ error: 'Password is too weak' });
    }
    
    return res.status(500).json({ error: 'Server error' });
  }
});

// Pre-login check endpoint - Client should call this before attempting to login
router.post('/pre-login-check', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    // Check if account is locked
    const accountStatus = await authSecurity.isAccountLocked(email);
    if (accountStatus.locked) {
      return res.status(429).json({
        error: 'Account temporarily locked due to too many failed attempts',
        retryAfter: Math.ceil(accountStatus.remainingTime / 1000), // in seconds
        lockoutMinutes: Math.ceil(accountStatus.remainingTime / (60 * 1000)) // in minutes
      });
    }
    
    return res.status(200).json({ allowLogin: true });
  } catch (error) {
    console.error('Error during pre-login check:', error);
    // Fail open to prevent denial of service
    return res.status(200).json({ allowLogin: true });
  }
});

// Apply lockout middleware to login route
router.post('/login', authSecurity.lockoutMiddleware, authSecurity.ipRateLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const ip = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0]?.trim();
    const userAgent = req.headers['user-agent'] || 'Unknown';
    
    // Firebase Auth will handle the authentication
    // We don't need to validate the email format here as Firebase will handle that
    
    // For now, just return success as the client will handle the Firebase auth directly
    // The client should call the /auth/login-result endpoint after Firebase authentication
    
    return res.status(200).json({ message: 'Authentication handled by client' });
  } catch (error) {
    console.error('Error during login:', error);
    
    if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
      return res.status(401).json({ error: 'Invalid email or password' });
    } else if (error.code === 'auth/invalid-email') {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    return res.status(500).json({ error: 'Server error' });
  }
});

// Login result endpoint - Client should call this after Firebase authentication
router.post('/login-result', async (req, res) => {
  try {
    const { email, success } = req.body;
    const ip = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0]?.trim();
    const userAgent = req.headers['user-agent'] || 'Unknown';
    
    // Record the login attempt
    const recordResult = await authSecurity.recordLoginAttempt({
      email,
      success,
      ip,
      userAgent
    });
    
    // If login failed and account is now locked, inform the client
    if (!success && recordResult.status === 'locked') {
      return res.status(429).json({
        error: 'Account temporarily locked due to too many failed attempts',
        retryAfter: Math.ceil(recordResult.remainingTime / 1000), // in seconds
        lockoutMinutes: Math.ceil(recordResult.remainingTime / (60 * 1000)) // in minutes
      });
    }
    
    return res.status(200).json({ 
      status: recordResult.status,
      ...(recordResult.attemptCount && { attemptCount: recordResult.attemptCount }),
      ...(recordResult.attemptsRemaining && { attemptsRemaining: recordResult.attemptsRemaining })
    });
  } catch (error) {
    console.error('Error recording login result:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Check for suspicious activity patterns
 */
router.post('/check-suspicious-activity', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    // Get recent failed login attempts for this email
    if (!db) {
      return res.status(200).json({ suspicious: false });
    }
    
    const now = Date.now();
    const fiveMinutesAgo = now - (5 * 60 * 1000);
    
    const recentAttempts = await db.collection('login_attempts')
      .where('email', '==', email.toLowerCase())
      .where('timestamp', '>', fiveMinutesAgo)
      .where('success', '==', false)
      .get();
    
    // More than 3 failed attempts in 5 minutes is considered suspicious
    const suspicious = recentAttempts.size > 3;
    
    return res.status(200).json({ suspicious });
  } catch (error) {
    console.error('Error checking for suspicious activity:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Admin endpoints for security management
// These should only be accessible by admins or super admins
router.get('/security/locked-accounts', verifyToken, async (req, res) => {
  try {
    // Check if user is admin
    const userRef = db.collection('users').doc(req.user.uid);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists || (userDoc.data().role !== 'admin' && userDoc.data().role !== 'super admin')) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }
    
    // Get all currently locked accounts
    const locksSnapshot = await db.collection('account_locks').get();
    const now = Date.now();
    
    const lockedAccounts = [];
    locksSnapshot.forEach(doc => {
      const lockData = doc.data();
      const lockExpires = lockData.lockedUntil?.toMillis?.() || lockData.lockedUntil;
      
      if (now < lockExpires) {
        lockedAccounts.push({
          email: lockData.email,
          lockedUntil: lockExpires,
          remainingMinutes: Math.ceil((lockExpires - now) / (60 * 1000)),
          attemptCount: lockData.attemptCount || 0
        });
      }
    });
    
    return res.status(200).json({ lockedAccounts });
  } catch (error) {
    console.error('Error fetching locked accounts:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Unlock a specific account
router.post('/security/unlock-account', verifyToken, async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    // Check if user is admin
    const userRef = db.collection('users').doc(req.user.uid);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists || (userDoc.data().role !== 'admin' && userDoc.data().role !== 'super admin')) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }
    
    // Delete the lock
    await db.collection('account_locks').doc(email.toLowerCase()).delete();
    
    // Log the action
    await db.collection('admin_actions').add({
      action: 'unlock_account',
      email: email.toLowerCase(),
      adminId: req.user.uid,
      adminEmail: req.user.email,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return res.status(200).json({ 
      message: `Account ${email} has been unlocked`,
      unlocked: true
    });
  } catch (error) {
    console.error('Error unlocking account:', error);
    return res.status(500).json({ error: 'Server error', unlocked: false });
  }
});

// Run cleanup of old login attempts
router.post('/security/cleanup-attempts', verifyToken, async (req, res) => {
  try {
    // Check if user is admin
    const userRef = db.collection('users').doc(req.user.uid);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists || (userDoc.data().role !== 'admin' && userDoc.data().role !== 'super admin')) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }
    
    const { olderThanDays = 30 } = req.body;
    const olderThanMs = olderThanDays * 24 * 60 * 60 * 1000;
    
    const result = await authSecurity.cleanupOldAttempts(olderThanMs);
    
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error cleaning up login attempts:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
