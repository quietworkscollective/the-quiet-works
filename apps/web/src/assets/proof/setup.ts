import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..', '..', '..');
const repoRoot = path.resolve(webRoot, '..', '..');

/** Builds the app (for its real policy) and the harness, then serves the harness under that policy. */
export default async function setup(): Promise<() => Promise<void>> {
  const port = Number(process.env.TQW_ASSET_PORT ?? 5180);
  if (process.env.TQW_SKIP_APP_BUILD !== '1') execFileSync('pnpm', ['build'], { cwd: webRoot, stdio: 'inherit' });
  execFileSync('pnpm', ['exec', 'vite', 'build', '--config', path.join(repoRoot, 'scripts', 'assets', 'harness', 'vite.config.mjs')], { cwd: webRoot, stdio: 'inherit' });
  const { startServer } = (await import(pathToFileURL(path.join(repoRoot, 'scripts', 'assets', 'harness', 'serve.mjs')).href)) as {
    startServer: (options: { port: number }) => Promise<{ close: (done: () => void) => void }>;
  };
  const server = await startServer({ port });
  return () => new Promise<void>((resolve) => server.close(() => resolve()));
}
