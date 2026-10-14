import { canonicalJson } from './canonical.ts';
import { parseEntry, parseItem, parseKdf } from './source.ts';
import type { SealedFile, SealedItem } from './types.ts';
import { decryptBytes, deriveKey, fromBase64, sha256Hex, utf8Decode, utf8Encode } from './webcrypto.ts';

export * from './types.ts';
/** Validates a committed `<chamber>.sealed.json` (a JSON import is typed loosely) before it is opened. */
export { parseSealedFile } from './source.ts';

/**
 * Opens one sealed item with the discovery token its chamber produced. Resolves to null when the
 * item does not exist or the token is wrong (authentication fails); never throws for those, nor
 * for tampered or malformed data, nor where WebCrypto is unavailable: sealed content is an
 * optional extra, so a chamber that gets null simply has nothing to reveal.
 */
export async function openSealed(file: SealedFile, id: string, token: string): Promise<SealedItem | null> {
  try {
    if (file.format !== 1) return null;
    const iterations = parseKdf(file.kdf);
    if (!Object.hasOwn(file.items, id)) return null;
    const entry = parseEntry(file.items[id], id);
    const key = await deriveKey(token, fromBase64(entry.salt), iterations);
    const plaintext = await decryptBytes(key, fromBase64(entry.iv), fromBase64(entry.data));
    const item = parseItem(JSON.parse(utf8Decode(plaintext)));
    // An entry moved under another id still authenticates; it must not pass for that id.
    return item.id === id ? item : null;
  } catch {
    return null;
  }
}

/** Canonical JSON (keys sorted at every level) and its hex SHA-256: the committed digest. */
export async function digestItem(item: SealedItem): Promise<string> {
  return sha256Hex(utf8Encode(canonicalJson(item)));
}
