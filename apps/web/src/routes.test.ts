import { describe, expect, it } from 'vitest';
import { parseRoute } from './routes.ts';

describe('public chamber routes', () => {
  it.each(['/the-exchange', '/outline-room'])('%s opens in development', (path) => {
    expect(parseRoute(path, () => true)).toMatchObject({ kind: 'chamber' });
  });

  it.each(['/the-exchange', '/outline-room'])('%s is not found in production until its room is approved', (path) => {
    expect(parseRoute(path, () => false)).toEqual({ kind: 'page', page: 'not-found' });
  });
});

// Authored fixtures retain known sealed routes so the spine can present their corridor doors.
describe('authored sealed chamber routes', () => {
  it.each(['/tomorrow-engine', '/great-atrium'])('%s reaches the authored spine route', path => {
    expect(parseRoute(path)).toMatchObject({ kind: 'chamber' });
  });

  it.each(['/tomorrow-engine', '/great-atrium', '/apartment'])('%s still rejects an explicitly closed production route', path => {
    expect(parseRoute(path, () => false)).toEqual({ kind: 'page', page: 'not-found' });
  });
});
