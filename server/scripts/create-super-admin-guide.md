# Super Admin Creation Guide

## Steps to Create Super Admin

### Option 1: Using Firebase Console

1. Go to Firebase Console: https://console.firebase.google.com/
2. Select your project: "bulsuspace"
3. Navigate to "Authentication" in the left sidebar
4. Click "Add User" button
5. Enter the email: sa-bs-001@bulsuspace.edu.ph
6. Enter the password: @BS2025
7. Click "Add User" to create the user

After creating the user in Authentication:

1. Go to "Firestore Database" in the left sidebar
2. Navigate to the "users" collection
3. Create a new document with ID matching the UID of the user you just created
4. Add the following fields:
   - email: sa-bs-001@bulsuspace.edu.ph
   - name: Super Administrator
   - idNumber: SA-BS-001
   - role: admin
   - profile_pic: https://ui-avatars.com/api/?name=Super+Administrator&background=0D8ABC&color=fff
   - createdAt: serverTimestamp()
   - updatedAt: serverTimestamp()

### Option 2: Using Firebase Admin SDK in Node.js REPL

1. Open a terminal in the server directory
2. Start Node.js REPL with proper environment variables:
```bash
cd server
node
```

3. In the Node.js REPL, run:
```javascript
// Load required modules
const admin = require('firebase-admin');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  })
});

// Create authentication user
admin.auth().createUser({
  email: 'sa-bs-001@bulsuspace.edu.ph',
  password: '@BS2025',
  displayName: 'Super Administrator'
}).then(userRecord => {
  console.log('User created with UID:', userRecord.uid);
  
  // Create user document in Firestore
  return admin.firestore().collection('users').doc(userRecord.uid).set({
    email: 'sa-bs-001@bulsuspace.edu.ph',
    name: 'Super Administrator',
    idNumber: 'SA-BS-001',
    role: 'admin',
    profile_pic: 'https://ui-avatars.com/api/?name=Super+Administrator&background=0D8ABC&color=fff',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
}).then(() => {
  console.log('User document created in Firestore');
}).catch(error => {
  console.error('Error creating user:', error);
});
```

### Option 3: Manual Setup Through App Interface

1. First, register a regular user through your application's signup flow
2. Use the following credentials:
   - Email: sa-bs-001@bulsuspace.edu.ph
   - Password: @BS2025
   - ID Number: SA-BS-001
   - Name: Super Administrator

3. After registration, update the user's role to 'admin' using one of these methods:
   - Directly edit the Firestore database through Firebase Console
   - Use the Firebase CLI to run a script that updates the user's role
   - If you have admin functionality in your application, use it to promote the user

## Verification

To verify the Super Admin was created successfully:

1. Try logging in with the credentials:
   - Email: sa-bs-001@bulsuspace.edu.ph
   - Password: @BS2025

2. Check if the user has admin privileges by accessing admin-only features.
