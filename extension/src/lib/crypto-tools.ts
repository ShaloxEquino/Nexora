// ============================================================
// NEXORA Crypto Utilities for Developer Tools
// All operations run locally in the browser
// ============================================================

/** Compute SHA-256 hash of text input (hex output) */
export async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Compute SHA-1 hash */
export async function sha1(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Generate a random UUID v4 */
export function generateUuid(): string {
  return crypto.randomUUID();
}

/** Encode text to hex */
export function textToHex(input: string): string {
  return Array.from(new TextEncoder().encode(input))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Decode hex to text */
export function hexToText(hex: string): { ok: boolean; value?: string; error?: string } {
  try {
    const clean = hex.replace(/\s/g, '');
    if (clean.length % 2 !== 0) throw new Error('Odd-length hex string');
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      const byte = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
      if (isNaN(byte)) throw new Error('Invalid hex character');
      bytes[i] = byte;
    }
    return { ok: true, value: new TextDecoder().decode(bytes) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** URL encode / decode */
export function urlEncode(input: string): string {
  return encodeURIComponent(input);
}

export function urlDecode(input: string): { ok: boolean; value?: string; error?: string } {
  try {
    return { ok: true, value: decodeURIComponent(input) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
