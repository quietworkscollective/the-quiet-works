// A minimal ZIP reader (stored and deflate entries, no ZIP64, no encryption): enough for the
// ambientCG material archives, so the build needs no unzip binary and no extra dependency.
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

/** Returns [{ name, size, read() }] for every file entry in the archive. */
export function openZip(file) {
  const buffer = readFileSync(file);
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65_557); i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error(`${file}: not a ZIP archive (no end-of-central-directory record)`);
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const entries = [];
  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) throw new Error(`${file}: corrupt central directory`);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const size = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith('/')) continue;
    entries.push({
      name,
      size,
      read() {
        if (buffer.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) throw new Error(`${file}: corrupt local header for ${name}`);
        const localName = buffer.readUInt16LE(localOffset + 26);
        const localExtra = buffer.readUInt16LE(localOffset + 28);
        const start = localOffset + 30 + localName + localExtra;
        const data = buffer.subarray(start, start + compressedSize);
        if (method === 0) return Buffer.from(data);
        if (method === 8) return inflateRawSync(data);
        throw new Error(`${file}: ${name} uses unsupported compression method ${method}`);
      },
    });
  }
  return entries;
}
