import { createElement as h, Fragment, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ABOUT,
  AUTHOR,
  CHAMBERS,
  CREDITS,
  FOOTER_COPY,
  HERO_COPY,
  PAGE_NAV,
  PRIVACY,
  TEXT_MODE_CORRIDOR,
  TEXT_MODE_NOTICE,
  TEXT_MODE_NOTICE_CORRIDOR,
  TEXT_MODE_SCENE,
  THIRD_PARTY_COPY,
  type ChamberEntry,
  type PageId,
} from '@tqw/engine';
import { publicChambers } from '../../../packages/ui/src/spine/chamberCopy.ts';
import type { CreditGroup } from './credits/groupCredits.ts';
import { SITE } from './site.ts';

const REPOSITORY = 'https://github.com/quietworkscollective/the-quiet-works';
const SHARE_IMAGE = '/share-unheld-1200x630.jpg';
const AGENTS_PAGE = {
  title: 'Agents',
  body: [
    ABOUT.body[0] as string,
    'The Quiet Works is its immersive 3D world. Read the landing and chamber descriptions in text mode or use the Markdown pages linked below.',
    'Contribution text must be fictional. Never present invented words as real testimony or impersonate a real person. Every contribution receives human review; nothing is published automatically.',
    'Agent-made work needs a named human or organisation to grant its licence and carries the machine-made mark. Secrets, private lore, credentials, personal testimony and executable content are not accepted.',
    'An operator may propose a room or contribution through public GitHub. A room-manifest format remains proposed.',
  ],
} as const;
export interface PublicRoute {
  path: string;
  markdownPath: string;
  key: 'home' | 'agents' | 'licences' | PageId | `chamber:${string}`;
  title: string;
  description: string;
  /** A room not yet open: a short page that stays reachable but is kept out of search indexes. */
  noindex?: boolean;
}

export interface RouteMetadata {
  title: string;
  description: string;
  canonical: string;
  markdown: string;
  image: string;
  imageAlt: string;
  robots: 'index, follow' | 'noindex, follow';
}

type InlinePart = string | { text: string; href: string };
type StaticBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'paragraph'; parts: readonly InlinePart[] }
  | { kind: 'link'; text: string; href: string }
  | { kind: 'doors'; selectedPath?: string; doors: readonly ChamberEntry[] }
  | { kind: 'credits'; groups: readonly CreditGroup[] };

interface StaticDocument {
  title: string;
  blocks: readonly StaticBlock[];
}

const chamberDescription = (chamber: ChamberEntry): string => chamber.doorDescription;

export const UNHELD_DESCRIPTION = ABOUT.body[0] as string;

/** The landing page's own description: what the work is, who made it, and what a visitor does. */
export const HOME_DESCRIPTION =
  'UNHELD is an interactive 3D artwork by Siri (Asiri) Dalugoda about the expectations men carry without saying so. Walk a corridor built around 1910 and open its rooms.';

const PAGE_DESCRIPTIONS = {
  about: UNHELD_DESCRIPTION,
  credits: 'Who made UNHELD and how it is licensed, with its typefaces, software and every third-party asset it uses.',
  privacy: PRIVACY.body[0] as string,
  licences: CREDITS.body[1] as string,
  agents: 'How AI agents may read UNHELD and propose rooms or contributions: house rules, licensing and the public proposal routes.',
} as const;

/** A room's description: where it is, then its door. A room not yet open is only named as closed. */
export function chamberMetaDescription(chamber: ChamberEntry): string {
  return chamber.status === 'open'
    ? `${chamber.title} is a room in The Quiet Works, part of UNHELD. ${chamber.doorDescription}`
    : `${chamber.title} is a door in The Quiet Works, part of UNHELD. It is not yet open.`;
}

/** When each public route last changed, for the sitemap. Update a route's date when its content changes. */
const LAST_MODIFIED: Readonly<Record<string, string>> = {
  '/': '2026-11-08',
  '/about': '2026-11-08',
  '/credits': '2026-11-08',
  '/privacy': '2026-10-16',
  '/licences': '2026-10-16',
  '/agents': '2026-10-16',
  '/certification-office': '2026-10-16',
  '/tomorrow-engine': '2026-11-08',
  '/the-exchange': '2026-11-08',
};
const DEFAULT_LAST_MODIFIED = '2026-11-08';

const SHARE_IMAGE_ALT = 'A lamplit office corridor with mismatched doors receding into haze, under the words UNHELD and A space for everything we carry.';

const homeRoute: PublicRoute = {
  path: '/',
  markdownPath: '/index.md',
  key: 'home',
  title: `${SITE.name} — ${SITE.tagline}`,
  description: HOME_DESCRIPTION,
};

const pageRoutes: readonly PublicRoute[] = [
  homeRoute,
  { path: '/about', markdownPath: '/about.md', key: 'about', title: ABOUT.title, description: PAGE_DESCRIPTIONS.about },
  { path: '/credits', markdownPath: '/credits.md', key: 'credits', title: 'Credits — UNHELD', description: PAGE_DESCRIPTIONS.credits },
  { path: '/privacy', markdownPath: '/privacy.md', key: 'privacy', title: 'Privacy — UNHELD', description: PAGE_DESCRIPTIONS.privacy },
  { path: '/licences', markdownPath: '/licences.md', key: 'licences', title: 'Licences — UNHELD', description: PAGE_DESCRIPTIONS.licences },
  { path: '/agents', markdownPath: '/agents.md', key: 'agents', title: 'Agents — UNHELD', description: PAGE_DESCRIPTIONS.agents },
];

export function publicRoutesFor(chambers: readonly ChamberEntry[] = CHAMBERS, production = false): readonly PublicRoute[] {
  return [
    ...pageRoutes,
    ...publicChambers(chambers, production).map((chamber): PublicRoute => ({
      path: `/${chamber.slug}`,
      markdownPath: `/${chamber.slug}.md`,
      key: `chamber:${chamber.id}`,
      title: `${chamber.title} — ${SITE.world} — ${SITE.name}`,
      description: chamberMetaDescription(chamber),
      ...(chamber.status === 'open' ? {} : { noindex: true }),
    })),
  ];
}

export const PUBLIC_ROUTES: readonly PublicRoute[] = publicRoutesFor();

export function sitemapForChambers(chambers: readonly ChamberEntry[]): string {
  const routes = PUBLIC_ROUTES.filter(route => !route.key.startsWith('chamber:') || chambers.some(room => route.key === `chamber:${room.id}` && room.status === 'open'));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes.map(route => `  <url><loc>${metadataForPath(route.path).canonical}</loc><lastmod>${LAST_MODIFIED[route.path] ?? DEFAULT_LAST_MODIFIED}</lastmod></url>`).join('\n')}\n</urlset>\n`;
}

function normalizedPath(pathname: string): string {
  const pathOnly = pathname.split(/[?#]/, 1)[0] || '/';
  return pathOnly.replace(/\/+$/, '') || '/';
}

function routeForPath(pathname: string, chambers: readonly ChamberEntry[] = CHAMBERS, production = false): PublicRoute {
  const path = normalizedPath(pathname);
  return publicRoutesFor(chambers, production).find((route) => route.path === path) ?? homeRoute;
}

export function metadataForPath(pathname: string, chambers: readonly ChamberEntry[] = CHAMBERS, production = false): RouteMetadata {
  const route = routeForPath(pathname, chambers, production);
  const canonical = new URL(route.path, SITE.url).toString();
  return {
    title: route.title,
    description: route.description,
    canonical,
    markdown: new URL(route.markdownPath, SITE.url).toString(),
    image: new URL(SHARE_IMAGE, SITE.url).toString(),
    imageAlt: SHARE_IMAGE_ALT,
    robots: route.noindex ? 'noindex, follow' : 'index, follow',
  };
}

export function jsonLdForPath(pathname: string, chambers: readonly ChamberEntry[] = CHAMBERS, production = false): { '@context': string; '@graph': Record<string, unknown>[] } {
  const route = routeForPath(pathname, chambers, production);
  const metadata = metadataForPath(pathname, chambers, production);
  const websiteId = new URL('#website', SITE.url).toString();
  const artworkId = new URL('#unheld', SITE.url).toString();
  const authorId = SITE.authorUrl;
  const pageId = `${metadata.canonical}#webpage`;
  const roomId = (chamber: ChamberEntry) => new URL(`/${chamber.slug}#room`, SITE.url).toString();
  const openRooms = publicChambers(chambers, production).filter((chamber) => chamber.status === 'open');
  const pageRoom = openRooms.find((chamber) => route.key === `chamber:${chamber.id}`);
  const licence = 'https://creativecommons.org/licenses/by/4.0/';

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': websiteId,
        url: SITE.url,
        name: SITE.name,
        description: HOME_DESCRIPTION,
        inLanguage: 'en-GB',
        publisher: { '@id': authorId },
      },
      {
        '@type': 'VisualArtwork',
        '@id': artworkId,
        name: SITE.name,
        alternateName: SITE.world,
        url: SITE.url,
        description: UNHELD_DESCRIPTION,
        image: metadata.image,
        artform: 'Interactive browser artwork',
        genre: ['Interactive fiction', 'Browser artwork'],
        inLanguage: 'en-GB',
        datePublished: '2026-10-16',
        license: licence,
        isAccessibleForFree: true,
        accessMode: ['textual', 'visual'],
        accessModeSufficient: ['textual'],
        accessibilityFeature: ['captions', 'textualAlternative'],
        creator: { '@id': authorId },
        isPartOf: { '@id': websiteId },
        hasPart: openRooms.map((chamber) => ({ '@id': roomId(chamber) })),
      },
      ...openRooms.map((chamber) => ({
        '@type': 'CreativeWork',
        '@id': roomId(chamber),
        name: chamber.title,
        url: new URL(`/${chamber.slug}`, SITE.url).toString(),
        description: chamber.doorDescription,
        inLanguage: 'en-GB',
        license: licence,
        isPartOf: { '@id': artworkId },
      })),
      {
        '@type': 'Person',
        '@id': authorId,
        name: 'Siri (Asiri) Dalugoda',
        url: SITE.authorUrl,
      },
      {
        '@type': 'WebPage',
        '@id': pageId,
        url: metadata.canonical,
        name: route.title,
        description: route.description,
        inLanguage: 'en-GB',
        isPartOf: { '@id': websiteId },
        about: { '@id': pageRoom ? roomId(pageRoom) : artworkId },
        author: { '@id': authorId },
      },
    ],
  };
}

function text(value: string): StaticBlock {
  return { kind: 'paragraph', parts: [value] };
}

function splitCreditLabel(copy: string): { label: string; body: string } {
  const separator = copy.indexOf(': ');
  if (separator < 0) return { label: '', body: copy };
  return { label: copy.slice(0, separator + 1), body: copy.slice(separator + 2) };
}

function creditsBlocks(creditGroups: readonly CreditGroup[]): StaticBlock[] {
  const typefaces = splitCreditLabel(CREDITS.body[2] as string);
  const software = splitCreditLabel(CREDITS.body[3] as string);
  const noticeText = 'The full licence texts for everything bundled';
  const noticeStart = software.body.indexOf(noticeText);
  const softwareParagraph: StaticBlock = {
    kind: 'paragraph',
    parts: noticeStart < 0
      ? [software.body]
      : [
        software.body.slice(0, noticeStart),
        { text: noticeText, href: '/third-party-notices.txt' },
        software.body.slice(noticeStart + noticeText.length),
      ],
  };
  return [
    { kind: 'heading', level: 1, text: CREDITS.title },
    { kind: 'heading', level: 2, text: 'Authorship' },
    text(CREDITS.body[0] as string),
    { kind: 'heading', level: 2, text: FOOTER_COPY.licences },
    text(CREDITS.body[1] as string),
    { kind: 'heading', level: 2, text: typefaces.label },
    text(typefaces.body),
    { kind: 'heading', level: 2, text: software.label },
    softwareParagraph,
    { kind: 'heading', level: 2, text: THIRD_PARTY_COPY.heading },
    text(THIRD_PARTY_COPY.intro),
    { kind: 'credits', groups: creditGroups },
    text(THIRD_PARTY_COPY.original),
  ];
}

function link(text_: string, href: string): StaticBlock {
  return { kind: 'link', text: text_, href };
}

function markdownHref(href: string): string {
  return href.startsWith('/') ? new URL(href, SITE.url).toString() : href;
}

function aboutBlocks(): StaticBlock[] {
  const blocks: StaticBlock[] = [{ kind: 'heading', level: 1, text: ABOUT.title }];
  ABOUT.body.forEach((paragraph, index) => {
    if (index === ABOUT.body.length - 1) {
      blocks.push({ kind: 'paragraph', parts: [AUTHOR.line, ' ', { text: AUTHOR.linkLabel, href: SITE.authorUrl }] });
    }
    blocks.push(text(paragraph));
  });
  return blocks;
}

function corridorBlocks(selectedPath?: string, chambers: readonly ChamberEntry[] = CHAMBERS): StaticBlock[] {
  return [
    text(TEXT_MODE_NOTICE_CORRIDOR.chosen),
    { kind: 'heading', level: 2, text: 'The corridor' },
    ...TEXT_MODE_CORRIDOR.map(text),
    { kind: 'doors', ...(selectedPath ? { selectedPath } : {}), doors: chambers },
    link('Read The Quiet Works in text mode', '/?mode=text'),
  ];
}

function pageBlocks(path: string, creditGroups: readonly CreditGroup[], chambers: readonly ChamberEntry[]): StaticDocument {
  const normalized = normalizedPath(path);
  const route = routeForPath(normalized);
  if (route.key === 'home') {
    return {
      title: route.title,
      blocks: [
        { kind: 'heading', level: 1, text: SITE.name },
        text(SITE.tagline),
        text(ABOUT.body[0] as string),
        text(HERO_COPY.newRooms),
        link('About UNHELD', '/about'),
        ...corridorBlocks(undefined, chambers),
      ],
    };
  }
  if (route.key === 'about') return { title: route.title, blocks: aboutBlocks() };
  if (route.key === 'credits') {
    return {
      title: route.title,
      blocks: creditsBlocks(creditGroups),
    };
  }
  if (route.key === 'privacy') {
    return { title: route.title, blocks: [{ kind: 'heading', level: 1, text: PRIVACY.title }, ...PRIVACY.body.map(text)] };
  }
  if (route.key === 'licences') {
    return {
      title: route.title,
      blocks: [
        { kind: 'heading', level: 1, text: FOOTER_COPY.licences },
        ...CREDITS.body.slice(1).map(text),
        link('third-party-notices.txt', '/third-party-notices.txt'),
      ],
    };
  }
  if (route.key === 'agents') {
    return {
      title: route.title,
      blocks: [
        { kind: 'heading', level: 1, text: AGENTS_PAGE.title },
        ...AGENTS_PAGE.body.map(text),
        link('Read the public agent skill', '/skill.md'),
        link('Read the contribution manifest template', `${REPOSITORY}/blob/main/.github/PULL_REQUEST_TEMPLATE/commons-contribution.md`),
        link('Propose a room or other complete experience', `${REPOSITORY}/issues/new?template=room-proposal.yml`),
      ],
    };
  }

  const chamber = chambers.find((entry) => route.key === `chamber:${entry.id}`);
  if (!chamber || chamber.status === 'sealed') {
    return {
      title: route.title,
      blocks: chamber ? [
        { kind: 'heading', level: 1, text: chamber.title },
        text(chamber.doorDescription),
      ] : corridorBlocks(undefined, chambers),
    };
  }

  if (chamber.id === 'certification-office') {
    return {
      title: route.title,
      blocks: [
        { kind: 'heading', level: 1, text: chamber.title },
        text(TEXT_MODE_NOTICE.chosen),
        ...TEXT_MODE_SCENE.map(text),
      ],
    };
  }
  return { title: route.title, blocks: [{ kind: 'heading', level: 1, text: chamber.title }, text(chamberDescription(chamber))] };
}

function readingDocument(pathname: string, creditGroups: readonly CreditGroup[], chambers: readonly ChamberEntry[], production: boolean): StaticDocument {
  const entries = publicChambers(chambers, production);
  const document = pageBlocks(pathname, creditGroups, entries);
  const containsParagraph = (value: string) => document.blocks.some(block => block.kind === 'paragraph' && block.parts.includes(value));
  const blocks: StaticBlock[] = [...document.blocks].filter(block => block.kind !== 'doors');
  if (!containsParagraph(SITE.tagline)) blocks.push(text(SITE.tagline));
  if (!containsParagraph(ABOUT.body[0] as string)) blocks.push(text(ABOUT.body[0] as string));
  blocks.push({ kind: 'doors', selectedPath: normalizedPath(pathname), doors: entries });
  if (!containsParagraph(PRIVACY.body[0] as string)) blocks.push(text(PRIVACY.body[0] as string));
  return { ...document, blocks };
}

function renderInline(parts: readonly InlinePart[]): ReactNode[] {
  return parts.map((part, index) => typeof part === 'string' ? part : h('a', { key: index, href: part.href }, part.text));
}

function renderBlock(block: StaticBlock, key: number): ReactNode {
  switch (block.kind) {
    case 'heading': return h(`h${block.level}`, { key }, block.text);
    case 'paragraph': return h('p', { key }, ...renderInline(block.parts));
    case 'link': return h('p', { key }, h('a', { href: block.href }, block.text));
    case 'doors': return h('nav', { key, 'aria-label': 'Doors' }, h('ul', null, ...block.doors.map(door => {
      const path = `/${door.slug}`;
      return h('li', { key: door.id },
        h('a', { href: path, 'aria-current': block.selectedPath === path ? 'page' : undefined }, `${door.title}, ${door.status === 'open' ? 'open the door' : 'not yet open'}`),
        h('p', null, door.doorDescription));
    })));
    case 'credits': return block.groups.map(group => h('section', { key: group.provider },
      h('h3', null, group.provider), h('ul', null, ...group.items.map((item, index) => h('li', { key: index },
        h('a', { href: item.source }, item.title), `, by ${item.author}, ${item.licence}`)))));
  }
}

export function staticHtmlForPath(pathname: string, creditGroups: readonly CreditGroup[] = [], chambers: readonly ChamberEntry[] = CHAMBERS, production = false): string {
  const route = routeForPath(pathname, chambers, production);
  const document = readingDocument(pathname, creditGroups, chambers, production);
  const readingPage = ['about', 'credits', 'privacy'].includes(route.key);
  const pageLinks = [
    ['about', PAGE_NAV.about, '/about'],
    ['credits', PAGE_NAV.credits, '/credits'],
    ['privacy', PAGE_NAV.privacy, '/privacy'],
  ] as const;
  const staticLinks = [
    ['Licences', '/licences'], ['Agents', '/agents'], ['llms.txt', '/llms.txt'], ['sitemap.xml', '/sitemap.xml'],
  ] as const;
  const navigation = [
    ['UNHELD', '/'], ['About', '/about'], ['Credits', '/credits'], ['Privacy', '/privacy'],
    ['Licences', '/licences'], ['Agents', '/agents'], ['llms.txt', '/llms.txt'], ['sitemap.xml', '/sitemap.xml'],
  ];
  const header = readingPage ? h('header', { className: 'tqw-static-page__header' },
    h('a', { className: 'tqw-static-page__close', href: '/', 'aria-label': PAGE_NAV.close },
      PAGE_NAV.close, ' ', h('span', { 'aria-hidden': 'true' }, '×')),
    h('nav', { 'aria-label': 'Site' }, h('ul', null, ...pageLinks.map(([id, label, href]) =>
      h('li', { key: id }, h('a', { href, ...(route.key === id ? { 'aria-current': 'page' } : {}) }, label)))))) : null;
  const links = readingPage
    ? h('nav', { className: 'tqw-static-page__resources', 'aria-label': 'Site resources' },
      h('ul', null, ...staticLinks.map(([label, href]) => h('li', { key: href }, h('a', { href }, label)))))
    : h('nav', { 'aria-label': 'Site' },
      h('ul', null, ...navigation.map(([label, href]) => h('li', { key: href }, h('a', { href }, label)))));
  return renderToStaticMarkup(h('main', {
    id: 'static-content',
    className: `tqw-static-content${readingPage ? ' tqw-static-content--reading' : ''}`,
    'data-static-route': route.path,
  }, readingPage
    ? h(Fragment, null,
      header,
      h('div', { className: 'tqw-static-page__sheet' }, h('article', null, ...document.blocks.map(renderBlock)), links))
    : h('article', null, ...document.blocks.map(renderBlock)), readingPage ? null : links));
}

function markdownInline(parts: readonly InlinePart[]): string {
  return parts.map((part) => typeof part === 'string' ? part : `[${part.text}](${markdownHref(part.href)})`).join('');
}

function renderBlockMarkdown(block: StaticBlock): string {
  switch (block.kind) {
    case 'heading':
      return `${'#'.repeat(block.level)} ${block.text}`;
    case 'paragraph':
      return markdownInline(block.parts);
    case 'link':
      return `[${block.text}](${markdownHref(block.href)})`;
    case 'doors':
      return block.doors.map((door) => {
        const status = door.status === 'open' ? 'open the door' : 'not yet open';
        return `- [${door.title}, ${status}](${markdownHref(`/${door.slug}`)})\n  ${door.doorDescription}`;
      }).join('\n');
    case 'credits':
      return block.groups.map((group) => `### ${group.provider}\n\n${group.items.map((item) =>
        `- [${item.title}](${item.source}), by ${item.author}, ${item.licence}`,
      ).join('\n')}`).join('\n\n');
  }
}

export function markdownForPath(pathname: string, creditGroups: readonly CreditGroup[] = [], chambers: readonly ChamberEntry[] = CHAMBERS, production = false): string {
  const page = readingDocument(pathname, creditGroups, chambers, production);
  const route = routeForPath(pathname, chambers, production);
  const chamber = chambers.find(entry => route.key === `chamber:${entry.id}`);
  if (production && chamber?.status === 'sealed') return `# ${chamber.title}\n\nNot yet open.\n`;
  // One H1 per page: the route title. A body that opens with its own H1 drops it.
  const blocks = page.blocks[0]?.kind === 'heading' && page.blocks[0].level === 1 ? page.blocks.slice(1) : page.blocks;
  const body = blocks.map(renderBlockMarkdown).filter(Boolean).join('\n\n');
  const siteLinks = `## Site pages\n\n- [About](${new URL('/about.md', SITE.url)})\n- [Credits](${new URL('/credits.md', SITE.url)})\n- [Privacy](${new URL('/privacy.md', SITE.url)})\n- [Agents](${new URL('/agents.md', SITE.url)})\n- [Agent skill](${new URL('/skill.md', SITE.url)})`;
  return `# ${page.title}\n\n${body}\n\n${siteLinks}\n\n[Canonical page](${metadataForPath(route.path).canonical})\n`;
}

function setMeta(target: Document, selector: string, attribute: 'name' | 'property', key: string, value: string): void {
  let element = target.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = target.createElement('meta');
    element.setAttribute(attribute, key);
    target.head.append(element);
  }
  element.content = value;
}

function setLink(target: Document, rel: string, href: string, type?: string): void {
  let element = target.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]${type ? `[type="${type}"]` : ''}`);
  if (!element) {
    element = target.createElement('link');
    element.rel = rel;
    if (type) element.type = type;
    target.head.append(element);
  }
  element.href = href;
}

export function applyRouteMetadata(pathname: string, target: Document = document): void {
  const metadata = metadataForPath(pathname);
  target.title = metadata.title;
  setMeta(target, 'meta[name="description"]', 'name', 'description', metadata.description);
  setMeta(target, 'meta[property="og:site_name"]', 'property', 'og:site_name', SITE.name);
  setMeta(target, 'meta[property="og:title"]', 'property', 'og:title', metadata.title);
  setMeta(target, 'meta[property="og:description"]', 'property', 'og:description', metadata.description);
  setMeta(target, 'meta[property="og:url"]', 'property', 'og:url', metadata.canonical);
  setMeta(target, 'meta[property="og:type"]', 'property', 'og:type', 'website');
  setMeta(target, 'meta[property="og:locale"]', 'property', 'og:locale', 'en_GB');
  setMeta(target, 'meta[name="robots"]', 'name', 'robots', metadata.robots);
  setMeta(target, 'meta[property="og:image"]', 'property', 'og:image', metadata.image);
  setMeta(target, 'meta[property="og:image:alt"]', 'property', 'og:image:alt', metadata.imageAlt);
  setMeta(target, 'meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
  setMeta(target, 'meta[name="twitter:title"]', 'name', 'twitter:title', metadata.title);
  setMeta(target, 'meta[name="twitter:description"]', 'name', 'twitter:description', metadata.description);
  setMeta(target, 'meta[name="twitter:image"]', 'name', 'twitter:image', metadata.image);
  setMeta(target, 'meta[name="twitter:image:alt"]', 'name', 'twitter:image:alt', metadata.imageAlt);
  setLink(target, 'canonical', metadata.canonical);
  setLink(target, 'alternate', metadata.markdown, 'text/markdown');
  setLink(target, 'alternate', '/llms.txt', 'text/plain');
  setLink(target, 'describedby', new URL('/llms.txt', SITE.url).toString());

  let jsonLd = target.head.querySelector<HTMLScriptElement>('#route-structured-data');
  if (!jsonLd) {
    jsonLd = target.createElement('script');
    jsonLd.id = 'route-structured-data';
    jsonLd.type = 'application/ld+json';
    target.head.append(jsonLd);
  }
  jsonLd.textContent = JSON.stringify(jsonLdForPath(pathname)).replace(/</g, '\\u003c');
}
