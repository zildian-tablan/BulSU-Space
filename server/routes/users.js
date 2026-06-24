const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

// Get Firestore instance (only if Firebase is initialized)
let db = null;

// Initialize Firebase services if available
const initializeFirebaseServices = () => {
  try {
    if (admin.apps.length > 0) {
      db = admin.firestore();
      console.log('Firebase services initialized in users routes');
    }
  } catch (error) {
    console.log('Firebase not available in users routes:', error.message);
  }
};

// Try to initialize Firebase services
try {
  initializeFirebaseServices();
} catch (error) {
  console.log('Firebase not available in users routes');
}

// Middleware to verify Firebase ID token and enrich with role (fallback to Firestore doc)
const verifyToken = async (req, res, next) => {
  // If Firebase is not available, skip token verification for testing (non-production only!)
  if (!db || admin.apps.length === 0) {
    req.user = { uid: 'test-user-123', role: 'admin' }; // Mock user w/ admin role for local tests
    return next();
  }

  const idToken = req.headers.authorization?.split('Bearer ')[1];
  if (!idToken) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    // Prefer role/customClaims if already present
    let role = decodedToken.role || decodedToken.customClaims?.role;
    // If missing, attempt to read Firestore user document to fetch role
    if (!role) {
      try {
        const userDoc = await db.collection('users').doc(decodedToken.uid).get();
        if (userDoc.exists) {
          const data = userDoc.data();
            if (data && typeof data.role === 'string') {
              role = data.role;
            }
        }
      } catch (docErr) {
        console.warn('verifyToken: failed to fetch user doc for role enrichment', docErr.message);
      }
    }
    req.user = { ...decodedToken, role };
    return next();
  } catch (error) {
    console.error('Error verifying token:', error);
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Helper: check admin privileges
const requireAdmin = (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
    const role = req.user.role || req.user.customClaims?.role; // custom claims may store role
    if (role === 'admin' || role === 'super admin' || role === 'super_admin') return next();
    return res.status(403).json({ error: 'Admin privileges required' });
  } catch (e) {
    return res.status(500).json({ error: 'Privilege check failed' });
  }
};

// Get all users
router.get('/', verifyToken, async (req, res) => {
  try {
    const usersSnapshot = await db.collection('users').get();
    const users = [];
    
    usersSnapshot.forEach(doc => {
      // Exclude sensitive information like password
      const userData = doc.data();
      users.push({
        id: doc.id,
        name: userData.name,
        email: userData.email,
        role: userData.role,
        idNumber: userData.idNumber,
        profile_pic: userData.profile_pic
      });
    });
    
    return res.status(200).json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Get user by ID
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const userDoc = await db.collection('users').doc(req.params.id).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userData = userDoc.data();
    // Exclude sensitive information
    const user = {
      id: userDoc.id,
      name: userData.name,
      email: userData.email,
      role: userData.role,
      idNumber: userData.idNumber,
      profile_pic: userData.profile_pic
    };
    
    return res.status(200).json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Permanently delete a user (Firestore doc + Auth record + ALL user posts)
router.delete('/:id', verifyToken, requireAdmin, async (req, res) => {
  if (!db || admin.apps.length === 0) {
    return res.status(503).json({ error: 'Firebase not initialized on server' });
  }
  const targetUid = req.params.id;
  if (!targetUid) return res.status(400).json({ error: 'Missing user id' });

  // Prevent self-deletion to avoid locking yourself out accidentally
  if (targetUid === req.user.uid) {
    return res.status(400).json({ error: 'You cannot delete your own account.' });
  }
  try {
    // Step 1: Delete all user posts to prevent orphaned posts
    console.log('[USER DELETION] Step 1: Deleting all posts for user:', targetUid);
    try {
      const postsSnapshot = await db.collection('posts').where('userId', '==', targetUid).get();
      const spacePostsSnapshot = await db.collection('spacePosts').where('userId', '==', targetUid).get();
      
      const deletionPromises = [];
      postsSnapshot.forEach(doc => deletionPromises.push(doc.ref.delete()));
      spacePostsSnapshot.forEach(doc => deletionPromises.push(doc.ref.delete()));
      
      await Promise.all(deletionPromises);
      console.log('[USER DELETION] Deleted', postsSnapshot.size + spacePostsSnapshot.size, 'posts');
    } catch (postsErr) {
      console.error('Error deleting user posts (continuing):', postsErr);
      // Continue with user deletion even if post deletion fails
    }

    // Step 2: Delete Firestore user document
    console.log('[USER DELETION] Step 2: Deleting user document');
    await db.collection('users').doc(targetUid).delete();

    // Step 3: Attempt to delete Auth user
    console.log('[USER DELETION] Step 3: Deleting auth user');
    try {
      await admin.auth().deleteUser(targetUid);
    } catch (authErr) {
      console.error('Error deleting auth user (continuing):', authErr);
      // If the auth user is already gone, continue
      if (!authErr.code || !authErr.code.includes('not-found')) {
        return res.status(500).json({ error: 'Failed deleting auth record', details: authErr.message });
      }
    }

    return res.status(200).json({ status: 'deleted', userId: targetUid });
  } catch (error) {
    console.error('Error deleting user:', error);
    return res.status(500).json({ error: 'Server error deleting user' });
  }
});

module.exports = router;
