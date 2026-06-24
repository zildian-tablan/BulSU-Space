// Comprehensive presence data scanner
const admin = require('firebase-admin');

console.log('🔍 Comprehensive Presence Data Scanner...');

// Initialize Firebase Admin (reuse existing if already initialized)
if (!admin.apps.length) {
  try {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: 'https://bulsuspace-default-rtdb.firebaseio.com'
    });
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin:', error.message);
    process.exit(1);
  }
}

const database = admin.database();

async function scanAllPresenceData() {
  try {
    console.log('\n=== SCANNING ALL POSSIBLE PRESENCE PATHS ===');
    
    // Check different possible paths
    const pathsToCheck = [
      'status',           // Standard presence path
      'presence',         // Alternative presence path
      'users',           // Users data with presence info
      'connections',     // Connection tracking
      'userPresence',    // Alternative naming
      'onlineUsers',     // Another alternative
    ];
    
    for (const path of pathsToCheck) {
      console.log(`\n--- Checking path: /${path} ---`);
      try {
        const snapshot = await database.ref(path).once('value');
        
        if (snapshot.exists()) {
          const data = snapshot.val();
          console.log(`✅ Found data in /${path}`);
          console.log(`   Number of entries: ${Object.keys(data).length}`);
          
          // Analyze the structure
          const firstKey = Object.keys(data)[0];
          const firstEntry = data[firstKey];
          console.log(`   Sample entry key: ${firstKey}`);
          console.log(`   Sample entry structure:`, Object.keys(firstEntry));
          
          // Check for stale timestamps
          let staleCount = 0;
          let totalCount = 0;
          
          for (const [key, entry] of Object.entries(data)) {
            totalCount++;
            if (entry && typeof entry === 'object') {
              // Check various timestamp fields
              const timestampFields = ['lastActive', 'lastSeen', 'timestamp', 'updatedAt'];
              
              for (const field of timestampFields) {
                if (entry[field] === 1745249821945) {
                  staleCount++;
                  console.log(`🚨 FOUND STALE TIMESTAMP in /${path}/${key}.${field}`);
                  console.log(`   User: ${key}`);
                  console.log(`   Field: ${field}`);
                  console.log(`   Stale value: ${entry[field]} (${new Date(entry[field]).toISOString()})`);
                  console.log(`   Full entry:`, entry);
                }
              }
            }
          }
          
          console.log(`   Total entries scanned: ${totalCount}`);
          console.log(`   Stale timestamps found: ${staleCount}`);
          
        } else {
          console.log(`❌ No data found in /${path}`);
        }
      } catch (error) {
        console.log(`❌ Error accessing /${path}:`, error.message);
      }
    }
    
    // Also check the root for any presence-related data
    console.log('\n--- Checking root level keys ---');
    try {
      const rootSnapshot = await database.ref('/').once('value');
      if (rootSnapshot.exists()) {
        const rootData = rootSnapshot.val();
        console.log('Root level keys:', Object.keys(rootData));
        
        // Look for any keys that might contain presence data
        for (const key of Object.keys(rootData)) {
          if (key.toLowerCase().includes('presence') || 
              key.toLowerCase().includes('status') || 
              key.toLowerCase().includes('online') ||
              key.toLowerCase().includes('connection')) {
            console.log(`🔍 Found potential presence-related key: ${key}`);
          }
        }
      }
    } catch (error) {
      console.log('❌ Error accessing root:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Scan failed:', error);
  }
}

// Also create a function to fix any found stale timestamps
async function fixStaleTimestamps() {
  console.log('\n=== FIXING STALE TIMESTAMPS ===');
  
  const pathsToFix = ['status', 'presence', 'users'];
  const currentTimestamp = Date.now();
  
  for (const path of pathsToFix) {
    try {
      const snapshot = await database.ref(path).once('value');
      
      if (snapshot.exists()) {
        const data = snapshot.val();
        const updates = {};
        let fixCount = 0;
        
        for (const [key, entry] of Object.entries(data)) {
          if (entry && typeof entry === 'object') {
            let needsUpdate = false;
            const updatedEntry = { ...entry };
            
            // Check and fix timestamp fields
            const timestampFields = ['lastActive', 'lastSeen', 'timestamp', 'updatedAt'];
            
            for (const field of timestampFields) {
              if (entry[field] === 1745249821945) {
                console.log(`🔧 Fixing stale timestamp in /${path}/${key}.${field}`);
                updatedEntry[field] = currentTimestamp;
                needsUpdate = true;
              }
            }
            
            if (needsUpdate) {
              updates[key] = updatedEntry;
              fixCount++;
            }
          }
        }
        
        if (fixCount > 0) {
          console.log(`📝 Updating ${fixCount} entries in /${path}`);
          await database.ref(path).update(updates);
          console.log(`✅ Fixed ${fixCount} stale timestamps in /${path}`);
        } else {
          console.log(`✅ No stale timestamps found in /${path}`);
        }
      }
    } catch (error) {
      console.log(`❌ Error fixing /${path}:`, error.message);
    }
  }
}

async function runDiagnostic() {
  await scanAllPresenceData();
  
  console.log('\n=== WOULD YOU LIKE TO FIX STALE TIMESTAMPS? ===');
  console.log('Uncomment the line below to automatically fix any found stale timestamps:');
  console.log('// await fixStaleTimestamps();');
  
  // Uncomment this line to automatically fix stale timestamps:
  await fixStaleTimestamps();
  
  console.log('\n🎉 Comprehensive scan complete!');
  process.exit(0);
}

runDiagnostic();
