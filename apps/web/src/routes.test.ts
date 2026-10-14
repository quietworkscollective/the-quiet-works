import { describe, expect, it } from 'vitest';
import { hrefFor, parseRoute, pathFor } from './routes.ts';

describe('routes', () => {
  it('parses the home, chamber and page paths, tolerating a trailing slash', () => {
    expect(parseRoute('/')).toEqual({ kind: 'home' });
    expect(parseRoute('')).toEqual({ kind: 'home' });
    expect(parseRoute('/certification-office')).toEqual({ kind: 'chamber', id: 'certification-office' });
    expect(parseRoute('/certification-office/')).toEqual({ kind: 'chamber', id: 'certification-office' });
    expect(parseRoute('/tomorrow-engine')).toEqual({ kind: 'chamber', id: 'tomorrow-engine' });
    expect(parseRoute('/about')).toEqual({ kind: 'page', page: 'about' });
    expect(parseRoute('/privacy')).toEqual({ kind: 'page', page: 'privacy' });
  });

  it('sends unknown and nested paths to the not-found page', () => {
    expect(parseRoute('/nowhere')).toEqual({ kind: 'page', page: 'not-found' });
    expect(parseRoute('/certification-office/extra')).toEqual({ kind: 'page', page: 'not-found' });
    expect(parseRoute('/not-found')).toEqual({ kind: 'page', page: 'not-found' });
  });

  it('round-trips every route it can name', () => {
    for (const path of ['/', '/certification-office', '/apartment', '/about', '/credits', '/privacy']) {
      expect(pathFor(parseRoute(path), '/x')).toBe(path);
    }
  });

  it('keeps an unknown address for the not-found page, and the query everywhere', () => {
    expect(pathFor({ kind: 'page', page: 'not-found' }, '/nowhere')).toBe('/nowhere');
    expect(hrefFor({ kind: 'chamber', id: 'certification-office' }, { pathname: '/', search: '?mode=text' })).toBe(
      '/certification-office?mode=text',
    );
  });
});
