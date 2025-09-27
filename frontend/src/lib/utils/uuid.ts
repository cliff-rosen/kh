/**
 * UUID Generation Utility
 * 
 * Provides cross-browser compatible UUID generation.
 * Falls back to a custom implementation if crypto.randomUUID is not available.
 */

/**
 * Generate a UUID v4 string
 * Uses crypto.randomUUID() if available, otherwise falls back to a polyfill
 */
export function generateUUID(): string {
  // Try to use the native crypto.randomUUID() if available
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch (error) {
      // Fall back to polyfill if crypto.randomUUID() fails
    }
  }

  // Polyfill implementation for browsers that don't support crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Generate a UUID with a specific prefix
 */
export function generatePrefixedUUID(prefix: string): string {
  return `${prefix}_${generateUUID()}`;
}