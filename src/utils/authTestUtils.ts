import { auth, db } from '../firebase/config';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signInAnonymously } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';

// Test credentials - these are specifically for testing purposes
// Use an email domain that your Firebase project allows
const TEST_EMAIL = process.env.REACT_APP_TEST_EMAIL || '2022600218@bulsuspace.edu.ph';
const TEST_PASSWORD = process.env.REACT_APP_TEST_PASSWORD || 'testpassword123';

// Use either standard testing or anonymous auth as a fallback
const useAnonymousAuth = process.env.REACT_APP_USE_ANONYMOUS_AUTH === 'true';

/**
 * Creates a test user account for authentication testing - DISABLED
 */
export const createTestAccount = async () => {
  console.log('Test account creation is disabled');
  return false;
};

/**
 * Signs in with the test account - DISABLED
 */
export const signInWithTestAccount = async () => {
  console.log('Test account sign-in is disabled');
  return false;
};
