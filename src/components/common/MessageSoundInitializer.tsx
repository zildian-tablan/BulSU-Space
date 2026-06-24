import { useEffect, useRef } from 'react';
import { useNotificationContext } from '../../contexts/NotificationContext';
import { registerMessageSoundPlayer, playMessageNotificationSound, initializeRealTimeMessageSound } from '../../services/messageService';
import { useAuth } from '../../contexts/AuthContext';

// Add a type definition for the document augmentation
declare global {
  interface Document {
    audioActivated?: boolean;
  }
}

/**
 * Component to register the message sound player with the message service
 * This ensures immediate message sound feedback without waiting for notifications
 */
const MessageSoundInitializer: React.FC = () => {
  const { playMessageNotification } = useNotificationContext();
  const { currentUser } = useAuth();
  const initRef = useRef<boolean>(false);
  
  // Use an effect to register the message sound player once
  useEffect(() => {
    if (initRef.current) return; // Only register once
    
    // Define a failsafe sound player that always works
    const soundPlayer = () => {
      console.log('🔊 Failsafe message sound player called');
      
      try {
        // First attempt: use notification context's player
        playMessageNotification();
        console.log('✅ Used notification context sound player');
      } catch (e) {
        console.error('❌ Failed to play via notification context:', e);
        
        // Emergency fallback - create an audio element and play it
        try {
          const audio = new Audio();
          audio.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tAwAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAAElgC1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAABJa/PG7aAAAAAAAAAAAAAAAAAAAA';
          audio.volume = 0.5;
          audio.play().catch(err => console.error('Audio fallback failed:', err));
          console.log('🔊 Used emergency audio element fallback');
        } catch (audioErr) {
          console.error('💥 All sound methods failed:', audioErr);
        }
      }
    };
    
    // Register the message sound player with the message service
    registerMessageSoundPlayer(soundPlayer);
    console.log('🚀 Message sound player REGISTERED with messageService');
    
    // Initialize the real-time message sound system if user is logged in
    if (currentUser) {
      initializeRealTimeMessageSound(currentUser.id);
      console.log('🚀 Real-time message sound system initialized');
    }
    
    // Ensure Web Audio API is activated by playing a silent sound
    // This helps bypass browser restrictions requiring user interaction
    const activateAudio = () => {
      try {
        console.log('🔊 Activating audio context...');
        const audio = new Audio();
        // Create a silent audio blip (1ms) to activate the audio context
        audio.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tAwAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAAElgC1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAABJa/PG7aAAAAAAAAAAAAAAAAAAAA';
        audio.volume = 0.01; // Nearly silent
        audio.play().then(() => {
          console.log('✅ Audio context activated successfully');
          // Now play a real test sound after activation
          setTimeout(() => {
            console.log('🔊 Testing message notification sound...');
            playMessageNotificationSound(true); // force=true bypasses throttling
          }, 500);
        }).catch(err => {
          console.error('❌ Could not activate audio context:', err);
        });
      } catch (e) {
        console.error('Error activating audio context:', e);
      }
    };
    
    // Activate audio on page load (will only work if user has interacted with the page)
    activateAudio();
    
    // Also attach a one-time click handler to the document to ensure audio activation
    const handleDocumentClick = () => {
      if (!document.audioActivated) {
        document.audioActivated = true;
        activateAudio();
        document.removeEventListener('click', handleDocumentClick);
      }
    };
    
    document.addEventListener('click', handleDocumentClick);
    
    initRef.current = true;
    
    return () => {
      document.removeEventListener('click', handleDocumentClick);
    };
  }, [playMessageNotification, currentUser]);

  return (
    // Add a hidden div for better component tracking in React DevTools
    <div style={{ display: 'none' }} data-testid="message-sound-initializer">
      Message Sound Initializer
    </div>
  );
};

export default MessageSoundInitializer;
