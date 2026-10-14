// Shared helpers for the asset scripts: paths, hashing, a polite downloader.
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const SCRIPTS_DIR = path.join(REPO_ROOT, 'scripts', 'assets');
export const CACHE_DIR = path.join(REPO_ROOT, '.asset-cache');
export const ASSETS_DIR = path.join(REPO_ROOT, 'apps', 'web', 'src', 'assets');
export const PLAN_PATH = path.join(SCRIPTS_DIR, 'plan.json');
export const LOCK_PATH = path.join(SCRIPTS_DIR, 'sources.lock.json');

/** Poly Haven asks API clients for a unique User-Agent; the same string is sent to every host. */
export const USER_AGENT = 'unheld-asset-fetch/1.0';

export function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

export function md5File(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('md5');
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

/** Where a pinned source file lives in the (gitignored) download cache. */
export function cachePath(assetId, relativePath) {
  const target = path.join(CACHE_DIR, assetId, relativePath);
  const relative = path.relative(path.join(CACHE_DIR, assetId), target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`refusing a cache path outside the asset folder: ${relativePath}`);
  return target;
}

export async function getJson(url) {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  if (!response.ok) throw new Error(`GET ${url} -> HTTP ${response.status}`);
  return response.json();
}

export async function getText(url) {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' });
  if (!response.ok) throw new Error(`GET ${url} -> HTTP ${response.status}`);
  return response.text();
}

/** Downloads to `destination` through a temporary name, so an interrupted run never leaves a half file. */
export async function download(url, destination, attempts = 3) {
  mkdirSync(path.dirname(destination), { recursive: true });
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const partial = `${destination}.part`;
    try {
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      writeFileSync(partial, Buffer.from(await response.arrayBuffer()));
      renameSync(partial, destination);
      return statSync(destination).size;
    } catch (error) {
      lastError = error;
      rmSync(partial, { force: true });
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    }
  }
  throw new Error(`download failed for ${url}: ${lastError?.message ?? lastError}`);
}

export function fileExists(file) {
  return existsSync(file) && statSync(file).isFile();
}
