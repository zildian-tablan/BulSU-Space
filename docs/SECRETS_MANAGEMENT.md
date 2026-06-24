# Secure Secrets Management Guide

This document explains how secrets and sensitive configurations are securely managed in the BulSU Space platform.

## Environment Variables

The application uses environment variables to manage sensitive information such as API keys, database credentials, and other configuration settings. This approach keeps sensitive data out of version control and allows for different configurations in different environments.

### Key Files

- `.env`: Contains the actual secrets and configuration values. **Never commit this file to version control.**
- `.env.example`: A template file that shows the required environment variables without actual values.

### Firebase Configuration

Firebase services require various API keys and configuration values which are now securely stored in environment variables:

```typescript
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  // messagingSenderId removed – FCM not used
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
};
```

## Validation and Error Handling

The system includes validation to ensure all required environment variables are present. If any are missing, warnings will be logged, and the system will attempt to use fallback values to maintain functionality where possible.

### Fallback and Graceful Degradation

In case of configuration errors, the system is designed to gracefully degrade rather than crash:

```typescript
try {
  app = initializeApp(firebaseConfig);
} catch (error) {
  console.error("Failed to initialize Firebase:", error);
  // Use minimal fallback config
  app = initializeApp(fallbackConfig);
}
```

## Security Considerations

### Firebase API Keys

Firebase API keys are considered public information as they're included in client-side code, but they must still be handled securely:

1. API keys are protected by Firebase Security Rules (Firestore, RTDB, Storage)
2. Client API keys only have limited permissions
3. API restrictions should be set in the Firebase Console to restrict domain usage

### Additional Protection Layers

1. **IP Allowlisting**: Consider limiting API access to specific IP ranges in production
2. **App Check**: Consider implementing Firebase App Check for additional security
3. **Service Accounts**: For server-side operations, use service accounts instead of client API keys

## Setting Up Environment Variables

### For Development

1. Copy `.env.example` to a new file named `.env`
2. Fill in the required values
3. Never commit `.env` to version control

### For Production

1. Use environment variables provided by your hosting platform (Vercel, Netlify, etc.)
2. Set up CI/CD to inject environment variables during build/deploy

## Adding New Environment Variables

When adding new environment variables:

1. Add them to `.env.example` with placeholder values
2. Document them in this file
3. Add validation in the code
4. Add fallback handling where appropriate

## Troubleshooting

If you encounter issues related to environment variables:

1. Check that all required variables are defined in your `.env` file
2. Verify that the variables are correctly named (REACT_APP_ prefix for client-side variables)
3. Check browser console for any warnings about missing environment variables
4. For production issues, verify that the hosting platform has the correct environment variables set
