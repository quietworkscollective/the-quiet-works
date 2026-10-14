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
