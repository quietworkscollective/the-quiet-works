import { createElement as h, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ABOUT,
  AUTHOR,
  CHAMBERS,
  CREDITS,
  FOOTER_COPY,
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
const SHARE_IMAGE = '/share-unheld-1200x630.png';
const AGENTS_PAGE = {
  title: 'Agents',
  body: [
    ABOUT.body[0] as string,
    'The Quiet Works is its immersive 3D world. Read the landing and chamber descriptions in text mode or use the Markdown pages linked below.',
    'Contribution text must be fictional. Never present invented words as real testimony or impersonate a real person. Every contribution receives human review; nothing is published automatically.',
    'Agent-made work needs a named human or organisation to grant its licence and carries the machine-made mark. Secrets, private lore, credentials, personal testimony and executable content are not accepted.',
    'An operator may propose a room or contribution through public GitHub. A room-manifest format remains proposed under ADR 0005.',
  ],
} as const;
const EXCHANGE_TEXT_MODE_COPY = { ready: 'The room is ready as a set of places and actions.' } as const;
const OUTLINE_TEXT_MODE_COPY = {
  title: 'A small instrument workshop',
  description: 'A brass arm follows the outside edge of a selected object. It leaves the inside undescribed.',
  fictionNote: 'The tins are fictional workshop specimens. Nothing here describes a visitor.',
} as const;

export interface PublicRoute {
  path: string;
  markdownPath: string;
  key: 'home' | 'agents' | 'licences' | PageId | `chamber:${string}`;
  title: string;
  description: string;
}

export interface RouteMetadata {
  title: string;
  description: string;
  canonical: string;
  markdown: string;
  image: string;
  imageAlt: string;
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

const chamberDescription = (chamber: ChamberEntry, production: boolean): string => {
  if (production && chamber.status === 'sealed') return 'Not yet open.';
  switch (chamber.id) {
    case 'certification-office':
      return TEXT_MODE_SCENE.join(' ');
    case 'exchange':
      return EXCHANGE_TEXT_MODE_COPY.ready;
    case 'outline-room':
      return `${OUTLINE_TEXT_MODE_COPY.title}. ${OUTLINE_TEXT_MODE_COPY.description}`;
    default:
      return chamber.doorDescription;
  }
};

export const UNHELD_DESCRIPTION = ABOUT.body[0] as string;

const homeRoute: PublicRoute = {
  path: '/',
  markdownPath: '/index.md',
  key: 'home',
  title: `${SITE.name} — ${SITE.tagline}`,
  description: UNHELD_DESCRIPTION,
};

const pageRoutes: readonly PublicRoute[] = [
  homeRoute,
  { path: '/about', markdownPath: '/about.md', key: 'about', title: ABOUT.title, description: UNHELD_DESCRIPTION },
  { path: '/credits', markdownPath: '/credits.md', key: 'credits', title: 'Credits — UNHELD', description: UNHELD_DESCRIPTION },
  { path: '/privacy', markdownPath: '/privacy.md', key: 'privacy', title: 'Privacy — UNHELD', description: UNHELD_DESCRIPTION },
  { path: '/licences', markdownPath: '/licences.md', key: 'licences', title: 'Licences — UNHELD', description: UNHELD_DESCRIPTION },
  { path: '/agents', markdownPath: '/agents.md', key: 'agents', title: 'Agents — UNHELD', description: UNHELD_DESCRIPTION },
];

export function publicRoutesFor(chambers: readonly ChamberEntry[] = CHAMBERS, production = false): readonly PublicRoute[] {
  const publicEntries = production ? publicChambers(chambers, true) : chambers;
  return [
    ...pageRoutes,
    ...publicEntries.map((chamber): PublicRoute => ({
      path: `/${chamber.slug}`,
      markdownPath: `/${chamber.slug}.md`,
      key: `chamber:${chamber.id}`,
      title: `${chamber.title} — ${SITE.world} — ${SITE.name}`,
      description: UNHELD_DESCRIPTION,
    })),
  ];
}

export const PUBLIC_ROUTES: readonly PublicRoute[] = publicRoutesFor();

export function sitemapForChambers(chambers: readonly ChamberEntry[]): string {
  const routes = PUBLIC_ROUTES.filter(route => !route.key.startsWith('chamber:') || chambers.some(room => route.key === `chamber:${room.id}` && room.status === 'open'));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes.map(route => `  <url><loc>${metadataForPath(route.path).canonical}</loc><lastmod>2026-10-16</lastmod></url>`).join('\n')}\n</urlset>\n`;
}

function normalizedPath(pathname: string): string {
  const pathOnly = pathname.split(/[?#]/, 1)[0] || '/';
  return pathOnly.replace(/\/+$/, '') || '/';
}

function routeForPath(pathname: string, chambers: readonly ChamberEntry[], production: boolean): PublicRoute {
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
    imageAlt: `${SITE.name} — ${SITE.tagline}`,
  };
}

export function jsonLdForPath(pathname: string, chambers: readonly ChamberEntry[] = CHAMBERS, production = false): { '@context': string; '@graph': Record<string, unknown>[] } {
  const route = routeForPath(pathname, chambers, production);
  const metadata = metadataForPath(pathname, chambers, production);
  const websiteId = new URL('#website', SITE.url).toString();
  const artworkId = new URL('#the-quiet-works', SITE.url).toString();
  const authorId = SITE.authorUrl;
  const pageId = `${metadata.canonical}#webpage`;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': websiteId,
        url: SITE.url,
        name: SITE.name,
        description: UNHELD_DESCRIPTION,
        publisher: { '@id': authorId },
      },
      {
        '@type': 'VisualArtwork',
        '@id': artworkId,
        name: SITE.world,
        alternateName: SITE.chapter,
        description: UNHELD_DESCRIPTION,
        image: metadata.image,
        artform: 'Interactive browser artwork',
        creator: { '@id': authorId },
        isPartOf: { '@id': websiteId },
      },
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
        isPartOf: { '@id': websiteId },
        about: { '@id': artworkId },
        author: { '@id': authorId },
      },
    ],
  };
}

function text(value: string): StaticBlock {
  return { kind: 'paragraph', parts: [value] };
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

function corridorBlocks(selectedPath?: string, chambers: readonly ChamberEntry[] = CHAMBERS, production = false): StaticBlock[] {
  return [
    text(TEXT_MODE_NOTICE_CORRIDOR.chosen),
    { kind: 'heading', level: 2, text: 'The corridor' },
    ...TEXT_MODE_CORRIDOR.map(text),
    { kind: 'doors', ...(selectedPath ? { selectedPath } : {}), doors: production ? publicChambers(chambers, true) : chambers },
    link('Read The Quiet Works in text mode', '/?mode=text'),
  ];
}

function pageBlocks(path: string, creditGroups: readonly CreditGroup[], chambers: readonly ChamberEntry[], production: boolean): StaticDocument {
  const normalized = normalizedPath(path);
  const route = routeForPath(normalized, chambers, production);
  if (route.key === 'home') {
    return {
      title: route.title,
      blocks: [
        { kind: 'heading', level: 1, text: SITE.name },
        text(SITE.tagline),
        text(ABOUT.body[0] as string),
        link('About UNHELD', '/about'),
        ...corridorBlocks(undefined, chambers, production),
      ],
    };
  }
  if (route.key === 'about') return { title: route.title, blocks: aboutBlocks() };
  if (route.key === 'credits') {
    return {
      title: route.title,
      blocks: [
        { kind: 'heading', level: 1, text: CREDITS.title },
        ...CREDITS.body.map(text),
        { kind: 'heading', level: 2, text: THIRD_PARTY_COPY.heading },
        text(THIRD_PARTY_COPY.intro),
        { kind: 'credits', groups: creditGroups },
        text(THIRD_PARTY_COPY.original),
      ],
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

  const entries = production ? publicChambers(chambers, true) : chambers;
  const chamber = entries.find((entry) => route.key === `chamber:${entry.id}`);
  if (!chamber) {
    return {
      title: route.title,
      blocks: corridorBlocks(undefined, chambers, production),
    };
  }
  if (chamber.status === 'sealed') {
    return production
      ? { title: route.title, blocks: [{ kind: 'heading', level: 1, text: chamber.title }, text('Not yet open.')] }
      : { title: route.title, blocks: corridorBlocks(`/${chamber.slug}`, chambers, production) };
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
  if (chamber.id === 'exchange') {
    return {
      title: route.title,
      blocks: [
        { kind: 'heading', level: 1, text: chamber.title },
        text(EXCHANGE_TEXT_MODE_COPY.ready),
      ],
    };
  }
  if (chamber.id === 'outline-room') {
    return {
      title: route.title,
      blocks: [
        { kind: 'heading', level: 1, text: chamber.title },
        { kind: 'heading', level: 2, text: OUTLINE_TEXT_MODE_COPY.title },
        text(OUTLINE_TEXT_MODE_COPY.description),
        text(OUTLINE_TEXT_MODE_COPY.fictionNote),
      ],
    };
  }
  return { title: route.title, blocks: [{ kind: 'heading', level: 1, text: chamber.title }, text(chamberDescription(chamber, production))] };
}

function readingDocument(pathname: string, creditGroups: readonly CreditGroup[], chambers: readonly ChamberEntry[], production: boolean): StaticDocument {
  const document = pageBlocks(pathname, creditGroups, chambers, production);
  const containsParagraph = (value: string) => document.blocks.some(block => block.kind === 'paragraph' && block.parts.includes(value));
  const blocks: StaticBlock[] = [...document.blocks].filter(block => block.kind !== 'doors');
  if (!containsParagraph(SITE.tagline)) blocks.push(text(SITE.tagline));
  if (!containsParagraph(ABOUT.body[0] as string)) blocks.push(text(ABOUT.body[0] as string));
  blocks.push({ kind: 'doors', selectedPath: normalizedPath(pathname), doors: production ? publicChambers(chambers, true) : chambers });
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
  const navigation = [
    ['UNHELD', '/'], ['About', '/about'], ['Credits', '/credits'], ['Privacy', '/privacy'],
    ['Licences', '/licences'], ['Agents', '/agents'], ['llms.txt', '/llms.txt'], ['sitemap.xml', '/sitemap.xml'],
  ];
  return renderToStaticMarkup(h('main', { id: 'static-content', className: 'tqw-static-content', 'data-static-route': route.path },
    h('article', null, ...document.blocks.map(renderBlock)),
    h('nav', { 'aria-label': 'Site' }, h('ul', null, ...navigation.map(([label, href]) => h('li', { key: href }, h('a', { href }, label)))))));
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

export function markdownForPath(
  pathname: string,
  creditGroups: readonly CreditGroup[] = [],
  chambers: readonly ChamberEntry[] = CHAMBERS,
  production = false,
): string {
  const page = readingDocument(pathname, creditGroups, chambers, production);
  const route = routeForPath(pathname, chambers, production);
  const body = page.blocks.map(renderBlockMarkdown).filter(Boolean).join('\n\n');
  const entries = production ? publicChambers(chambers, true) : chambers;
  const chamber = entries.find((entry) => route.key === `chamber:${entry.id}`);
  if (production && chamber?.status === 'sealed') return `# ${chamber.title}\n\nNot yet open.\n`;
  const siteLinks = `## Site pages\n\n- [About](${new URL('/about.md', SITE.url)})\n- [Credits](${new URL('/credits.md', SITE.url)})\n- [Privacy](${new URL('/privacy.md', SITE.url)})\n- [Agents](${new URL('/agents.md', SITE.url)})\n- [Agent skill](${new URL('/skill.md', SITE.url)})`;
  return `# ${page.title}\n\n${body}\n\n${siteLinks}\n\n[Canonical page](${metadataForPath(route.path, chambers, production).canonical})\n`;
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
  setMeta(target, 'meta[property="og:image"]', 'property', 'og:image', metadata.image);
  setMeta(target, 'meta[property="og:image:alt"]', 'property', 'og:image:alt', metadata.imageAlt);
  setMeta(target, 'meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
  setMeta(target, 'meta[name="twitter:title"]', 'name', 'twitter:title', metadata.title);
  setMeta(target, 'meta[name="twitter:description"]', 'name', 'twitter:description', metadata.description);
  setMeta(target, 'meta[name="twitter:image"]', 'name', 'twitter:image', metadata.image);
  setMeta(target, 'meta[name="twitter:image:alt"]', 'name', 'twitter:image:alt', metadata.imageAlt);
  setLink(target, 'canonical', metadata.canonical);
  setLink(target, 'alternate', metadata.markdown, 'text/markdown');
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
