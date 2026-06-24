import { useState, useEffect } from 'react';
import { auth } from '../firebase/config';

/**
 * Type definition for friendship status between two users
 */
export type FriendshipStatusType = 'friends' | 'pending_sent' | 'pending_received' | null;

/**
 * Interface for the friendship status object returned by the hook
 */
interface FriendshipStatus {
  isFriend: boolean;
  isPending: boolean;
  isPendingReceived: boolean;
  isLoading: boolean;
  error: string | null;
  rawStatus: FriendshipStatusType;
}

/**
 * Hook to manage friendship status between the current user and another user
 * Uses the same real-time friendship status mechanism as the Community page
 * 
 * @param userId The ID of the other user to check friendship status with
 * @returns A FriendshipStatus object with the current friendship status
 */
export default function useFriendship(userId: string | undefined) {
  const [status, setStatus] = useState<FriendshipStatus>({
    isFriend: false,
    isPending: false,
    isPendingReceived: false,
    isLoading: true,
    error: null,
    rawStatus: null
  });

  useEffect(() => {
    console.log('useFriendship hook running for userId:', userId);
    
    // For development testing only - fallback to false after 3 seconds to prevent eternal loading
    const fallbackTimer = setTimeout(() => {
      if (status.isLoading) {
        console.log('Friendship status fallback triggered - setting to not friends');
        setStatus(prev => ({
          ...prev,
          isLoading: false
        }));
      }
    }, 3000);
    
    // If no userId provided or not authenticated, return early
    if (!userId) {
      console.log('No userId provided to useFriendship hook');
      setStatus({
        isFriend: false,
        isPending: false,
        isPendingReceived: false,
        isLoading: false,
        error: null,
        rawStatus: null
      });
      return () => clearTimeout(fallbackTimer);
    }

    // Check if user is authenticated
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.log('No authenticated user found');
      setStatus({
        isFriend: false,
        isPending: false,
        isPendingReceived: false,
        isLoading: false,
        error: null,
        rawStatus: null
      });
      return () => clearTimeout(fallbackTimer);
    }

    const currentUserId = currentUser.uid;
    console.log('Current user ID:', currentUserId);
    
    // Early return if trying to check friendship with self
    if (currentUserId === userId) {
      console.log('Checking friendship with self, returning false');
      setStatus({
        isFriend: false,
        isPending: false,
        isPendingReceived: false,
        isLoading: false,
        error: null,
        rawStatus: null
      });
      return () => clearTimeout(fallbackTimer);
    }

    // Friendship features are disabled: immediately set neutral status and return no-op unsubscribe
    setStatus({
      isFriend: false,
      isPending: false,
      isPendingReceived: false,
      isLoading: false,
      error: null,
      rawStatus: null
    });
    const unsubscribe = () => {};
    
    // Cleanup subscriptions on unmount
    return () => {
      console.log('Cleaning up friendship listener');
      unsubscribe();
      clearTimeout(fallbackTimer);
    };
  }, [userId]);
  
  return status;
}
