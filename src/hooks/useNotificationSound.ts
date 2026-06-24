import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

export interface NotificationSoundOptions {
  enabled: boolean;
  volume: number; // 0 to 1
  soundType: 'default' | 'subtle' | 'academic' | 'chime' | 'message';
}

const defaultOptions: NotificationSoundOptions = {
  enabled: true,
  volume: 0.5,
  soundType: 'default'
};

// Sound URLs - using Web Audio API compatible sounds
const SOUND_URLS = {
  default: 'https://cdn.pixabay.com/audio/2022/03/15/audio_115b9b7bfa.mp3',
  subtle: 'https://cdn.pixabay.com/audio/2022/03/15/audio_115b9b7bfa.mp3',
  academic: 'https://cdn.pixabay.com/audio/2022/03/15/audio_115b9b7bfa.mp3',
  chime: 'https://cdn.pixabay.com/audio/2022/03/15/audio_115b9b7bfa.mp3',
  message: 'https://cdn.pixabay.com/audio/2022/03/15/audio_115b9b7bfa.mp3'
};

export const useNotificationSound = (options: Partial<NotificationSoundOptions> = {}) => {
  const { currentUser } = useAuth();
  const audioContextRef = useRef<AudioContext | null>(null);
  const bufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());
  const lastPlayTimeRef = useRef<number>(0);
  
  const soundOptions = { ...defaultOptions, ...options };

  // Initialize audio context
  useEffect(() => {
    // Create audio context only when user is authenticated
    if (currentUser && !audioContextRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (error) {
        console.warn('Web Audio API not supported:', error);
      }
    }

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, [currentUser]);
  // Create oscillator-based notification sound
  const createNotificationTone = useCallback((type: string = 'default') => {
    if (!audioContextRef.current) return;

    const audioContext = audioContextRef.current;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    // For message notifications, add a second oscillator for a richer sound
    let oscillator2: OscillatorNode | null = null;
    let gainNode2: GainNode | null = null;
    
    if (type === 'message') {
      oscillator2 = audioContext.createOscillator();
      gainNode2 = audioContext.createGain();
      oscillator2.connect(gainNode2);
      gainNode2.connect(audioContext.destination);
    }

    // Connect primary nodes
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Configure sound based on type
    switch (type) {
      case 'subtle':
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(600, audioContext.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(soundOptions.volume * 0.3, audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.2);
        break;
      
      case 'academic':
        // A pleasant two-tone chime
        oscillator.frequency.setValueAtTime(660, audioContext.currentTime);
        oscillator.frequency.setValueAtTime(880, audioContext.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(soundOptions.volume * 0.4, audioContext.currentTime + 0.01);
        gainNode.gain.linearRampToValueAtTime(soundOptions.volume * 0.2, audioContext.currentTime + 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
        break;
        case 'chime':
        // Bell-like sound
        oscillator.frequency.setValueAtTime(523, audioContext.currentTime);
        oscillator.frequency.setValueAtTime(659, audioContext.currentTime + 0.05);
        oscillator.frequency.setValueAtTime(784, audioContext.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(soundOptions.volume * 0.5, audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.4);
        break;      case 'message':
        // Message notification - distinctive triple beep pattern with dual oscillators for richness
        // Set oscillator types
        oscillator.type = 'sine';
        if (oscillator2) {
          oscillator2.type = 'triangle';
          
          // First beep - dual oscillators
          oscillator.frequency.setValueAtTime(1200, audioContext.currentTime);
          oscillator2.frequency.setValueAtTime(900, audioContext.currentTime);
          
          // Set up gains for first beep
          gainNode.gain.setValueAtTime(0, audioContext.currentTime);
          gainNode.gain.linearRampToValueAtTime(soundOptions.volume * 0.4, audioContext.currentTime + 0.01);
          gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.08);
          
          if (gainNode2) {
            gainNode2.gain.setValueAtTime(0, audioContext.currentTime);
            gainNode2.gain.linearRampToValueAtTime(soundOptions.volume * 0.25, audioContext.currentTime + 0.01);
            gainNode2.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.08);
          }
          
          // Second beep - dual oscillators
          oscillator.frequency.setValueAtTime(1400, audioContext.currentTime + 0.1);
          oscillator2.frequency.setValueAtTime(1000, audioContext.currentTime + 0.1);
          
          gainNode.gain.linearRampToValueAtTime(soundOptions.volume * 0.4, audioContext.currentTime + 0.11);
          gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.18);
          
          if (gainNode2) {
            gainNode2.gain.linearRampToValueAtTime(soundOptions.volume * 0.25, audioContext.currentTime + 0.11);
            gainNode2.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.18);
          }
          
          // Third beep - dual oscillators
          oscillator.frequency.setValueAtTime(1600, audioContext.currentTime + 0.2);
          oscillator2.frequency.setValueAtTime(1200, audioContext.currentTime + 0.2);
          
          gainNode.gain.linearRampToValueAtTime(soundOptions.volume * 0.45, audioContext.currentTime + 0.21);
          gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
          
          if (gainNode2) {
            gainNode2.gain.linearRampToValueAtTime(soundOptions.volume * 0.3, audioContext.currentTime + 0.21);
            gainNode2.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
          }
          
          // Start and stop secondary oscillator
          oscillator2.start(audioContext.currentTime);
          oscillator2.stop(audioContext.currentTime + 0.5);
        } else {
          // Fallback to single oscillator if second one couldn't be created
          // First beep
          oscillator.frequency.setValueAtTime(1200, audioContext.currentTime);
          gainNode.gain.setValueAtTime(0, audioContext.currentTime);
          gainNode.gain.linearRampToValueAtTime(soundOptions.volume * 0.45, audioContext.currentTime + 0.01);
          gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.08);
          
          // Second beep (higher pitch)
          oscillator.frequency.setValueAtTime(1400, audioContext.currentTime + 0.1);
          gainNode.gain.linearRampToValueAtTime(soundOptions.volume * 0.45, audioContext.currentTime + 0.11);
          gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.18);
          
          // Third beep (even higher for attention)
          oscillator.frequency.setValueAtTime(1600, audioContext.currentTime + 0.2);
          gainNode.gain.linearRampToValueAtTime(soundOptions.volume * 0.5, audioContext.currentTime + 0.21);
          gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
        }
        break;
      
      default: // 'default'
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(soundOptions.volume * 0.4, audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.2);
        break;
    }    oscillator.type = 'sine';
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);

    // Return the primary oscillator (the second one is handled internally)
    return oscillator;
  }, [soundOptions.volume]);

  // Play notification sound with throttling
  const playNotificationSound = useCallback((notificationType?: string) => {
    // Check if sound is enabled
    if (!soundOptions.enabled || !audioContextRef.current) return;

    // Throttle sounds to prevent spam (minimum 1 second between sounds)
    const now = Date.now();
    if (now - lastPlayTimeRef.current < 1000) return;
    lastPlayTimeRef.current = now;

    try {
      // Resume audio context if suspended (required for some browsers)
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }

      // Create and play the sound
      createNotificationTone(soundOptions.soundType);
    } catch (error) {
      console.warn('Failed to play notification sound:', error);
    }
  }, [soundOptions.enabled, soundOptions.soundType, createNotificationTone]);
  // Play different sounds for different notification types with type-specific throttling
  const playTypedNotificationSound = useCallback((notificationType: string) => {
    if (!soundOptions.enabled) return;
    
    // Type-specific throttling
    const now = Date.now();
    const lastTypeTime = lastTypePlayTimeRef.current[notificationType] || 0;
    
    // Minimum 2 seconds between sounds of the same type
    if (now - lastTypeTime < 2000) {
      console.log(`Skipping ${notificationType} sound - too soon (${(now - lastTypeTime)/1000}s since last ${notificationType})`);
      return;
    }
    
    // Update type-specific last play time
    lastTypePlayTimeRef.current[notificationType] = now;

    let soundType = soundOptions.soundType;
    // Override sound type based on notification type
    switch (notificationType) {
      case 'announcement':
        soundType = 'chime'; // Important announcements get chime
        break;
      case 'friend_request':
        soundType = 'academic'; // Friend requests get academic tone
        break;
      case 'message':
      case 'message_request':
        soundType = 'message'; // Messages get the message tone
        break;
      case 'reaction':
      case 'comment':
        soundType = 'subtle'; // Reactions and comments get subtle sound
        break;
      default:
        soundType = soundOptions.soundType;
    }

    try {
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
      }
      createNotificationTone(soundType);
    } catch (error) {
      console.warn('Failed to play typed notification sound:', error);
    }
  }, [soundOptions.enabled, soundOptions.soundType, createNotificationTone]);  // Store last play time per notification type
  const lastTypePlayTimeRef = useRef<Record<string, number>>({});
  
  // Play message notification sound with controlled throttling
  const playMessageSound = useCallback(() => {
    // Check if sound is enabled
    if (!soundOptions.enabled || !audioContextRef.current) return;

    // Ensure we don't play message sounds too frequently
    const now = Date.now();
    const lastMessageSoundTime = lastTypePlayTimeRef.current['message'] || 0;
    
    // More strict throttling - minimum 1.5 seconds between message sounds
    if (now - lastMessageSoundTime < 1500) {
      console.log(`Skipping message sound - too soon (${(now - lastMessageSoundTime)/1000}s since last message sound)`);
      return;
    }
    
    // Global throttling for all sounds
    if (now - lastPlayTimeRef.current < 300) return;
    
    // Update both timers
    lastTypePlayTimeRef.current['message'] = now;
    lastPlayTimeRef.current = now;

    try {
      // Resume audio context if suspended (required for some browsers)
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }

      // FORCE direct creation of the message tone (bypassing any potential type issues)
      console.log('⚡ DIRECT MESSAGE SOUND TRIGGER - Creating message tone directly');
      
      // Get audioContext
      const audioContext = audioContextRef.current;
      
      // Create oscillators and gain nodes
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      // Add a second oscillator for a richer sound
      const oscillator2 = audioContext.createOscillator();
      const gainNode2 = audioContext.createGain();
      
      // Connect nodes
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator2.connect(gainNode2);
      gainNode2.connect(audioContext.destination);
      
      // Set types
      oscillator.type = 'sine';
      oscillator2.type = 'triangle';
      
      // First beep - dual oscillators
      oscillator.frequency.setValueAtTime(1200, audioContext.currentTime);
      oscillator2.frequency.setValueAtTime(900, audioContext.currentTime);
      
      // Set up gains for first beep
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(soundOptions.volume * 0.4, audioContext.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.08);
      
      gainNode2.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode2.gain.linearRampToValueAtTime(soundOptions.volume * 0.25, audioContext.currentTime + 0.01);
      gainNode2.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.08);
      
      // Second beep - dual oscillators
      oscillator.frequency.setValueAtTime(1400, audioContext.currentTime + 0.1);
      oscillator2.frequency.setValueAtTime(1000, audioContext.currentTime + 0.1);
      
      gainNode.gain.linearRampToValueAtTime(soundOptions.volume * 0.4, audioContext.currentTime + 0.11);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.18);
      
      gainNode2.gain.linearRampToValueAtTime(soundOptions.volume * 0.25, audioContext.currentTime + 0.11);
      gainNode2.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.18);
      
      // Third beep - dual oscillators
      oscillator.frequency.setValueAtTime(1600, audioContext.currentTime + 0.2);
      oscillator2.frequency.setValueAtTime(1200, audioContext.currentTime + 0.2);
      
      gainNode.gain.linearRampToValueAtTime(soundOptions.volume * 0.45, audioContext.currentTime + 0.21);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
      
      gainNode2.gain.linearRampToValueAtTime(soundOptions.volume * 0.3, audioContext.currentTime + 0.21);
      gainNode2.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
      
      // Start and stop oscillators
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
      oscillator2.start(audioContext.currentTime);
      oscillator2.stop(audioContext.currentTime + 0.5);
      
      console.log('🔊 Message sound played directly');
    } catch (error) {
      console.warn('Failed to play message sound:', error);
      // If the direct method fails, try the generic method as fallback
      try {
        createNotificationTone('message');
        console.log('Message sound played via fallback method');
      } catch (fallbackError) {
        console.error('Both message sound methods failed:', fallbackError);
      }
    }
  }, [soundOptions.enabled, soundOptions.volume, createNotificationTone]);

  // Test sound function
  const testSound = useCallback(() => {
    playNotificationSound();
  }, [playNotificationSound]);

  return {
    playNotificationSound,
    playTypedNotificationSound,
    testSound,
    playMessageSound,
    isAudioSupported: !!audioContextRef.current,
    soundOptions
  };
};
