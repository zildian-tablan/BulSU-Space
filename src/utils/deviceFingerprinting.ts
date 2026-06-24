import React from 'react';
import { doc, setDoc, getDoc, updateDoc, query, where, getDocs, collection } from 'firebase/firestore';
import { db } from '../firebase/config';
import { SecurityLogger } from './securityUtils';

interface DeviceFingerprint {
  id: string;
  userId: string;
  fingerprint: string;
  userAgent: string;
  platform: string;
  language: string;
  timezone: string;
  screenResolution: string;
  colorDepth: number;
  pixelRatio: number;
  touchSupport: boolean;
  cookieEnabled: boolean;
  doNotTrack: boolean;
  plugins: string[];
  fonts: string[];
  canvas: string;
  webgl: string;
  audio: string;
  ipAddress?: string;
  location?: {
    country?: string;
    region?: string;
    city?: string;
  };
  trusted: boolean;
  createdAt: Date;
  lastSeen: Date;
  loginCount: number;
  riskScore: number;
}

interface DeviceRisk {
  level: 'low' | 'medium' | 'high' | 'critical';
  score: number;
  factors: string[];
  recommendations: string[];
}

interface DeviceAnalytics {
  totalDevices: number;
  trustedDevices: number;
  suspiciousDevices: number;
  newDevices: number;
  riskDistribution: { [key: string]: number };
}

/**
 * Advanced device fingerprinting and recognition system
 */
export class DeviceFingerprintManager {
  private static readonly COLLECTION_NAME = 'device_fingerprints';
  private static readonly STORAGE_KEY = 'bulsu_device_fingerprint';
  private static currentFingerprint: string | null = null;

  /**
   * Generate comprehensive device fingerprint
   */
  static async generateFingerprint(): Promise<string> {
    try {
      const components: string[] = [];

      // Basic browser info
      components.push(navigator.userAgent);
      components.push(navigator.platform);
      components.push(navigator.language);
      components.push(Intl.DateTimeFormat().resolvedOptions().timeZone);

      // Screen information
  components.push(`${window.screen.width}x${window.screen.height}`);
  components.push(window.screen.colorDepth.toString());
      components.push(window.devicePixelRatio.toString());

      // Browser capabilities
      components.push(navigator.cookieEnabled.toString());
      components.push(navigator.doNotTrack || 'null');
      components.push('ontouchstart' in window ? 'true' : 'false');

      // Plugins (if available)
      if (navigator.plugins) {
        const plugins = Array.from(navigator.plugins)
          .map(p => p.name)
          .sort()
          .slice(0, 10); // Limit to 10 plugins
        components.push(plugins.join(','));
      }

      // Hardware concurrency
      if (navigator.hardwareConcurrency) {
        components.push(navigator.hardwareConcurrency.toString());
      }

      // Memory (if available)
      if ('memory' in navigator && (navigator as any).memory) {
        components.push((navigator as any).memory.jsHeapSizeLimit?.toString() || '');
      }

      // Canvas fingerprint
      const canvas = await this.generateCanvasFingerprint();
      components.push(canvas);

      // WebGL fingerprint
      const webgl = await this.generateWebGLFingerprint();
      components.push(webgl);

      // Audio context fingerprint
      const audio = await this.generateAudioFingerprint();
      components.push(audio);

      // Generate hash
      const fingerprint = await this.hashComponents(components);
      
      this.currentFingerprint = fingerprint;
      
      // Store in session storage
      sessionStorage.setItem(this.STORAGE_KEY, fingerprint);

      console.log('[DeviceFingerprint] Generated fingerprint successfully');
      return fingerprint;
    } catch (error) {
      console.error('[DeviceFingerprint] Error generating fingerprint:', error);
      SecurityLogger.logSecurityEvent('device_fingerprint_generation_error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return this.generateFallbackFingerprint();
    }
  }

  /**
   * Generate canvas fingerprint
   */
  private static async generateCanvasFingerprint(): Promise<string> {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) return 'no-canvas';

      canvas.width = 200;
      canvas.height = 50;

      // Draw some patterns
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('BulSU Space Canvas', 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('Device Fingerprint', 4, 17);

      return canvas.toDataURL();
    } catch (error) {
      return 'canvas-error';
    }
  }
  /**
   * Generate WebGL fingerprint
   */
  private static async generateWebGLFingerprint(): Promise<string> {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext | null;
      
      if (!gl) return 'no-webgl';

      const renderer = gl.getParameter(gl.RENDERER);
      const vendor = gl.getParameter(gl.VENDOR);
      const version = gl.getParameter(gl.VERSION);
      
      return `${vendor}-${renderer}-${version}`;
    } catch (error) {
      return 'webgl-error';
    }
  }

  /**
   * Generate audio context fingerprint
   */
  private static async generateAudioFingerprint(): Promise<string> {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const analyser = audioContext.createAnalyser();
      const gainNode = audioContext.createGain();
      const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

      gainNode.gain.value = 0; // Mute
      oscillator.connect(analyser);
      analyser.connect(scriptProcessor);
      scriptProcessor.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 1000;
      oscillator.start();

      return new Promise((resolve) => {
        scriptProcessor.onaudioprocess = () => {
          const array = new Float32Array(analyser.frequencyBinCount);
          analyser.getFloatFrequencyData(array);
          
          let hash = 0;
          for (let i = 0; i < array.length; i++) {
            hash += array[i];
          }
          
          oscillator.stop();
          audioContext.close();
          resolve(hash.toString());
        };
      });
    } catch (error) {
      return 'audio-error';
    }
  }

  /**
   * Hash fingerprint components
   */
  private static async hashComponents(components: string[]): Promise<string> {
    const data = components.join('|');
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Generate fallback fingerprint
   */
  private static generateFallbackFingerprint(): string {
    const components = [
      navigator.userAgent,
      navigator.platform,
      navigator.language,
  window.screen.width.toString(),
  window.screen.height.toString(),
      new Date().getTimezoneOffset().toString()
    ];
    
    return btoa(components.join('|')).replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
  }

  /**
   * Register device fingerprint for user
   */
  static async registerDevice(userId: string): Promise<DeviceFingerprint> {
    try {
      const fingerprint = this.currentFingerprint || await this.generateFingerprint();
      
      // Check if device already exists
      const existingDevice = await this.getDeviceByFingerprint(userId, fingerprint);
      
      if (existingDevice) {
        // Update existing device
        const updatedDevice = {
          ...existingDevice,
          lastSeen: new Date(),
          loginCount: existingDevice.loginCount + 1
        };
        
        await updateDoc(doc(db, this.COLLECTION_NAME, existingDevice.id), {
          lastSeen: updatedDevice.lastSeen,
          loginCount: updatedDevice.loginCount
        });

        SecurityLogger.logSecurityEvent('device_recognized', {
          userId,
          deviceId: existingDevice.id,
          loginCount: updatedDevice.loginCount
        });

        return updatedDevice;
      }

      // Create new device fingerprint
      const deviceId = `${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const newDevice: DeviceFingerprint = {
        id: deviceId,
        userId,
        fingerprint,
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  screenResolution: `${window.screen.width}x${window.screen.height}`,
  colorDepth: window.screen.colorDepth,
        pixelRatio: window.devicePixelRatio,
        touchSupport: 'ontouchstart' in window,
        cookieEnabled: navigator.cookieEnabled,
        doNotTrack: navigator.doNotTrack === '1',
        plugins: this.getPluginList(),
        fonts: await this.detectFonts(),
        canvas: await this.generateCanvasFingerprint(),
        webgl: await this.generateWebGLFingerprint(),
        audio: await this.generateAudioFingerprint(),
        trusted: false, // New devices start as untrusted
        createdAt: new Date(),
        lastSeen: new Date(),
        loginCount: 1,
        riskScore: this.calculateInitialRiskScore()
      };

      // Save to Firestore
      await setDoc(doc(db, this.COLLECTION_NAME, deviceId), newDevice);

      SecurityLogger.logSecurityEvent('new_device_registered', {
        userId,
        deviceId,
        platform: newDevice.platform,
        riskScore: newDevice.riskScore
      });

      console.log('[DeviceFingerprint] New device registered successfully');
      return newDevice;
    } catch (error) {
      console.error('[DeviceFingerprint] Error registering device:', error);
      SecurityLogger.logSecurityEvent('device_registration_error', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get device by fingerprint
   */
  static async getDeviceByFingerprint(userId: string, fingerprint: string): Promise<DeviceFingerprint | null> {
    try {
      const q = query(
        collection(db, this.COLLECTION_NAME),
        where('userId', '==', userId),
        where('fingerprint', '==', fingerprint)
      );
      
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        return { id: doc.id, ...doc.data() } as DeviceFingerprint;
      }
      
      return null;
    } catch (error) {
      console.error('[DeviceFingerprint] Error getting device by fingerprint:', error);
      return null;
    }
  }

  /**
   * Get all devices for user
   */
  static async getUserDevices(userId: string): Promise<DeviceFingerprint[]> {
    try {
      const q = query(
        collection(db, this.COLLECTION_NAME),
        where('userId', '==', userId)
      );
      
      const querySnapshot = await getDocs(q);
      
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as DeviceFingerprint));
    } catch (error) {
      console.error('[DeviceFingerprint] Error getting user devices:', error);
      return [];
    }
  }

  /**
   * Trust a device
   */
  static async trustDevice(deviceId: string): Promise<void> {
    try {
      await updateDoc(doc(db, this.COLLECTION_NAME, deviceId), {
        trusted: true,
        riskScore: 0
      });

      SecurityLogger.logSecurityEvent('device_trusted', {
        deviceId
      });

      console.log('[DeviceFingerprint] Device trusted successfully');
    } catch (error) {
      console.error('[DeviceFingerprint] Error trusting device:', error);
      throw error;
    }
  }

  /**
   * Remove device
   */
  static async removeDevice(deviceId: string): Promise<void> {
    try {
      await updateDoc(doc(db, this.COLLECTION_NAME, deviceId), {
        trusted: false,
        riskScore: 100
      });

      SecurityLogger.logSecurityEvent('device_removed', {
        deviceId
      });

      console.log('[DeviceFingerprint] Device removed successfully');
    } catch (error) {
      console.error('[DeviceFingerprint] Error removing device:', error);
      throw error;
    }
  }

  /**
   * Analyze device risk
   */
  static analyzeDeviceRisk(device: DeviceFingerprint): DeviceRisk {
    const factors: string[] = [];
    let score = 0;

    // Check if device is new
    const daysSinceCreation = (Date.now() - device.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceCreation < 1) {
      factors.push('New device');
      score += 30;
    }

    // Check login frequency
    if (device.loginCount < 3) {
      factors.push('Low login count');
      score += 20;
    }

    // Check if device is untrusted
    if (!device.trusted) {
      factors.push('Untrusted device');
      score += 25;
    }

    // Check for suspicious user agent
    if (this.isSuspiciousUserAgent(device.userAgent)) {
      factors.push('Suspicious user agent');
      score += 40;
    }

    // Check for automation indicators
    if (this.hasAutomationIndicators(device)) {
      factors.push('Automation indicators');
      score += 50;
    }

    // Determine risk level
    let level: 'low' | 'medium' | 'high' | 'critical';
    if (score >= 80) level = 'critical';
    else if (score >= 60) level = 'high';
    else if (score >= 30) level = 'medium';
    else level = 'low';

    // Generate recommendations
    const recommendations: string[] = [];
    if (!device.trusted) recommendations.push('Trust this device if you recognize it');
    if (device.loginCount < 3) recommendations.push('Monitor device usage patterns');
    if (level === 'high' || level === 'critical') recommendations.push('Consider requiring additional verification');

    return { level, score, factors, recommendations };
  }

  /**
   * Get plugin list
   */
  private static getPluginList(): string[] {
    if (!navigator.plugins) return [];
    
    return Array.from(navigator.plugins)
      .map(plugin => plugin.name)
      .sort()
      .slice(0, 10); // Limit to 10 plugins
  }

  /**
   * Detect available fonts
   */
  private static async detectFonts(): Promise<string[]> {
    const testFonts = [
      'Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Verdana',
      'Georgia', 'Palatino', 'Garamond', 'Bookman', 'Comic Sans MS',
      'Trebuchet MS', 'Arial Black', 'Impact'
    ];

    const availableFonts: string[] = [];
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) return [];

    for (const font of testFonts) {
      context.font = `12px ${font}, serif`;
      const width = context.measureText('mmmmmmmmmmlli').width;
      
      context.font = '12px serif';
      const serifWidth = context.measureText('mmmmmmmmmmlli').width;
      
      if (width !== serifWidth) {
        availableFonts.push(font);
      }
    }

    return availableFonts;
  }

  /**
   * Calculate initial risk score
   */
  private static calculateInitialRiskScore(): number {
    let score = 50; // Base score for new devices

    // Check for suspicious indicators
    if (this.isSuspiciousUserAgent(navigator.userAgent)) {
      score += 30;
    }

    if (!navigator.cookieEnabled) {
      score += 20;
    }

    if (navigator.doNotTrack === '1') {
      score += 10;
    }

    // Check for headless browsers
    if ((navigator as any).webdriver) {
      score += 50;
    }

    return Math.min(score, 100);
  }

  /**
   * Check for suspicious user agent
   */
  private static isSuspiciousUserAgent(userAgent: string): boolean {
    const suspiciousPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /headless/i,
      /phantom/i,
      /selenium/i,
      /webdriver/i,
      /automation/i
    ];

    return suspiciousPatterns.some(pattern => pattern.test(userAgent));
  }

  /**
   * Check for automation indicators
   */
  private static hasAutomationIndicators(device: DeviceFingerprint): boolean {
    // Check for webdriver property
    if ((navigator as any).webdriver) return true;

    // Check for suspicious plugin combinations
    if (device.plugins.length === 0) return true;

    // Check for suspicious screen resolution
    if (device.screenResolution === '1024x768' || device.screenResolution === '800x600') return true;

    return false;
  }

  /**
   * Get device analytics for user
   */
  static async getUserDeviceAnalytics(userId: string): Promise<DeviceAnalytics> {
    try {
      const devices = await this.getUserDevices(userId);
      
      const analytics: DeviceAnalytics = {
        totalDevices: devices.length,
        trustedDevices: devices.filter(d => d.trusted).length,
        suspiciousDevices: devices.filter(d => d.riskScore > 60).length,
        newDevices: devices.filter(d => {
          const daysSince = (Date.now() - d.createdAt.getTime()) / (1000 * 60 * 60 * 24);
          return daysSince < 7;
        }).length,
        riskDistribution: {
          low: devices.filter(d => d.riskScore < 30).length,
          medium: devices.filter(d => d.riskScore >= 30 && d.riskScore < 60).length,
          high: devices.filter(d => d.riskScore >= 60 && d.riskScore < 80).length,
          critical: devices.filter(d => d.riskScore >= 80).length
        }
      };

      return analytics;
    } catch (error) {
      console.error('[DeviceFingerprint] Error getting analytics:', error);
      return {
        totalDevices: 0,
        trustedDevices: 0,
        suspiciousDevices: 0,
        newDevices: 0,
        riskDistribution: { low: 0, medium: 0, high: 0, critical: 0 }
      };
    }
  }

  /**
   * Get current device fingerprint
   */
  static getCurrentFingerprint(): string | null {
    return this.currentFingerprint || sessionStorage.getItem(this.STORAGE_KEY);
  }
}

/**
 * React hook for device fingerprinting
 */
export const useDeviceFingerprinting = () => {
  const [deviceInfo, setDeviceInfo] = React.useState<DeviceFingerprint | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [analytics, setAnalytics] = React.useState<DeviceAnalytics | null>(null);

  const registerCurrentDevice = React.useCallback(async (userId: string) => {
    try {
      setIsLoading(true);
      const device = await DeviceFingerprintManager.registerDevice(userId);
      setDeviceInfo(device);
      return device;
    } catch (error) {
      console.error('Error registering device:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadUserDevices = React.useCallback(async (userId: string) => {
    try {
      const devices = await DeviceFingerprintManager.getUserDevices(userId);
      const deviceAnalytics = await DeviceFingerprintManager.getUserDeviceAnalytics(userId);
      setAnalytics(deviceAnalytics);
      return devices;
    } catch (error) {
      console.error('Error loading devices:', error);
      return [];
    }
  }, []);

  const trustDevice = React.useCallback(async (deviceId: string) => {
    try {
      await DeviceFingerprintManager.trustDevice(deviceId);
      if (deviceInfo && deviceInfo.id === deviceId) {
        setDeviceInfo({ ...deviceInfo, trusted: true, riskScore: 0 });
      }
    } catch (error) {
      console.error('Error trusting device:', error);
      throw error;
    }
  }, [deviceInfo]);

  return {
    deviceInfo,
    analytics,
    isLoading,
    registerCurrentDevice,
    loadUserDevices,
    trustDevice,
    analyzeRisk: DeviceFingerprintManager.analyzeDeviceRisk
  };
};

// (React import moved to top)
