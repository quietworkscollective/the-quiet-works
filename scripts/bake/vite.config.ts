import app from '../../apps/web/vite.config.ts';

export default { ...app, server: { ...app.server, hmr: false } };
