import { chamberBySlug, chamberById, type PageId, type Route } from '@tqw/engine';

/**
 * URL <-> spine route. Paths: `/`, `/<chamber-slug>`, `/about`, `/credits`, `/privacy`. Anything
 * else is the not-found page. The `mode=text` query survives every navigation, so a visitor who
 * chose text mode keeps it.
 */
const PAGE_PATHS: Record<Exclude<PageId, 'not-found'>, string> = {
  about: '/about',
  credits: '/credits',
  privacy: '/privacy',
};

export function parseRoute(pathname: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return { kind: 'home' };
  for (const [page, pagePath] of Object.entries(PAGE_PATHS)) {
    if (path === pagePath) return { kind: 'page', page: page as PageId };
  }
  const segment = path.slice(1);
  const chamber = segment.includes('/') ? undefined : chamberBySlug(segment);
  return chamber ? { kind: 'chamber', id: chamber.id } : { kind: 'page', page: 'not-found' };
}

/** The path for `route`. The not-found page has no path of its own: it keeps the address it was given. */
export function pathFor(route: Route, current: string): string {
  switch (route.kind) {
    case 'home':
      return '/';
    case 'chamber':
      return `/${chamberById(route.id).slug}`;
    case 'page':
      return route.page === 'not-found' ? current : PAGE_PATHS[route.page];
  }
}

/** `pathFor` plus the current query string (which carries `mode=text`). */
export function hrefFor(route: Route, location: Pick<Location, 'pathname' | 'search'>): string {
  return `${pathFor(route, location.pathname)}${location.search}`;
}
