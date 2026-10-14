# ADR 0002 — Sealed content: secrets that are not readable in the source

- **Status:** accepted. Founder decision of 14 October 2026: lore and secrets stay out of the
  public repository, and easter eggs must not be readable in the site's JavaScript.
- **Relates to:** AGENTS.md #12, ADR 0001.

## Context

Chambers are full of things to find: memos, secrets and the payoffs of optional side quests. The
repository will be public, and a static site ships its JavaScript to every visitor. Plain strings
in the source or the bundle would give every secret away to anyone who reads either.

## Decision

Discoverable content is **sealed**: encrypted with a key that only its discovery produces.

- **Plaintext lives only in the private design repository**, one JSON file per item, under
  `content/<chamber>/`. It is the source of truth and is never committed here.
- **Sealing is a maintainer step:** `pnpm seal` with `UNHELD_LORE_DIR` pointing at the private
  repository. It:
  - validates every item against the same content rules as public copy;
  - encrypts each item with AES-256-GCM, under a key derived from its discovery token with
    PBKDF2-SHA-256 (100,000 iterations, a random 16-byte salt per item, a random 12-byte IV per
    sealing);
  - writes `packages/engine/src/sealed/<chamber>.sealed.json`.

  Only ciphertext, salts, IVs and a SHA-256 digest of each item's canonical plaintext are
  committed.
- **At runtime** a chamber's state machine produces an item's discovery token when the visitor
  finds it (opening the drawer, listening at the window, waiting without stamping), and
  `openSealed` decrypts the item in the browser with WebCrypto. A wrong token fails
  authentication and returns nothing. DOM and text-mode equivalents produce the same tokens.
- **Public tests never contain plaintext.** They prove that each in-code token opens its item by
  comparing the decrypted item's digest with the committed digest. The maintainer's sealing run
  checks the plaintext against the content rules.
- **Copy that is not discoverable stays public:** the machine's replies, Memo 001, labels and
  captions for ordinary objects.

## Threat model

Sealing stops anyone from reading secrets in the repository, in a diff or in the shipped
JavaScript. The discovery tokens are necessarily in the public code, so a determined person who
reverse-engineers the chamber logic can still derive keys and decrypt items, as with any game's
data files. Sealing is meant to keep discovery as the normal way in, not to be cryptographically
secret against that effort.

## Alternatives rejected

- **Private content injected at build time.** The plaintext would ship in the bundle anyway.
- **A server that reveals secrets.** It breaks the static, no-network design (`connect-src 'none'`).
- **Plaintext in the repository.** Rejected by the founder.

## Verification

- Unit tests seal and open sample items, reject wrong tokens and tampered ciphertext, and prove
  that every committed sealed item opens with its in-code token (by digest).
- `check:public --release` scans the tree and history against the private lore markers; sealed
  files carry none.
