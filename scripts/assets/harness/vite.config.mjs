// Builds the asset harness page (apps/web/src/assets/harness) on its own, never as part of the app.
//   pnpm --filter @tqw/web exec vite build --config ../../scripts/assets/harness/vite.config.mjs
// Output: .asset-cache/harness-dist (gitignored). scripts/assets/harness/serve.mjs serves it under the
// app's real Content-Security-Policy for the proof and the contact sheets.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export default {
  root: path.join(repo, 'apps', 'web', 'src', 'assets', 'harness'),
  base: './',
  build: { outDir: path.join(repo, '.asset-cache', 'harness-dist'), emptyOutDir: true, target: 'es2022', sourcemap: false },
  server: { host: '127.0.0.1', port: 5180, strictPort: true },
};
