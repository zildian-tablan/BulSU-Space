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
      console.log('Firebase services initialized in posts routes');
    }
  } catch (error) {
    console.log('Firebase not available in posts routes:', error.message);
  }
};

// Try to initialize Firebase services
try {
  initializeFirebaseServices();
} catch (error) {
  console.log('Firebase not available in posts routes');
}

// Middleware to verify Firebase ID token
const verifyToken = async (req, res, next) => {
  // If Firebase is not available, skip token verification for testing
  if (!db || admin.apps.length === 0) {
    req.user = { uid: 'test-user-123' }; // Mock user for testing
    return next();
  }

  const idToken = req.headers.authorization?.split('Bearer ')[1];
  
  if (!idToken) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Error verifying token:', error);
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Get all posts
router.get('/', async (req, res) => {
  try {
    if (!db) {
      return res.status(200).json([]);
    }

    const postsSnapshot = await db.collection('posts')
      .orderBy('created_at', 'desc')
      .get();
    
    const posts = [];
    
    for (const doc of postsSnapshot.docs) {
      const postData = doc.data();
      const userDoc = await db.collection('users').doc(postData.user_id).get();
      const userData = userDoc.exists ? userDoc.data() : null;
      
      posts.push({
        id: doc.id,
        ...postData,
        user_name: userData?.name || 'Unknown User',
        user_role: userData?.role || 'unknown',
        user_profile_pic: userData?.profile_pic || ''
      });
    }
    
    return res.status(200).json(posts);
  } catch (error) {
    console.error('Error fetching posts:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Get post by ID
router.get('/:id', async (req, res) => {
  try {
    if (!db) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const postDoc = await db.collection('posts').doc(req.params.id).get();
    
    if (!postDoc.exists) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    const postData = postDoc.data();
    const userDoc = await db.collection('users').doc(postData.user_id).get();
    const userData = userDoc.exists ? userDoc.data() : null;
    
    const post = {
      id: postDoc.id,
      ...postData,
      user_name: userData?.name || 'Unknown User',
      user_role: userData?.role || 'unknown',
      user_profile_pic: userData?.profile_pic || ''
    };
    
    return res.status(200).json(post);
  } catch (error) {
    console.error('Error fetching post:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Create new post
router.post('/', verifyToken, async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const { content, type, attachments } = req.body;
    
    const newPost = {
      user_id: req.user.uid,
      content,
      type,
      attachments,
      likes: 0,
      comments: [],
      shares: 0,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    };
    
    const postRef = await db.collection('posts').add(newPost);
    
    return res.status(201).json({
      id: postRef.id,
      ...newPost,
      created_at: new Date().toISOString() // Convert timestamp to ISO string for response
    });
  } catch (error) {
    console.error('Error creating post:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Update post
router.put('/:id', verifyToken, async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const postRef = db.collection('posts').doc(req.params.id);
    const postDoc = await postRef.get();
    
    if (!postDoc.exists) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    const postData = postDoc.data();
    
    // Check if user is the owner of the post
    if (postData.user_id !== req.user.uid) {
      return res.status(403).json({ error: 'Not authorized to update this post' });
    }
    
    const { content, type, attachments } = req.body;
    
    await postRef.update({
      content,
      type,
      attachments,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return res.status(200).json({ message: 'Post updated successfully' });
  } catch (error) {
    console.error('Error updating post:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Delete post
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const postRef = db.collection('posts').doc(req.params.id);
    const postDoc = await postRef.get();
    
    if (!postDoc.exists) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    const postData = postDoc.data();
    
    // Check if user is the owner of the post
    if (postData.user_id !== req.user.uid) {
      return res.status(403).json({ error: 'Not authorized to delete this post' });
    }
    
    await postRef.delete();
    
    return res.status(200).json({ message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Error deleting post:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Like a post
router.post('/:id/like', verifyToken, async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const postRef = db.collection('posts').doc(req.params.id);
    const postDoc = await postRef.get();
    
    if (!postDoc.exists) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    // Add user to likes collection for this post
    const likeRef = postRef.collection('likes').doc(req.user.uid);
    const likeDoc = await likeRef.get();
    
    if (likeDoc.exists) {
      // User already liked the post, remove the like
      await likeRef.delete();
      await postRef.update({
        likes: admin.firestore.FieldValue.increment(-1)
      });
      return res.status(200).json({ message: 'Post unliked successfully' });
    } else {
      // User hasn't liked the post yet, add the like
      await likeRef.set({
        user_id: req.user.uid,
        created_at: admin.firestore.FieldValue.serverTimestamp()
      });
      await postRef.update({
        likes: admin.firestore.FieldValue.increment(1)
      });
      // --- NOTIFICATION LOGIC: Notify post owner if reactor is not the owner ---
      const postOwnerId = postDoc.data().user_id || postDoc.data().userId;
      if (postOwnerId && postOwnerId !== req.user.uid) {
        // Get reactor name
        let reactorName = 'Someone';
        const userDoc = await db.collection('users').doc(req.user.uid).get();
        if (userDoc.exists && userDoc.data().name) reactorName = userDoc.data().name;
        // Add notification to notifications collection
        await db.collection('notifications').add({
          userId: postOwnerId,
          type: 'reaction',
          message: `${reactorName} reacted to your post`,
          relatedId: req.params.id,
          extra: { reactorId: req.user.uid, reactorName },
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          read: false
        });
      }
      return res.status(200).json({ message: 'Post liked successfully' });
    }
  } catch (error) {
    console.error('Error liking post:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Add comment to a post
router.post('/:id/comments', verifyToken, async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const { content } = req.body;
    const postRef = db.collection('posts').doc(req.params.id);
    const postDoc = await postRef.get();
    
    if (!postDoc.exists) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    // Get user data
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    const userData = userDoc.data();
    
    // Add comment to comments collection for this post
    const commentRef = await postRef.collection('comments').add({
      user_id: req.user.uid,
      content,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Update comment count on post
    await postRef.update({
      comments: admin.firestore.FieldValue.increment(1)
    });

    // --- NOTIFICATION LOGIC: Notify post owner if commenter is not the owner ---
    const postOwnerId = postDoc.data().user_id || postDoc.data().userId;
    if (postOwnerId && postOwnerId !== req.user.uid) {
      // Get commenter name
      let commenterName = 'Someone';
      if (userData && userData.name) commenterName = userData.name;
      // Add notification to notifications collection
      await db.collection('notifications').add({
        userId: postOwnerId,
        type: 'comment',
        message: `${commenterName} commented on your post`,
        relatedId: req.params.id,
        extra: { commenterId: req.user.uid, commenterName },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        read: false
      });
    }
    
    return res.status(201).json({
      id: commentRef.id,
      user_id: req.user.uid,
      user_name: userData.name,
      user_profile_pic: userData.profile_pic,
      content,
      created_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Get comments for a post
router.get('/:id/comments', async (req, res) => {
  try {
    if (!db) {
      return res.status(200).json([]);
    }

    const postRef = db.collection('posts').doc(req.params.id);
    const postDoc = await postRef.get();
    
    if (!postDoc.exists) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    const commentsSnapshot = await postRef.collection('comments')
      .orderBy('created_at', 'asc')
      .get();
    
    const comments = [];
    
    for (const doc of commentsSnapshot.docs) {
      const commentData = doc.data();
      const userDoc = await db.collection('users').doc(commentData.user_id).get();
      const userData = userDoc.exists ? userDoc.data() : null;
      
      comments.push({
        id: doc.id,
        ...commentData,
        user_name: userData?.name || 'Unknown User',
        user_profile_pic: userData?.profile_pic || '',
        created_at: commentData.created_at.toDate().toISOString()
      });
    }
    
    return res.status(200).json(comments);
  } catch (error) {
    console.error('Error fetching comments:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
