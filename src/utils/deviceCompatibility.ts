export type AudioCallSupportResult = {
  supported: boolean;
  reason?: string;
};

const hasWindow = typeof window !== 'undefined';

const getUserAgent = (): string => {
  if (!hasWindow || typeof navigator === 'undefined') return '';
  return navigator.userAgent || '';
};

export const isIOSDevice = (): boolean => {
  const ua = getUserAgent();
  return /iPad|iPhone|iPod/i.test(ua) || (/Macintosh/i.test(ua) && 'ontouchend' in document);
};

export const checkAudioCallSupport = (): AudioCallSupportResult => {
  if (!hasWindow || typeof navigator === 'undefined') {
    return { supported: false, reason: 'Audio calls are only available in browser environments.' };
  }

  if (!window.isSecureContext) {
    return { supported: false, reason: 'Audio calls require a secure connection (HTTPS).' };
  }

  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    return { supported: false, reason: 'Your browser does not support microphone access for audio calls.' };
  }

  if (typeof window.RTCPeerConnection === 'undefined') {
    return { supported: false, reason: 'Your browser does not support real-time audio calls.' };
  }

  return { supported: true };
};

export const mapGetUserMediaErrorToMessage = (error: unknown): string | null => {
  const maybe = error as { name?: string; message?: string };
  const name = typeof maybe?.name === 'string' ? maybe.name : '';

  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone access is required for audio calls. Please allow microphone access and try again.';
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No microphone was detected on this device.';
  }

  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Your microphone is currently in use by another app.';
  }

  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return 'Unable to start audio with your current microphone settings.';
  }

  if (name === 'AbortError') {
    return 'Audio call setup was interrupted. Please try again.';
  }

  return null;
};
