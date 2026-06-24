const express = require('express');
const admin = require('firebase-admin');
const emailService = require('../services/emailService.new');
console.log('Email routes initialized. EmailService methods available:', Object.keys(emailService));
console.log('sendVerificationEmail type:', typeof emailService.sendVerificationEmail);

const router = express.Router();

// In-memory storage for when Firebase is not available (for testing)
const memoryStorage = {
  verifications: new Map(),
  users: new Map()
};

/**
 * Send verification email
 * POST /api/email/send-verification
 */
router.post('/send-verification', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    let userData;
    let existingVerification;

    // Check if Firebase is available
    if (req.firebaseInitialized && req.db) {
      // Get user data from Firestore
      const userDoc = await req.db.collection('users').doc(userId).get();

      if (!userDoc.exists) {
        return res.status(400).json({
          success: false,
          error: 'User not found in database'
        });
      }

      userData = userDoc.data();

      // Check for existing verification
      const existingDoc = await req.db.collection('email_verifications').doc(userId).get();
      existingVerification = existingDoc.exists ? existingDoc.data() : null;
    } else {
      // Use mock data for testing when Firebase is not available
      console.log('Firebase not available, using mock data for testing');
      userData = memoryStorage.users.get(userId) || {
        email: 'test@example.com',
        name: 'Test User',
        idNumber: '20222600218' // Mock student ID
      };

      // Store mock user if not exists
      if (!memoryStorage.users.has(userId)) {
        memoryStorage.users.set(userId, userData);
      }

      existingVerification = memoryStorage.verifications.get(userId);
    }

    const { email, name, idNumber } = userData;    if (!idNumber) {
      return res.status(400).json({
        success: false,
        error: 'User ID number not found'
      });
    }

    // Check rate limiting for existing verifications
    if (existingVerification) {
      let timeSinceLastRequest;
      
      if (req.firebaseInitialized && req.db) {
        // Firebase document
        const data = existingVerification.data();
        timeSinceLastRequest = Date.now() - data.createdAt.toMillis();
      } else {
        // Memory storage
        timeSinceLastRequest = Date.now() - existingVerification.createdAt;
      }
      
      // Allow new verification email only after 1 minute
      if (timeSinceLastRequest < 60000) {
        return res.status(429).json({
          success: false,
          error: 'Please wait before requesting another verification email',
          remainingTime: Math.ceil((60000 - timeSinceLastRequest) / 1000)
        });
      }
    }    // Send verification email
    const result = await emailService.sendVerificationEmail(userId, email, name, idNumber);

    // If email was sent successfully, store verification data
    if (result.success) {
      const verificationData = {
        userId,
        outlookEmail: result.outlookEmail,
        token: result.token,
        verified: false,
        createdAt: new Date(),
        expiresAt: result.expiresAt
      };

      // Store in Firebase if available
      if (req.firebaseInitialized && req.db) {
        try {
          // Convert JS Date to Firestore Timestamp
          const firestoreData = {
            ...verificationData,
            createdAt: admin.firestore.Timestamp.fromDate(verificationData.createdAt),
            expiresAt: admin.firestore.Timestamp.fromDate(verificationData.expiresAt)
          };
          
          await req.db.collection('email_verifications').doc(userId).set(firestoreData);
          console.log(`Verification data stored in Firebase for user ${userId}`);
        } catch (dbError) {
          console.error('Error storing verification data in Firebase:', dbError);
          // Continue even if database operation fails
        }
      } else {
        // Store in memory for testing/development
        memoryStorage.verifications.set(userId, verificationData);
        console.log(`Verification data stored in memory for user ${userId}`);
      }
    }

    // Remove token from response for security
    const clientResponse = { ...result };
    delete clientResponse.token;
    
    res.json(clientResponse);

  } catch (error) {
    console.error('Error in send-verification endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send verification email'
    });
  }
});

/**
 * Verify email with token
 * POST /api/email/verify-token
 */
router.post('/verify-token', async (req, res) => {
  try {
    const { token, userId } = req.body;

    if (!token || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Token and user ID are required'
      });
    }

    // Pass database reference if Firebase is initialized
    const result = await emailService.verifyEmailToken(token, userId, req.firebaseInitialized ? req.db : null);
    
    if (result.success) {
      // If Firebase is initialized, update verification in database
      if (req.firebaseInitialized && req.db) {
        try {
          // Update the user record
          await req.db.collection('users').doc(userId).update({
            emailVerified: true
          });
          
          console.log(`User ${userId} verified successfully in database`);
        } catch (dbError) {
          console.error('Error updating verification status in database:', dbError);
          // Continue with response even if database update fails
        }
      } else {
        // Store in memory for testing/development
        const verification = memoryStorage.verifications.get(userId);
        if (verification) {
          verification.verified = true;
          verification.verifiedAt = new Date().toISOString();
          memoryStorage.verifications.set(userId, verification);
        }
        
        // Update mock user
        const user = memoryStorage.users.get(userId);
        if (user) {
          user.emailVerified = true;
          memoryStorage.users.set(userId, user);
        }
        
        console.log(`User ${userId} verified successfully in memory storage`);
      }
      
      res.json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error) {
    console.error('Error in verify-token endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Verification failed'
    });
  }
});

/**
 * Get verification status
 * GET /api/email/verification-status/:userId
 */
router.get('/verification-status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    let userData;
    let verificationData = null;
    let isVerified = false;

    // Check if Firebase is available
    if (req.firebaseInitialized && req.db) {
      // Check user's email verification status
      const userDoc = await req.db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      userData = userDoc.data();
      isVerified = userData.emailVerified || false;

      // Get verification record if exists
      const verificationDoc = await req.db.collection('email_verifications').doc(userId).get();
      
      if (verificationDoc.exists) {
        const data = verificationDoc.data();
        verificationData = {
          outlookEmail: data.outlookEmail,
          verified: data.verified,
          createdAt: data.createdAt.toDate(),
          expiresAt: data.expiresAt.toDate()
        };
      }
    } else {
      // Use mock data for testing when Firebase is not available
      console.log('Firebase not available, using mock data for verification status');
      userData = memoryStorage.users.get(userId);
      
      if (!userData) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      const verification = memoryStorage.verifications.get(userId);
      if (verification) {
        verificationData = {
          outlookEmail: verification.outlookEmail,
          verified: verification.verified,
          createdAt: new Date(verification.createdAt),
          expiresAt: new Date(verification.expiresAt)
        };
        isVerified = verification.verified;
      }
    }

    res.json({
      success: true,
      isVerified,
      verification: verificationData
    });

  } catch (error) {
    console.error('Error in verification-status endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get verification status'
    });
  }
});

/**
 * Generate Outlook email preview
 * GET /api/email/outlook-preview/:userId
 */
router.get('/outlook-preview/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    let userData;

    // Check if Firebase is available
    if (req.firebaseInitialized && req.db) {
      const userDoc = await req.db.collection('users').doc(userId).get();

      if (!userDoc.exists) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      userData = userDoc.data();
    } else {
      // Use mock data for testing when Firebase is not available
      console.log('Firebase not available, using mock data for outlook preview');
      userData = memoryStorage.users.get(userId);
      
      if (!userData) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
    }    const { idNumber } = userData;

    if (!idNumber) {
      return res.status(400).json({
        success: false,
        error: 'User ID number not found'
      });
    }

    // Create fallback function if emailService.generateOutlookEmail is not available
    let outlookEmail;
    if (typeof emailService.generateOutlookEmail === 'function') {
      outlookEmail = emailService.generateOutlookEmail(idNumber);
    } else {
      // Fallback implementation
      const cleanIdNumber = idNumber.replace(/^[A-Z]-/, '').replace(/-/g, '');
      outlookEmail = `${cleanIdNumber}@ms.bulsu.edu.ph`;
    }

    res.json({
      success: true,
      outlookEmail
    });
  } catch (error) {
    console.error('Error in outlook-preview endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate Outlook email preview'
    });
  }
});

module.exports = router;
