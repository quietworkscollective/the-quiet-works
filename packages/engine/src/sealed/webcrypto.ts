/**
 * The platform primitives behind sealed content (ADR 0002): WebCrypto, UTF-8, base64 and hex.
 *
 * The engine compiles without DOM or Node typings and the same code runs in browsers and in Node,
 * so the few platform APIs it needs are reached through `globalThis` and typed here by the shape
 * this module relies on. Everything stays on WebCrypto (`crypto.subtle`); there is no Node-only path.
 */

/** Bytes of the per-item PBKDF2 salt and of the per-sealing AES-GCM IV (ADR 0002). */
export const SALT_BYTES = 16;
export const IV_BYTES = 12;

/** An opaque `CryptoKey`. */
type KeyLike = object;

interface SubtleLike {
  importKey(
    format: 'raw',
    keyData: Uint8Array,
    algorithm: 'PBKDF2',
    extractable: false,
    usages: readonly ['deriveKey'],
  ): Promise<KeyLike>;
  deriveKey(
    algorithm: { name: 'PBKDF2'; salt: Uint8Array; iterations: number; hash: 'SHA-256' },
    baseKey: KeyLike,
    derivedKeyType: { name: 'AES-GCM'; length: 256 },
    extractable: false,
    usages: readonly ['encrypt', 'decrypt'],
  ): Promise<KeyLike>;
  encrypt(algorithm: { name: 'AES-GCM'; iv: Uint8Array }, key: KeyLike, data: Uint8Array): Promise<ArrayBuffer>;
  decrypt(algorithm: { name: 'AES-GCM'; iv: Uint8Array }, key: KeyLike, data: Uint8Array): Promise<ArrayBuffer>;
  digest(algorithm: 'SHA-256', data: Uint8Array): Promise<ArrayBuffer>;
}

interface PlatformLike {
  crypto?: { subtle?: SubtleLike; getRandomValues(array: Uint8Array): Uint8Array };
  TextEncoder: new () => { encode(input: string): Uint8Array };
  TextDecoder: new (label: 'utf-8', options: { fatal: true }) => { decode(input: Uint8Array): string };
}

const platform = globalThis as unknown as PlatformLike;

/** `crypto.subtle` exists only in secure contexts (https, localhost) and in Node. */
function subtle(): SubtleLike {
  const found = platform.crypto?.subtle;
  if (found === undefined) throw new Error('WebCrypto (crypto.subtle) is not available in this context');
  return found;
}

export function randomBytes(length: number): Uint8Array {
  const crypto = platform.crypto;
  if (crypto === undefined) throw new Error('WebCrypto (crypto.getRandomValues) is not available in this context');
  return crypto.getRandomValues(new Uint8Array(length));
}

export function utf8Encode(text: string): Uint8Array {
  return new platform.TextEncoder().encode(text);
}

/** Strict: bytes that are not valid UTF-8 throw rather than decode to replacement characters. */
export function utf8Decode(bytes: Uint8Array): string {
  return new platform.TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const left = bytes.length - i;
    const group = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += ALPHABET.charAt(group >> 18) + ALPHABET.charAt((group >> 12) & 63);
    out += left > 1 ? ALPHABET.charAt((group >> 6) & 63) : '=';
    out += left > 2 ? ALPHABET.charAt(group & 63) : '=';
  }
  return out;
}

/**
 * Strict RFC 4648 base64: only the canonical encoding of some byte string decodes, so changing a
 * single character of a sealed field can never leave the decoded bytes (and so the item) intact.
 */
export function fromBase64(text: string): Uint8Array {
  if (text.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw new Error('not valid base64');
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((text.length / 4) * 3 - padding);
  let at = 0;
  for (let i = 0; i < text.length; i += 4) {
    let group = 0;
    for (let j = 0; j < 4; j++) group = (group << 6) | Math.max(0, ALPHABET.indexOf(text.charAt(i + j)));
    for (const shift of [16, 8, 0]) {
      if (at < out.length) out[at++] = (group >> shift) & 255;
    }
  }
  if (toBase64(out) !== text) throw new Error('not canonical base64');
  return out;
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Derives the item's AES-256-GCM key from its discovery token (PBKDF2-SHA-256). */
export async function deriveKey(token: string, salt: Uint8Array, iterations: number): Promise<KeyLike> {
  const material = await subtle().importKey('raw', utf8Encode(token), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptBytes(key: KeyLike, iv: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, plaintext));
}

/** Rejects when the key is wrong or any byte of the ciphertext, tag or IV was changed. */
export async function decryptBytes(key: KeyLike, iv: Uint8Array, ciphertext: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv }, key, ciphertext));
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return toHex(new Uint8Array(await subtle().digest('SHA-256', bytes)));
}
