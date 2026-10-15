import {
  CanvasTexture,
  Color,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
} from 'three';

/**
 * The corridor's scanned surfaces (CC0, apps/web/src/assets, see THIRD_PARTY.md): the wall plaster,
 * the terrazzo, the oak panelling, the painted timber of the doors, the enamelled steel and the
 * brass. Every material the world makes from a scan is defined in materials.ts; this file is only
 * how a scan's maps arrive.
 *
 * The maps are loaded straight from the library's files, one dynamic import each, and NOT through
 * `surface()` or the catalogue. The catalogue's generated registry names every file in the
 * library, so the first module to import it makes the build emit all of them (models inlined as
 * data URLs, every surface map): 10.9 MB in dist where the corridor itself needs 2.3 MB plus the
 * scans, over the asset audit's 8 MB ceiling. Importing a file by name ships only that file.
 * What the catalogue knows about a scan (its tile size, its metalness) is repeated in `SCANS`, and
 * scanned.test.ts reads both and fails if they ever differ; the same test holds the files that are
 * shipped to `BUDGET_BYTES.corridorSurfaces`.
 *
 * A scan is asked for only the maps it has something to say in. The scans' own statistics decide:
 * a normal map whose slope never leaves 0.5 +- 0.005 (terrazzo, oak, enamel, brass) and an ORM
 * map whose roughness channel is flat (plaster, painted timber, enamel, brass) would cost texture
 * memory and download for nothing, so they are not shipped, and the material takes the scan's
 * mean roughness instead. The ORM's occlusion channel is 1.0 throughout, so it is never used.
 *
 * Maps are decoded by an <img> (TextureLoader), never fetched: the site's policy is connect-src
 * 'none'.
 */

export type ScanId = 'plaster-worn' | 'terrazzo' | 'oak-panelling' | 'painted-timber' | 'enamel-steel' | 'brass';

export type ScanMap = 'albedo' | 'normal' | 'orm';

export interface ScanSpec {
  /** Real-world edge of one repeat, metres: the world writes metre UVs, so repeat is 1 / tile. */
  readonly tile: number;
  /** A metal's metalness; everything else is 0. */
  readonly metalness: number;
  /** The maps the full tier loads (the lite tier loads the albedo only). */
  readonly maps: readonly ScanMap[];
  /** Longest edge of the albedo in every tier, where the scan is smooth enough not to need more. */
  readonly albedoEdge?: number;
  /** How much of the albedo's contrast to keep, 0 to 1: a grade for a scan busier than the room wants. */
  readonly contrast?: number;
  /**
   * Turn the maps a quarter turn in UV, for a scan whose grain runs along v: the world's builders
   * author grain along u (and set `uv.swap` on the parts that run the other way).
   */
  readonly quarterTurn?: boolean;
}

export const SCANS: Readonly<Record<ScanId, ScanSpec>> = {
  'plaster-worn': { tile: 4, metalness: 0, maps: ['albedo', 'normal'] },
  terrazzo: { tile: 1.2, metalness: 0, maps: ['albedo', 'orm'], contrast: 0.6 },
  // The scan's grain runs up the image (along v); the builders' convention is grain along u.
  'oak-panelling': { tile: 1.83, metalness: 0, maps: ['albedo', 'orm'], quarterTurn: true },
  'painted-timber': { tile: 1, metalness: 0, maps: ['albedo', 'normal'] },
  'enamel-steel': { tile: 1, metalness: 0, maps: ['albedo'] },
  // Smooth to within 2 % of its mean: a quarter of the texels carry all of it.
  brass: { tile: 0.5, metalness: 1, maps: ['albedo'], albedoEdge: 256 },
};

/** Every id the corridor draws from the library, for the budget. */
export const CORRIDOR_SCAN_IDS = Object.keys(SCANS) as ScanId[];

type Loader = () => Promise<string>;

/** One import per file the corridor uses, so the build ships these and nothing else of the library. */
export const SCAN_FILES: Readonly<Record<ScanId, Partial<Record<ScanMap, Loader>>>> = {
  'plaster-worn': {
    albedo: async () => (await import('../../assets/surfaces/plaster-worn-albedo.webp?url')).default,
    normal: async () => (await import('../../assets/surfaces/plaster-worn-normal.webp?url')).default,
  },
  terrazzo: {
    albedo: async () => (await import('../../assets/surfaces/terrazzo-albedo.webp?url')).default,
    orm: async () => (await import('../../assets/surfaces/terrazzo-orm.webp?url')).default,
  },
  'oak-panelling': {
    albedo: async () => (await import('../../assets/surfaces/oak-panelling-albedo.webp?url')).default,
    orm: async () => (await import('../../assets/surfaces/oak-panelling-orm.webp?url')).default,
  },
  'painted-timber': {
    albedo: async () => (await import('../../assets/surfaces/painted-timber-albedo.webp?url')).default,
    normal: async () => (await import('../../assets/surfaces/painted-timber-normal.webp?url')).default,
  },
  'enamel-steel': {
    albedo: async () => (await import('../../assets/surfaces/enamel-steel-albedo.webp?url')).default,
  },
  brass: {
    albedo: async () => (await import('../../assets/surfaces/brass-albedo.webp?url')).default,
  },
};

export interface ScanSet {
  readonly albedo: Texture;
  /** Absent where the scan has no relief worth shipping, and in the lite tier. */
  readonly normal?: Texture;
  /** Roughness in the green channel. Absent where the scan's roughness is flat, and in the lite tier. */
  readonly orm?: Texture;
  /** The albedo's mean in linear light, per channel: what a material divides out to land on its art-direction colour. */
  readonly mean: readonly [number, number, number];
}

export interface ScanOptions {
  /** Software renderers: albedo only, at `edge`. */
  readonly lite: boolean;
  /** Phones: the albedo is shrunk to `edge`; the data maps are already at most 512. */
  readonly coarse: boolean;
  readonly anisotropy: number;
  /** The albedo edge in the lite and coarse tiers. */
  readonly edge?: number;
}

type Pixels = CanvasImageSource & { width: number; height: number };

const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function loadTexture(loader: TextureLoader, url: string): Promise<Texture> {
  return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
}

/** Mean of an image in linear light, from a 64 x 64 smoothed copy: close enough that detail never shifts a colour. */
export function meanLinear(image: Pixels): [number, number, number] {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [1, 1, 1];
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += srgbToLinear((data[i] ?? 0) / 255);
    g += srgbToLinear((data[i + 1] ?? 0) / 255);
    b += srgbToLinear((data[i + 2] ?? 0) / 255);
  }
  const n = size * size;
  return [r / n, g / n, b / n];
}

/**
 * The material colour (linear) that averages to `hex` once a texture whose linear mean is `mean` is
 * multiplied in: the art direction's colours stay the colours, and the scan only adds detail. A
 * channel mean is floored so a near-black scan cannot divide by zero.
 */
export function gradedColour(hex: string, mean: readonly [number, number, number]): Color {
  const c = new Color(hex);
  return new Color(c.r / Math.max(mean[0], 1e-3), c.g / Math.max(mean[1], 1e-3), c.b / Math.max(mean[2], 1e-3));
}

/**
 * The albedo as the tier wants it: drawn no larger than `edge` pixels on its long side, and with
 * its contrast pulled `contrast` of the way from its own mean (1 leaves it alone). The grade is in
 * the image's encoded values, per channel, so a hue stays the hue.
 */
function prepared(source: Texture, edge: number, contrast: number): Texture {
  const image = source.image as Pixels;
  const long = Math.max(image.width, image.height);
  if (long <= edge && contrast >= 1) return source;
  const scale = Math.min(1, edge / long);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return source;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  if (contrast < 1) {
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = pixels.data;
    const sum = [0, 0, 0];
    for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c += 1) sum[c] = (sum[c] ?? 0) + (data[i + c] ?? 0);
    const n = data.length / 4;
    const mean = sum.map((v) => v / n);
    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c += 1) {
        const m = mean[c] ?? 0;
        data[i + c] = Math.round(m + ((data[i + c] ?? 0) - m) * contrast);
      }
    }
    ctx.putImageData(pixels, 0, 0);
  }
  const out = new CanvasTexture(canvas);
  out.colorSpace = source.colorSpace;
  source.dispose();
  return out;
}

function configure(texture: Texture, repeat: number, anisotropy: number, quarterTurn: boolean): Texture {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  if (quarterTurn) {
    texture.center.set(0.5, 0.5);
    texture.rotation = Math.PI / 2;
  }
  texture.anisotropy = anisotropy;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * One scan's maps, configured for metre UVs (repeat is 1 over the tile). The textures belong to
 * the caller, who disposes them with the material that holds them.
 */
export async function loadScan(id: ScanId, options: ScanOptions): Promise<ScanSet> {
  const spec = SCANS[id];
  const files = SCAN_FILES[id];
  const loader = new TextureLoader();
  const repeat = 1 / spec.tile;
  const wanted = (map: ScanMap): Loader | undefined => (options.lite && map !== 'albedo' ? undefined : spec.maps.includes(map) ? files[map] : undefined);
  const albedoFile = files.albedo;
  if (!albedoFile) throw new Error(`scan ${id} has no albedo`);
  const [albedoUrl, normalUrl, ormUrl] = await Promise.all([albedoFile(), wanted('normal')?.(), wanted('orm')?.()]);
  const [rawAlbedo, normal, orm] = await Promise.all([
    loadTexture(loader, albedoUrl),
    normalUrl ? loadTexture(loader, normalUrl) : undefined,
    ormUrl ? loadTexture(loader, ormUrl) : undefined,
  ]);
  rawAlbedo.colorSpace = SRGBColorSpace;
  const edge = Math.min(options.lite || options.coarse ? (options.edge ?? 512) : Number.POSITIVE_INFINITY, spec.albedoEdge ?? Number.POSITIVE_INFINITY);
  const albedo = prepared(rawAlbedo, edge, spec.contrast ?? 1);
  const mean = meanLinear(albedo.image as Pixels);
  const turn = spec.quarterTurn === true;
  return {
    albedo: configure(albedo, repeat, options.anisotropy, turn),
    ...(normal ? { normal: configure(normal, repeat, options.anisotropy, turn) } : {}),
    ...(orm ? { orm: configure(orm, repeat, options.anisotropy, turn) } : {}),
    mean,
  };
}
