// ============================================================
// Serializer — Low-level serialization helpers for checkpoints
// ============================================================
// Phase 42: Utility functions for serializing/deserializing
// Float64Array data to JSON-compatible formats.
//
// Provides:
//   - Float64Array ↔ number[] conversion
//   - Base64 encoding for compact binary storage (optional)
//   - Shape validation helpers
// ============================================================

/**
 * Convert a Float64Array to a plain number array.
 *
 * Used for JSON serialization of parameter data and optimizer buffers.
 */
export function float64ToArray(data: Float64Array): number[] {
  return Array.from(data);
}

/**
 * Convert a plain number array back to Float64Array.
 */
export function arrayToFloat64(data: number[]): Float64Array {
  return new Float64Array(data);
}

/**
 * Convert a Float64Array to a compact base64-encoded string.
 *
 * Useful when checkpoint size matters (e.g., saving to disk).
 * Each float64 takes 8 bytes → 4/3 * 8 ≈ 10.67 base64 chars on average.
 *
 * Note: This uses a simple manual encoding since we're in a
 * TypeScript environment without Node.js Buffer in browser contexts.
 */
export function float64ToBase64(data: Float64Array): string {
  // Convert Float64Array to bytes
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

  // Base64 encode
  const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  const len = bytes.length;

  for (let i = 0; i < len; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < len ? bytes[i + 1] : 0;
    const b3 = i + 2 < len ? bytes[i + 2] : 0;

    const triple = (b1 << 16) | (b2 << 8) | b3;

    result += CHARS[(triple >> 18) & 0x3f];
    result += CHARS[(triple >> 12) & 0x3f];
    result += i + 1 < len ? CHARS[(triple >> 6) & 0x3f] : "=";
    result += i + 2 < len ? CHARS[triple & 0x3f] : "=";
  }

  return result;
}

/**
 * Decode a base64 string back to Float64Array.
 */
export function base64ToFloat64(base64: string, length: number): Float64Array {
  const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const bytes = new Uint8Array(length * 8); // 8 bytes per float64

  let bytePos = 0;
  const str = base64.replace(/=+$/, "");

  for (let i = 0; i < str.length; i += 4) {
    const c1 = CHARS.indexOf(str[i]);
    const c2 = CHARS.indexOf(str[i + 1] || "A");
    const c3 = CHARS.indexOf(str[i + 2] || "A");
    const c4 = CHARS.indexOf(str[i + 3] || "A");

    const triple = (c1 << 18) | (c2 << 12) | (c3 << 6) | c4;

    if (bytePos < bytes.length) bytes[bytePos++] = (triple >> 16) & 0xff;
    if (bytePos < bytes.length) bytes[bytePos++] = (triple >> 8) & 0xff;
    if (bytePos < bytes.length) bytes[bytePos++] = triple & 0xff;
  }

  return new Float64Array(bytes.buffer, 0, length);
}

/**
 * Validate that two shapes are compatible for data transfer.
 *
 * Returns true if the shapes have the same total size
 * (allowing reshape), or exactly the same dimensions.
 */
export function validateShapeCompatibility(
  sourceShape: number[],
  targetShape: number[],
  strict: boolean = true
): boolean {
  if (strict) {
    if (sourceShape.length !== targetShape.length) return false;
    for (let i = 0; i < sourceShape.length; i++) {
      if (sourceShape[i] !== targetShape[i]) return false;
    }
    return true;
  }

  // Non-strict: only check total element count
  const sourceSize = sourceShape.length === 0
    ? 1
    : sourceShape.reduce((a, b) => a * b, 1);
  const targetSize = targetShape.length === 0
    ? 1
    : targetShape.reduce((a, b) => a * b, 1);
  return sourceSize === targetSize;
}
