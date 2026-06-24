import { playMessageNotificationSound } from '../services/messageService';

/**
 * Global sound testing utility for debugging
 */
export const testMessageSound = () => {
  console.log('Manual message sound test triggered');
  return playMessageNotificationSound();
};

// Attach to window for debugging in browser console
if (typeof window !== 'undefined') {
  (window as any).testMessageSound = testMessageSound;
  console.log('Message sound test utility attached to window.testMessageSound()');
}