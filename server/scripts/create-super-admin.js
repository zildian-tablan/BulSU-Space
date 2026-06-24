const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../.env') });
console.log('Environment loaded from:', path.join(__dirname, '../.env'));

// Initialize Firebase Admin SDK
try {
  console.log('Initializing Firebase Admin with environment variables...');
  
  // Log project ID to verify environment is loaded (without exposing sensitive data)
  console.log('Using project ID:', process.env.FIREBASE_PROJECT_ID || '(not set)');
  
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    throw new Error('Missing required environment variables for Firebase initialization');
  }
  
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    })
  });
  console.log('Firebase Admin initialized successfully with environment variables');
} catch (error) {
  console.error('Error initializing Firebase Admin:', error);
  process.exit(1);
}

const auth = admin.auth();
const db = admin.firestore();

// Super Admin details
const superAdminEmail = 'sa-bs-001@bulsuspace.edu.ph';
const superAdminPassword = '@BS2025';
const superAdminName = 'Super Administrator';
const superAdminIdNumber = 'SA-BS-001';
const superAdminRole = 'admin'; // Using admin role as defined in UserRole type

// Create Super Admin user
async function createSuperAdmin() {
  try {
    console.log('Creating Super Admin user...');
    
    // Check if user already exists
    try {
      const userRecord = await auth.getUserByEmail(superAdminEmail);
      console.log('Super Admin user already exists:', userRecord.uid);
      
      // Update the user's Firestore document to ensure role is set correctly
      await db.collection('users').doc(userRecord.uid).set({
        email: superAdminEmail,
        name: superAdminName,
        idNumber: superAdminIdNumber,
        role: superAdminRole,
        profile_pic: `https://ui-avatars.com/api/?name=${encodeURIComponent(superAdminName)}&background=0D8ABC&color=fff`,
        isNewUser: false, // Admins don't need to see terms modal
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      
      console.log('Super Admin user document updated');
      return;
    } catch (error) {
      // If user doesn't exist, continue with creation
      if (error.code !== 'auth/user-not-found') {
        console.error('Error checking if user exists:', error);
        throw error;
      }
    }
    
    // Create user in Firebase Auth
    const userRecord = await auth.createUser({
      email: superAdminEmail,
      password: superAdminPassword,
      displayName: superAdminName
    });
    
    console.log('Super Admin user created successfully:', userRecord.uid);
    
    // Create user document in Firestore
    const profile_pic = `https://ui-avatars.com/api/?name=${encodeURIComponent(superAdminName)}&background=0D8ABC&color=fff`;
    
    await db.collection('users').doc(userRecord.uid).set({
      email: superAdminEmail,
      name: superAdminName,
      idNumber: superAdminIdNumber,
      role: superAdminRole,
      profile_pic,
      isNewUser: false, // Admins don't need to see terms modal
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log('Super Admin document created in Firestore');
    console.log('Super Admin creation completed successfully!');
    
  } catch (error) {
    console.error('Error creating Super Admin:', error);
  } finally {
    // Exit the script
    process.exit(0);
  }
}

// Run the function
createSuperAdmin();
