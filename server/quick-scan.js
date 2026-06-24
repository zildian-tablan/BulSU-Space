// Quick presence data scan
const admin = require('firebase-admin');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables
dotenv.config();

async function quickScan() {
  // Initialize if not already done
  if (!admin.apps.length) {
    try {
      // First try using environment variables
      if (process.env.FIREBASE_PROJECT_ID && 
          process.env.FIREBASE_CLIENT_EMAIL && 
          process.env.FIREBASE_PRIVATE_KEY) {
        
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
          }),
          databaseURL: 'https://bulsuspace-default-rtdb.firebaseio.com'
        });
        console.log('✅ Firebase Admin initialized using environment variables');
      }
      // Fallback to service account file if available (not recommended)
      else if (fs.existsSync(path.join(__dirname, 'serviceAccountKey.json'))) {
        console.warn('⚠️ WARNING: Using serviceAccountKey.json file directly is not recommended!');
        console.warn('⚠️ Please set up environment variables for better security.');
        const serviceAccount = require('./serviceAccountKey.json');
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          databaseURL: 'https://bulsuspace-default-rtdb.firebaseio.com'
        });
        console.log('✅ Firebase Admin initialized using service account file');
      } else {
        throw new Error('Firebase credentials not available. Set up your .env file first.');
      }
    } catch (error) {
      console.error('❌ Init failed:', error.message);
      return;
    }
  }

  const db = admin.database();
  
  console.log('🔍 Quick Presence Scan');
  console.log('Current time:', new Date().toISOString());
  console.log('Current timestamp:', Date.now());
  console.log('Stale timestamp:', 1745249821945, '→', new Date(1745249821945).toISOString());
  
  try {
    // Check status path
    const statusRef = db.ref('status');
    const statusSnapshot = await statusRef.once('value');
    
    if (statusSnapshot.exists()) {
      const data = statusSnapshot.val();
      const userIds = Object.keys(data);
      console.log(`\n📊 Found ${userIds.length} users in status:`);
      
      let staleCount = 0;
      for (const userId of userIds) {
        const userData = data[userId];
        if (userData.lastActive === 1745249821945) {
          staleCount++;
          console.log(`🚨 STALE: ${userId} - lastActive: ${userData.lastActive}`);
        } else {
          console.log(`✅ OK: ${userId} - lastActive: ${userData.lastActive} (${new Date(userData.lastActive).toISOString()})`);
        }
      }
      
      console.log(`\n📈 Summary: ${staleCount}/${userIds.length} users have stale timestamps`);
      
      if (staleCount > 0) {
        console.log('\n🔧 Would you like to fix these? (uncomment the fix line below)');
        // await fixStaleTimestamps(db);
      }
    } else {
      console.log('❌ No status data found');
    }
    
  } catch (error) {
    console.error('❌ Scan failed:', error);
  }
  
  process.exit(0);
}

async function fixStaleTimestamps(db) {
  console.log('\n🔧 Fixing stale timestamps...');
  const currentTime = Date.now();
  const statusRef = db.ref('status');
  const snapshot = await statusRef.once('value');
  
  if (snapshot.exists()) {
    const data = snapshot.val();
    const updates = {};
    
    for (const [userId, userData] of Object.entries(data)) {
      if (userData.lastActive === 1745249821945) {
        updates[`${userId}/lastActive`] = currentTime;
        updates[`${userId}/lastSeen`] = currentTime;
        console.log(`🔧 Fixing user: ${userId}`);
      }
    }
    
    if (Object.keys(updates).length > 0) {
      await statusRef.update(updates);
      console.log(`✅ Fixed ${Object.keys(updates).length / 2} users`);
    }
  }
}

quickScan();
