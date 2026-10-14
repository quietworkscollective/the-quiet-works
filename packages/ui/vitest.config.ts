import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // styles.test.ts reads styles.css as text (`?raw`); Vitest blanks CSS files unless asked not to.
    css: { include: [/styles\.css/] },
  },
});
