// glTF-Transform, sharp and meshoptimizer for the build scripts.
//
// The repository's only direct dependency is @gltf-transform/cli (a root dev dependency). Its own
// dependencies (core, extensions, functions, sharp, meshoptimizer) are installed next to it by
// pnpm but are not visible from the repository root, so they are resolved from the CLI package's
// own location. This adds no dependency; it reads the ones the lockfile already pins.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './util.mjs';

const cliPackageJson = realpathSync(path.join(REPO_ROOT, 'node_modules', '@gltf-transform', 'cli', 'package.json'));
const requireFromCli = createRequire(cliPackageJson);

export const core = requireFromCli('@gltf-transform/core');
export const extensions = requireFromCli('@gltf-transform/extensions');
export const functions = requireFromCli('@gltf-transform/functions');
export const sharp = requireFromCli('sharp');
export const { MeshoptSimplifier } = await import(pathToFileURL(requireFromCli.resolve('meshoptimizer')).href);

/** The version of an installed package, found by walking up from its entry point (not every package exports its package.json). */
function versionOf(name) {
  let dir = path.dirname(requireFromCli.resolve(name));
  while (!existsSync(path.join(dir, 'package.json')) || JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')).name !== name) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`cannot find the package.json of ${name}`);
    dir = parent;
  }
  return JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
}

export const versions = { gltfTransform: versionOf('@gltf-transform/core'), sharp: versionOf('sharp') };
