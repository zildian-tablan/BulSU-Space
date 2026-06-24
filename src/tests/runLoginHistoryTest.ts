/**
 * Login History Test Runner
 * 
 * This script provides a way to test the login history feature from the browser console.
 * To use it, paste this code in your browser's developer console when logged in.
 * 
 * IMPORTANT: Replace the email and password with valid credentials before using.
 */

import { testLoginHistoryFeature } from './loginHistoryTest';

// Extend the Window interface to include our custom function
declare global {
  interface Window {
    testLoginHistory: (email: string, password: string) => Promise<void>;
  }
}

// Run this function from your browser console by typing:
// testLoginHistory('your-email@example.com', 'your-password')
window.testLoginHistory = async function(email: string, password: string) {
  if (!email || !password) {
    console.error('Error: Both email and password are required');
    console.log('Usage: testLoginHistory("your-email@example.com", "your-password")');
    return;
  }
  
  console.log('Testing login history feature...');
  
  try {
    const result = await testLoginHistoryFeature(email, password);
    
    if (result.success) {
      console.log('%c✅ ' + result.message, 'color: green; font-weight: bold');
    } else {
      console.log('%c❌ ' + result.message, 'color: red; font-weight: bold');
    }
    
    console.log('\nTo check the login history in the UI:');
    console.log('1. Go to Settings');
    console.log('2. Click on the "Account Security" tab');
    console.log('3. Scroll down to the Login History section');
    console.log('4. You should see your recent login listed there');
    
  } catch (error) {
    console.error('Error running test:', error);
  }
};

// Create a standalone function to export
const testLoginHistory = window.testLoginHistory;

// Export the test function
export { testLoginHistory };
