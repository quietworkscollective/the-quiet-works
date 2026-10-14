import {
  ABOUT,
  AUTHOR,
  CHAMBERS,
  CREDITS,
  PRIVACY,
  TEXT_MODE_CORRIDOR,
  TEXT_MODE_NOTICE,
  TEXT_MODE_NOTICE_CORRIDOR,
  TEXT_MODE_SCENE,
  THIRD_PARTY_COPY,
  type ChamberEntry,
  type PageId,
} from '@tqw/engine';
import type { CreditGroup } from './credits/groupCredits.ts';
import { SITE } from './site.ts';

const REPOSITORY = 'https://github.com/quietworkscollective/the-quiet-works';
const SHARE_IMAGE = '/poster-hero-1440x900.webp';
const AGENTS_PAGE = {
  title: 'Agents',
  body: [
    'UNHELD is a space for people and agents to express themselves through fictional, reviewed rooms and contributions.',
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
  key: 'home' | 'agents' | PageId | `chamber:${string}`;
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

const chamberDescription = (chamber: ChamberEntry): string => {
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

const homeDescription = `${SITE.tagline} The Quiet Works is UNHELD’s immersive 3D world, with a text-mode route through its corridor.`;

const homeRoute: PublicRoute = {
  path: '/',
  markdownPath: '/index.md',
  key: 'home',
  title: `${SITE.name} — ${SITE.tagline}`,
  description: homeDescription,
};

const pageRoutes: readonly PublicRoute[] = [
  homeRoute,
  { path: '/about', markdownPath: '/about.md', key: 'about', title: ABOUT.title, description: ABOUT.body[0] as string },
  { path: '/credits', markdownPath: '/credits.md', key: 'credits', title: 'Credits — UNHELD', description: CREDITS.body[0] as string },
  { path: '/privacy', markdownPath: '/privacy.md', key: 'privacy', title: 'Privacy — UNHELD', description: PRIVACY.body[0] as string },
  { path: '/agents', markdownPath: '/agents.md', key: 'agents', title: 'Agents — UNHELD', description: AGENTS_PAGE.body[0] },
];

export const PUBLIC_ROUTES: readonly PublicRoute[] = [
  ...pageRoutes,
  ...CHAMBERS.map((chamber): PublicRoute => ({
    path: `/${chamber.slug}`,
    markdownPath: `/${chamber.slug}.md`,
    key: `chamber:${chamber.id}`,
    title: `${chamber.title} — ${SITE.world} — ${SITE.name}`,
    description: chamberDescription(chamber),
  })),
];

function normalizedPath(pathname: string): string {
  const pathOnly = pathname.split(/[?#]/, 1)[0] || '/';
  return pathOnly.replace(/\/+$/, '') || '/';
}

function routeForPath(pathname: string): PublicRoute {
  const path = normalizedPath(pathname);
  return PUBLIC_ROUTES.find((route) => route.path === path) ?? homeRoute;
}

export function metadataForPath(pathname: string): RouteMetadata {
  const route = routeForPath(pathname);
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

export function jsonLdForPath(pathname: string): { '@context': string; '@graph': Record<string, unknown>[] } {
  const route = routeForPath(pathname);
  const metadata = metadataForPath(pathname);
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
        description: SITE.tagline,
        publisher: { '@id': authorId },
      },
      {
        '@type': 'VisualArtwork',
        '@id': artworkId,
        name: SITE.world,
        alternateName: SITE.chapter,
        description: ABOUT.body[0],
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

function corridorBlocks(selectedPath?: string): StaticBlock[] {
  return [
    text(TEXT_MODE_NOTICE_CORRIDOR.chosen),
    { kind: 'heading', level: 1, text: 'The corridor' },
    ...TEXT_MODE_CORRIDOR.map(text),
    { kind: 'doors', ...(selectedPath ? { selectedPath } : {}), doors: CHAMBERS },
    link('Read The Quiet Works in text mode', '/?mode=text'),
  ];
}

function pageBlocks(path: string, creditGroups: readonly CreditGroup[]): StaticDocument {
  const normalized = normalizedPath(path);
  const route = routeForPath(normalized);
  if (route.key === 'home') {
    return {
      title: route.title,
      blocks: [
        { kind: 'heading', level: 1, text: SITE.name },
        text(SITE.tagline),
        text(ABOUT.body[0] as string),
        link('About UNHELD', '/about'),
        ...corridorBlocks(),
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

  const chamber = CHAMBERS.find((entry) => route.key === `chamber:${entry.id}`);
  if (!chamber || chamber.status === 'sealed') {
    return {
      title: route.title,
      blocks: corridorBlocks(chamber ? `/${chamber.slug}` : undefined),
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
  return { title: route.title, blocks: [{ kind: 'heading', level: 1, text: chamber.title }, text(chamberDescription(chamber))] };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderInlineHtml(parts: readonly InlinePart[]): string {
  return parts.map((part) => typeof part === 'string'
    ? escapeHtml(part)
    : `<a href="${escapeHtml(part.href)}">${escapeHtml(part.text)}</a>`).join('');
}

function renderBlockHtml(block: StaticBlock): string {
  switch (block.kind) {
    case 'heading':
      return `<h${block.level}>${escapeHtml(block.text)}</h${block.level}>`;
    case 'paragraph':
      return `<p>${renderInlineHtml(block.parts)}</p>`;
    case 'link':
      return `<p><a href="${escapeHtml(block.href)}">${escapeHtml(block.text)}</a></p>`;
    case 'doors':
      return `<nav aria-label="Doors"><ul>${block.doors.map((door) => {
        const path = `/${door.slug}`;
        const status = door.status === 'open' ? 'open the door' : 'not yet open';
        const current = block.selectedPath === path ? ' aria-current="page"' : '';
        return `<li><a href="${path}"${current}>${escapeHtml(door.title)}, ${status}</a><p>${escapeHtml(door.doorDescription)}</p></li>`;
      }).join('')}</ul></nav>`;
    case 'credits':
      return block.groups.map((group) => `<section><h3>${escapeHtml(group.provider)}</h3><ul>${group.items.map((item) =>
        `<li><a href="${escapeHtml(item.source)}">${escapeHtml(item.title)}</a>, ${escapeHtml(`by ${item.author}`)}, ${escapeHtml(item.licence)}</li>`,
      ).join('')}</ul></section>`).join('');
  }
}

export function staticHtmlForPath(pathname: string, creditGroups: readonly CreditGroup[] = []): string {
  const route = routeForPath(pathname);
  const document = pageBlocks(pathname, creditGroups);
  const navigation = [
    ['About', '/about'],
    ['Credits', '/credits'],
    ['Privacy', '/privacy'],
    ['Agents', '/agents'],
  ].map(([label, href]) => `<li><a href="${href}">${label}</a></li>`).join('');
  const blocks = document.blocks.map(renderBlockHtml).join('\n');
  return `<main id="static-content" class="tqw-static-content" data-static-route="${escapeHtml(route.path)}"><article>${blocks}</article><nav aria-label="Site"><ul>${navigation}</ul></nav></main>`;
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

export function markdownForPath(pathname: string, creditGroups: readonly CreditGroup[] = []): string {
  const page = pageBlocks(pathname, creditGroups);
  const route = routeForPath(pathname);
  const body = page.blocks.map(renderBlockMarkdown).filter(Boolean).join('\n\n');
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
