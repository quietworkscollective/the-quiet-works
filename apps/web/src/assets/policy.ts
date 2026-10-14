// The rules every shipped asset is held to. Plain constants with no imports, so the build scripts
// (run by Node) and the tests and runtime (bundled by Vite) read the same numbers.

/** Licences that may ship. CC0 first; CC BY only with the exact attribution recorded in the manifest. */
export const LICENCES = {
  'CC0-1.0': {
    name: 'CC0 1.0 Universal',
    url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attributionRequired: false,
  },
  'CC-BY-4.0': {
    name: 'Creative Commons Attribution 4.0 International',
    url: 'https://creativecommons.org/licenses/by/4.0/',
    attributionRequired: true,
  },
} as const;

export type LicenceId = keyof typeof LICENCES;

export type Tier = 'hero' | 'prop';

/** Triangle caps (art consult 6 and the lane brief): hero furniture 15k, small props 3k. */
export const TRIANGLE_CAP: Record<Tier, number> = { hero: 15_000, prop: 3_000 };

/** Texture edge in pixels: 1K by default, 512 for small props, 2K only for a lazily loaded hero. */
export const TEXTURE_EDGE = { prop: 512, standard: 1024, heroLazy: 2048 } as const;

/** `pnpm check:public` rejects any file over this size. */
export const FILE_CAP_BYTES = 5 * 1024 * 1024;

/** The committed library, models and surfaces together, stays under this. */
export const LIBRARY_CAP_BYTES = 15 * 1024 * 1024;

/**
 * Compressed-transfer allowances. Megabytes are 10^6 bytes, the stricter reading the asset audit
 * also uses.
 */
export const BUDGET_BYTES = {
  /** Shared surfaces in the corridor's initial download (art consult 6's allocation). */
  corridorSurfaces: 950_000,
  /** The Office's lazily loaded set. */
  officeLazy: 3_000_000,
} as const;
