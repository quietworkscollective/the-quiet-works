import { inflateSync } from 'node:zlib';

/**
 * A minimal PNG reader for tests that need to know what colour a screenshot really holds. It
 * handles what Chromium writes: 8-bit RGB or RGBA, no interlacing. No dependency, so the lockfile
 * stays as it is.
 */
export interface Raster {
  width: number;
  height: number;
  /** The colour of one pixel, 0-255 per channel. */
  at(x: number, y: number): readonly [number, number, number];
}

const SIGNATURE = '89504e470d0a1a0a';

export function decodePng(file: Buffer): Raster {
  if (file.subarray(0, 8).toString('hex') !== SIGNATURE) throw new Error('not a PNG');
  let width = 0;
  let height = 0;
  let channels = 0;
  const data: Buffer[] = [];
  for (let offset = 8; offset < file.length; ) {
    const length = file.readUInt32BE(offset);
    const type = file.toString('ascii', offset + 4, offset + 8);
    const body = file.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const [depth, colourType, , , interlace] = [body[8], body[9], body[10], body[11], body[12]];
      if (depth !== 8 || interlace !== 0 || (colourType !== 2 && colourType !== 6)) {
        throw new Error(`unsupported PNG (depth ${depth}, colour type ${colourType}, interlace ${interlace})`);
      }
      channels = colourType === 6 ? 4 : 3;
    } else if (type === 'IDAT') {
      data.push(body);
    }
    offset += 12 + length;
  }

  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i += 1) {
      const left = i >= channels ? pixels[y * stride + i - channels]! : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + i]! : 0;
      const upLeft = y > 0 && i >= channels ? pixels[(y - 1) * stride + i - channels]! : 0;
      let value = row[i]!;
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upLeft;
        const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      pixels[y * stride + i] = value & 255;
    }
  }

  return {
    width,
    height,
    at(x, y) {
      const i = (Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))) * channels;
      return [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!];
    },
  };
}

/** WCAG 2.x relative luminance. */
export function luminance([r, g, b]: readonly [number, number, number]): number {
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `rgb(r, g, b)` or `rgba(r, g, b, a)` from a computed style, as three channels. */
export function parseColour(value: string): readonly [number, number, number] {
  const match = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(value);
  if (!match) throw new Error(`cannot read colour ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}
