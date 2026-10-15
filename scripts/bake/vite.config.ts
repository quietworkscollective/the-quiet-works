import app from '../../apps/web/vite.config.ts';

// Forward the app config's complete typed argument tuple, including its environment.
export default async (...args: Parameters<typeof app>) => {
  const config = await app(...args);
  return { ...config, server: { ...config.server, hmr: false } };
};
