/**
 * Sealed content (ADR 0002). Contract shared by the sealing script, the runtime opener and the
 * chambers. Plaintext items live only in the private design repository; this repository holds
 * their ciphertext.
 */

/** A discoverable piece of content, as written in the private design repository. */
export interface SealedItem {
  /** Stable id, unique within its chamber, e.g. `office-07`. Never renamed once sealed. */
  id: string;
  kind: 'memo' | 'secret' | 'payoff' | 'line';
  title?: string;
  /** Memos: the "from" line. */
  from?: string;
  /** Paragraphs, in order. */
  body: readonly string[];
  /** The fiction or provenance label shown with it (AGENTS.md #2), when it needs one. */
  label?: string;
  /** Chamber-specific small fields (a caption, a plate inscription). Plain strings only. */
  fields?: Readonly<Record<string, string>>;
}

/** One sealed item as committed: everything here is safe to publish. */
export interface SealedEntry {
  /** base64 of the 16-byte PBKDF2 salt. */
  salt: string;
  /** base64 of the 12-byte AES-GCM IV. */
  iv: string;
  /** base64 of the AES-256-GCM ciphertext with its tag. */
  data: string;
  /** Hex SHA-256 of the item's canonical JSON (keys sorted), for tests that must not see plaintext. */
  digest: string;
}

/** `packages/engine/src/sealed/<chamber>.sealed.json`. */
export interface SealedFile {
  format: 1;
  chamber: string;
  /** Key derivation parameters, recorded so old files stay openable if defaults change. */
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number };
  items: Readonly<Record<string, SealedEntry>>;
}

export const SEAL_ITERATIONS = 100_000;
