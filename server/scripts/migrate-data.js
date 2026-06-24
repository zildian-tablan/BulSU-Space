const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

// Initialize Firebase Admin SDK
let firebaseInitialized = false;
try {
  // First try to use environment variables
  if (process.env.FIREBASE_PROJECT_ID && 
      process.env.FIREBASE_CLIENT_EMAIL && 
      process.env.FIREBASE_PRIVATE_KEY) {
    
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      })
    });
    console.log('Firebase Admin initialized with environment variables');
    firebaseInitialized = true;
  } 
  // Fallback to service account file if available (not recommended)
  else if (fs.existsSync(path.join(__dirname, '../serviceAccountKey.json'))) {
    console.warn('WARNING: Using serviceAccountKey.json file directly is not recommended!');
    console.warn('Please set up environment variables for better security.');
    const serviceAccount = require('../serviceAccountKey.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    firebaseInitialized = true;
  } else {
    throw new Error('Firebase credentials not available. Set up your .env file first.');
  }
} catch (error) {
  console.error('Error initializing Firebase Admin:', error);
  process.exit(1);
}

const db = admin.firestore();

// Path to the JSON data file
const dataFilePath = path.join(__dirname, '../../src/data/database.json');

// Function to migrate data
async function migrateData() {
  try {
    // Read the JSON file
    const rawData = fs.readFileSync(dataFilePath);
    const data = JSON.parse(rawData);
    
    console.log('Starting data migration...');
    
    // Migrate users
    console.log(`Migrating ${data.users.length} users...`);
    const usersBatch = db.batch();
    
    for (const user of data.users) {
      // Create a Firebase Auth user first (in a real scenario)
      // For migration purposes, we'll just create Firestore documents
      const userRef = db.collection('users').doc(`user_${user.id}`);
      usersBatch.set(userRef, {
        name: user.name,
        email: `user${user.id}@bulsu.edu.ph`, // Placeholder email
        role: user.role,
        idNumber: `${user.role === 'student' ? 'S' : user.role === 'faculty' ? 'F' : 'A'}-${100000 + user.id}`,
        profile_pic: user.profile_pic,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    
    await usersBatch.commit();
    console.log('Users migration completed!');
    
    // Migrate posts
    console.log(`Migrating ${data.posts.length} posts...`);
    
    // Process posts in smaller batches to avoid Firestore limits
    const batchSize = 500;
    for (let i = 0; i < data.posts.length; i += batchSize) {
      const postsBatch = db.batch();
      const batch = data.posts.slice(i, i + batchSize);
      
      for (const post of batch) {
        const postRef = db.collection('posts').doc(`post_${post.id}`);
        
        // Convert created_at string to Firestore timestamp
        let createdAt;
        try {
          createdAt = admin.firestore.Timestamp.fromDate(new Date(post.created_at));
        } catch (error) {
          createdAt = admin.firestore.FieldValue.serverTimestamp();
        }
        
        postsBatch.set(postRef, {
          user_id: `user_${post.user_id}`,
          content: post.content,
          type: post.type || 'post',
          attachments: post.attachments || {},
          likes: post.likes || 0,
          comments: post.comments || 0,
          shares: post.shares || 0,
          created_at: createdAt,
          updated_at: admin.firestore.FieldValue.serverTimestamp()
        });
      }
      
      await postsBatch.commit();
      console.log(`Migrated posts batch ${i / batchSize + 1}`);
    }
    
    console.log('Posts migration completed!');
    console.log('Data migration successful!');
    
  } catch (error) {
    console.error('Error during migration:', error);
  } finally {
    // Exit the process
    process.exit();
  }
}

// Run the migration
migrateData();
