// Use SendGrid for email sending
const sgMail = require('@sendgrid/mail');
const crypto = require('crypto');
require('dotenv').config();

// Create a plain JavaScript object instead of a class to avoid any potential issues
const emailService = {
  // Initialize properties
  emailServiceReady: false,
  
  // Initialize SendGrid
  initializeSendGrid: function() {
    try {
      // Set SendGrid API key from environment
      const apiKey = process.env.SENDGRID_API_KEY;
      if (!apiKey) {
        throw new Error('SENDGRID_API_KEY is not configured');
      }
      sgMail.setApiKey(apiKey);
      console.log('SendGrid initialized successfully');
      this.emailServiceReady = true;
    } catch (error) {
      console.error('Failed to initialize SendGrid:', error);
      this.emailServiceReady = false;
    }
  },

  // Generate outlook email from ID number
  generateOutlookEmail: function(idNumber) {
    if (!idNumber) return null;
    
    // Clean the ID number by removing any prefixes like 'A-' and hyphens
    const cleanIdNumber = idNumber.replace(/^[A-Z]-/, '').replace(/-/g, '');
    return `${cleanIdNumber}@ms.bulsu.edu.ph`;
  },
  
  // Generate verification token
  generateToken: function() {
    // Generate a secure token for email verification
    return crypto.randomBytes(32).toString('hex');
  },

  // Send verification email
  sendVerificationEmail: async function(userId, userEmail, userName, idNumber) {
    // Generate clean outlook email
    const outlookEmail = this.generateOutlookEmail(idNumber);
    if (!outlookEmail) {
      return {
        success: false,
        error: 'Invalid ID number'
      };
    }
    
    // Generate verification token
    const token = this.generateToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // Token valid for 24 hours
    
    // Create verification URL - use localhost for development and production URL for production
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://bulsuspace.web.app' 
      : 'http://localhost:3000';
    const verificationUrl = `${baseUrl}/verify-email-token?token=${token}&userId=${userId}`;
    
    // Create mock response for development
    const mockResponse = {
      success: true,
      outlookEmail: outlookEmail,
      messageId: 'mock-message-id',
      token: token,
      expiresAt: expiresAt,
      mockEmail: true,
      message: 'Email not actually sent - using mock implementation for development.'
    };
    
    try {
      // Always use mock implementation for academic/development purposes
      // to avoid SendGrid verification issues
      console.log('Using mock implementation for email verification');
      console.log(`[MOCK] Would send verification email to: ${outlookEmail}`);
      
      return mockResponse;
      
      /* Uncomment this section when ready for production use with verified SendGrid sender
      
      // Check if email service is ready
      if (!this.emailServiceReady) {
        console.log('Email service not ready, using mock implementation');
        return mockResponse;
      }
      
      // Send email using SendGrid
      const msg = {
        to: outlookEmail,
        from: process.env.EMAIL_FROM || 'noreply@bulsuspace.web.app', // Use verified sender in SendGrid
        subject: 'Verify your BulSU Space Email',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px; background-color: #f9f9f9;">
            <div style="text-align: center; margin-bottom: 20px;">
              <h2 style="color: #3c8f3c;">BulSU Space Email Verification</h2>
            </div>
            
            <p>Hello ${userName},</p>
            
            <p>Welcome to BulSU Space! To complete your account setup, please verify your email address by clicking the button below:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}" style="background-color: #3c8f3c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Verify Email Address</a>
            </div>
            
            <p>This verification link will expire in 24 hours.</p>
            
            <p>If you did not create an account on BulSU Space, please ignore this email.</p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #666;">
              <p>This is an automated email from BulSU Space. Please do not reply to this message.</p>
            </div>
          </div>
        `
      };

      try {
        const result = await sgMail.send(msg);
        console.log('Verification email sent:', result[0].statusCode);
        
        // Return success with the generated outlook email
        return {
          success: true,
          outlookEmail: outlookEmail,
          messageId: result[0].headers['x-message-id'] || 'sent',
          token: token,
          expiresAt: expiresAt
        };
      } catch (sendError) {
        console.error('SendGrid error, falling back to mock implementation:', sendError);
        return mockResponse;
      }
      */
    } catch (error) {
      console.error('Error sending verification email:', error);
      return {
        success: false,
        error: error && error.message ? error.message : 'Failed to send verification email',
        details: error
      };
    }
  },

  // Verify email token
  verifyEmailToken: async function(token, userId, db = null) {
    try {
      // If we have a database connection, validate against stored token
      if (db) {
        // Get the verification record
        const verificationDoc = await db.collection('email_verifications').doc(userId).get();
        
        if (!verificationDoc.exists) {
          return {
            success: false,
            error: 'Verification not found'
          };
        }
        
        const verificationData = verificationDoc.data();
        
        // Check if token matches
        if (verificationData.token !== token) {
          return {
            success: false,
            error: 'Invalid verification token'
          };
        }
        
        // Check if token is expired
        const expiresAt = verificationData.expiresAt.toDate();
        if (expiresAt < new Date()) {
          return {
            success: false,
            error: 'Verification token has expired'
          };
        }
        
        // Mark as verified
        await db.collection('email_verifications').doc(userId).update({
          verified: true,
          verifiedAt: new Date()
        });
        
        // Update user record
        await db.collection('users').doc(userId).update({
          emailVerified: true
        });
        
        return {
          success: true,
          outlookEmail: verificationData.outlookEmail
        };
      }
      
      // If no database, return success (for testing purposes)
      return { 
        success: true, 
        outlookEmail: 'verified@ms.bulsu.edu.ph',
        note: 'No database connection available, verification simulated'
      };
    } catch (error) {
      console.error('Error verifying token:', error);      
      return {
        success: false,
        error: error.message || 'Error verifying token'
      };
    }
  }
};

// Initialize SendGrid on module load
emailService.initializeSendGrid();

// Export the service object directly
module.exports = emailService;
