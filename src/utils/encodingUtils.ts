/**
 * Utility functions for encoding and decoding data between different formats
 */

/**
 * Convert an ArrayBuffer to a base64 string
 * @param buffer The ArrayBuffer to convert
 * @returns A base64 encoded string
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  // Avoid using spread operator with large arrays to prevent downlevelIteration issues
  const uint8Array = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return window.btoa(binary);
}

/**
 * Convert a base64 string to an ArrayBuffer
 * @param base64 The base64 string to convert
 * @returns An ArrayBuffer containing the decoded data
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Convert a string to an ArrayBuffer
 * @param str The string to convert
 * @returns An ArrayBuffer containing the string data
 */
export function stringToArrayBuffer(str: string): ArrayBuffer {
  const encoder = new TextEncoder();
  return encoder.encode(str).buffer;
}

/**
 * Convert an ArrayBuffer to a string
 * @param buffer The ArrayBuffer to convert
 * @returns A string decoded from the buffer
 */
export function arrayBufferToString(buffer: ArrayBuffer): string {
  const decoder = new TextDecoder();
  return decoder.decode(buffer);
}

/**
 * Generate a random string of specified length
 * @param length The length of the string to generate
 * @returns A random string
 */
export function generateRandomString(length: number = 32): string {
  const array = new Uint8Array(length);
  window.crypto.getRandomValues(array);
  // Avoid Array.from for better compatibility without downlevelIteration
  let result = '';
  for (let i = 0; i < array.length; i++) {
    result += array[i].toString(16).padStart(2, '0');
  }
  return result;
}
