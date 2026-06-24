import { auth, db } from './config';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

/**
 * Attempts to sign in with multiple email formats
 * This is a helper function to try different email domain variations
 */
export const signInWithMultipleFormats = async (emailBase: string, password: string): Promise<boolean> => {
  const emailFormats = [
    `${emailBase}@bulsuspace.edu.ph`,
    `${emailBase}@bulsu.edu.ph`
  ];
  
  let success = false;
  let lastError = null;
  
  // Try each email format
  for (const email of emailFormats) {
    try {
      console.log(`Attempting login with: ${email}`);
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log('Login successful with:', email);
      success = true;
      break;
    } catch (error) {
      console.log(`Login failed with ${email}:`, error);
      lastError = error;
    }
  }
  
  if (!success && lastError) {
    console.error('All login attempts failed. Last error:', lastError);
  }
  
  return success;
};

/**
 * Checks if an email exists in Firebase Authentication
 */
export const checkEmailExists = async (email: string): Promise<boolean> => {
  try {
    const methods = await fetchSignInMethodsForEmail(auth, email);
    return methods.length > 0;
  } catch (error) {
    console.error('Error checking email:', error);
    return false;
  }
};

/**
 * Safely gets user data from Firestore
 */
export const getUserData = async (userId: string) => {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      return userDoc.data();
    }
    return null;
  } catch (error) {
    console.error('Error fetching user data:', error);
    return null;
  }
};
