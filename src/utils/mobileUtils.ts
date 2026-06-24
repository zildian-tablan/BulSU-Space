/**
 * Mobile detection and responsive utilities
 */

/**
 * Check if the current device is mobile based on screen width
 * Uses the same breakpoint as the codebase (768px)
 */
export const isMobileDevice = (): boolean => {
  return window.innerWidth < 768;
};

/**
 * Check if device supports touch
 */
export const isTouchDevice = (): boolean => {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
};

/**
 * Check if device is both mobile and touch-enabled
 */
export const isMobileTouchDevice = (): boolean => {
  return isMobileDevice() && isTouchDevice();
};

/**
 * Get device type classification
 */
export const getDeviceType = (): 'mobile' | 'tablet' | 'desktop' => {
  const width = window.innerWidth;
  
  if (width < 768) {
    return 'mobile';
  } else if (width < 1024) {
    return 'tablet';
  } else {
    return 'desktop';
  }
};

/**
 * Hook for responsive screen size changes
 */
export const useResponsiveScreen = (callback: (isMobile: boolean) => void) => {
  const handleResize = () => {
    callback(isMobileDevice());
  };

  // Set initial state
  handleResize();

  // Add event listener
  window.addEventListener('resize', handleResize);

  // Return cleanup function
  return () => {
    window.removeEventListener('resize', handleResize);
  };
};
