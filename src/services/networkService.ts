import { db, rtdb } from '../firebase/config';
import { get, ref } from 'firebase/database';
import { enableNetwork, disableNetwork } from 'firebase/firestore';

/**
 * Service to monitor and handle Firebase connectivity with real connectivity testing
 */
class NetworkService {
  private listeners: Array<(status: boolean) => void> = [];
  private isFirebaseConnected: boolean = true;
  private isInitialized: boolean = false;
  private connectivityCheckInterval: NodeJS.Timeout | null = null;
  private readonly CONNECTIVITY_CHECK_INTERVAL = 30000; // 30 seconds
  private readonly CONNECTION_TIMEOUT = 10000; // 10 seconds
    /**
   * Initialize network monitoring with real Firebase connectivity testing
   */
  async initialize() {
    if (this.isInitialized) {
      await this.testFirebaseConnectivity();
      return;
    }

    // Check for browser online/offline status
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    
    // Test initial Firebase connectivity
    await this.testFirebaseConnectivity();
    
    // Start periodic connectivity checks
    this.startPeriodicConnectivityCheck();
    this.isInitialized = true;
    
    console.log('Network service initialized with Firebase connectivity testing');
  }

  /**
   * Test connectivity against RTDB .info/connected to avoid Firestore-rule false negatives.
   */
  private async testFirebaseConnectivity(): Promise<boolean> {
    if (!navigator.onLine) {
      this.setConnectionStatus(false, 'Browser offline event detected');
      return false;
    }

    try {
      const connectedRef = ref(rtdb, '.info/connected');

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), this.CONNECTION_TIMEOUT);
      });

      const snapshot = await Promise.race([
        get(connectedRef),
        timeoutPromise,
      ]);

      const isConnected = snapshot.val() === true;
      this.setConnectionStatus(
        isConnected,
        isConnected
          ? 'Firebase RTDB connectivity restored'
          : 'Firebase RTDB reports disconnected',
      );

      return isConnected;
    } catch (error) {
      this.setConnectionStatus(false, 'Firebase connectivity probe failed', error);
      return false;
    }
  }

  private setConnectionStatus(isConnected: boolean, message: string, error?: unknown) {
    const changed = this.isFirebaseConnected !== isConnected;
    this.isFirebaseConnected = isConnected;

    if (!changed) return;

    if (isConnected) {
      console.log(message);
    } else if (error) {
      console.log(message, error);
    } else {
      console.log(message);
    }

    this.notifyListeners();
  }

  /**
   * Start periodic connectivity checks
   */
  private startPeriodicConnectivityCheck() {
    if (this.connectivityCheckInterval) {
      clearInterval(this.connectivityCheckInterval);
    }

    this.connectivityCheckInterval = setInterval(async () => {
      // Only test if browser thinks we're online
      if (navigator.onLine) {
        await this.testFirebaseConnectivity();
      }
    }, this.CONNECTIVITY_CHECK_INTERVAL);
  }

  /**
   * Stop periodic connectivity checks
   */
  private stopPeriodicConnectivityCheck() {
    if (this.connectivityCheckInterval) {
      clearInterval(this.connectivityCheckInterval);
      this.connectivityCheckInterval = null;
    }
  }
    /**
   * Get current connection status
   */
  getConnectionStatus(): boolean {
    return this.isFirebaseConnected;
  }

  /**
   * Force a connectivity check
   */
  async checkConnectivity(): Promise<boolean> {
    return await this.testFirebaseConnectivity();
  }  /**
   * Subscribe to connection status changes
   */
  subscribe(callback: (status: boolean) => void): () => void {
    this.listeners.push(callback);
    
    // Immediately notify with current status
    callback(this.isFirebaseConnected);
    
    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter(listener => listener !== callback);
    };
  }
    /**
   * Attempt to reconnect to Firebase services
   */
  async reconnect(): Promise<boolean> {
    try {
      console.log('Attempting to reconnect to Firebase...');
      
      // Re-enable Firestore network
      await enableNetwork(db);
      this.startPeriodicConnectivityCheck();
      
      // Test actual connectivity
      const isConnected = await this.testFirebaseConnectivity();
      
      if (isConnected) {
        console.log('Successfully reconnected to Firebase');
        return true;
      } else {
        console.log('Firebase services still not reachable');
        return false;
      }
    } catch (error) {
      console.error('Failed to reconnect to Firebase:', error);
      this.isFirebaseConnected = false;
      this.notifyListeners();
      return false;
    }
  }
    /**
   * Handle browser going online
   */
  private handleOnline = async () => {
    console.log('Browser online event detected');
    this.startPeriodicConnectivityCheck();
    // Test actual Firebase connectivity instead of just assuming it's online
    await this.testFirebaseConnectivity();
  }
    /**
   * Handle browser going offline
   */
  private handleOffline = async () => {
    console.log('Browser offline event detected');
    try {
      // Immediately mark as disconnected when browser reports offline
      this.isFirebaseConnected = false;
      this.notifyListeners();
      
      // Stop periodic checks when offline
      this.stopPeriodicConnectivityCheck();
      
      // Disable Firestore network to prevent unnecessary retry attempts
      await disableNetwork(db);
      
      console.log('Network service: Offline state confirmed');
    } catch (error) {
      console.error('Error handling offline state:', error);
    }
  }
  
  /**
   * Notify all listeners of connection status change
   */
  private notifyListeners() {
    this.listeners.forEach(listener => {
      try {
        listener(this.isFirebaseConnected);
      } catch (error) {
        console.error('Error in network status listener:', error);
      }
    });
  }
    /**
   * Clean up event listeners and stop periodic checks
   */
  cleanup() {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    this.stopPeriodicConnectivityCheck();
    this.listeners = [];
    this.isInitialized = false;
    console.log('Network service cleaned up');
  }
}

// Singleton instance
export const networkService = new NetworkService();

export default networkService; 