/**
 * Faculty requests server-side routes
 * For secure operations that can't be handled by Firestore rules
 */

const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

// Middleware to verify admin role
const isAdmin = async (req, res, next) => {
  try {
    const idToken = req.headers.authorization?.split('Bearer ')[1];
    if (!idToken) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const userDoc = await admin.firestore().collection('users').doc(decodedToken.uid).get();
    
    if (!userDoc.exists) {
      return res.status(401).json({ error: 'Unauthorized: User not found' });
    }
    
    const userData = userDoc.data();
    if (userData.role !== 'admin' && userData.role !== 'super admin') {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }
    
    req.user = {
      uid: decodedToken.uid,
      role: userData.role
    };
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

// Update faculty request status
router.post('/update-status/:requestId', isAdmin, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status } = req.body;
    
    if (!status || (status !== 'approved' && status !== 'rejected')) {
      return res.status(400).json({ error: 'Invalid status. Must be "approved" or "rejected".' });
    }
    
    const requestRef = admin.firestore().collection('faculty_access_requests').doc(requestId);
    const requestDoc = await requestRef.get();
    
    if (!requestDoc.exists) {
      return res.status(404).json({ error: 'Faculty request not found' });
    }
    
    // Update the request status
    await requestRef.update({
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: req.user.uid,
      actionTimestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // If approved, create the faculty account
    if (status === 'approved') {
      const requestData = requestDoc.data();
      
      try {
        // Generate email and password
        const email = `${requestData.idNumber.toLowerCase()}@bulsuspace.com`;
        const lastName = requestData.lastName || '';
        const lastNamePrefix = lastName.substring(0, 3).toLowerCase();
        const password = `${requestData.idNumber.toLowerCase()}${lastNamePrefix}`;
        
        // Create the user account
        const userRecord = await admin.auth().createUser({
          email,
          password,
          displayName: `${requestData.firstName} ${requestData.lastName}`
        });
        
        // Create user profile in Firestore
        await admin.firestore().collection('users').doc(userRecord.uid).set({
          email,
          name: `${requestData.firstName} ${requestData.lastName}`,
          idNumber: requestData.idNumber,
          department: requestData.department,
          role: 'faculty',
          profile_pic: `https://ui-avatars.com/api/?name=${encodeURIComponent(requestData.firstName + ' ' + requestData.lastName)}&background=E07A5F&color=fff`,
          isNewUser: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          phoneNumber: requestData.phoneNumber || '',
          approvedBy: req.user.uid,
          approvedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Create device document
        await admin.firestore().collection('device').doc(userRecord.uid).set({
          user: userRecord.uid,
          device_id: null
        });
        
        // Update request with the created user ID
        await requestRef.update({
          userId: userRecord.uid,
          accountCreated: true,
          accountCreatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        console.log(`Faculty account created for ${requestData.firstName} ${requestData.lastName} (${email})`);
        
        return res.status(200).json({ 
          message: 'Faculty request approved and account created successfully',
          userId: userRecord.uid
        });
      } catch (error) {
        console.error('Error creating faculty account:', error);
        return res.status(500).json({ 
          error: 'Faculty request approved but account creation failed',
          details: error.message
        });
      }
    }
    
    res.status(200).json({ message: `Faculty request ${status} successfully` });
  } catch (error) {
    console.error('Error updating faculty request:', error);
    res.status(500).json({ error: 'Failed to update faculty request' });
  }
});

// Get all faculty requests
router.get('/', isAdmin, async (req, res) => {
  try {
    const requestsSnapshot = await admin.firestore()
      .collection('faculty_access_requests')
      .orderBy('createdAt', 'desc')
      .get();
    
    const requests = [];
    requestsSnapshot.forEach(doc => {
      requests.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    res.status(200).json(requests);
  } catch (error) {
    console.error('Error fetching faculty requests:', error);
    res.status(500).json({ error: 'Failed to fetch faculty requests' });
  }
});

module.exports = router;
