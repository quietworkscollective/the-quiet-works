/**
 * Public identity. UNHELD is the public project; The Quiet Works is the 3D world inside it;
 * HE'S FINE. is Chapter Zero. Single source for page metadata (injected into index.html by
 * vite.config.ts) and the on-screen wordmark.
 */
export const SITE = {
  name: 'UNHELD',
  tagline: 'A space for everything we carry.',
  url: 'https://unheld.space/',
  /** The maker's own site: linked from the About page, navigation only, never fetched. */
  authorUrl: 'https://dalugoda.com/',
  world: 'The Quiet Works',
  chapter: "HE'S FINE.",
  room: 'Certification Office',
} as const;
