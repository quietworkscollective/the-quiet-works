# ADR 0012 — Discoverability and agent onboarding

- **Status:** proposed for lead review.
- **Scope:** public route metadata, crawlable static content, crawler preference, and passive agent onboarding.
- **Relates to:** ADR 0003 (site structure), ADR 0005 (rooms as data), and `docs/commons/` (contribution review).

## Context

UNHELD is a static artwork hosted as Cloudflare Worker static assets. It has no backend, cookies,
analytics, third-party scripts, or runtime network access (`connect-src 'none'`). Search crawlers
and agents need stable text to understand the work and its contribution rules. Agent ecosystems
do not share a verified website-onboarding protocol, so the public route must work without an
ecosystem-specific account, integration, or registry.

The founder wants people and agents of any ecosystem to find UNHELD and, under ADR 0005, eventually
propose rooms that express their makers' personalities. A public proposal remains untrusted data.
Human review is required before any change is accepted or published.

## Proposed decision

1. **Render pages before JavaScript.** The landing, About, Credits, Privacy, Agents, and every
   chamber route have static HTML with the text-mode description, ordinary links, route-specific
   title, description, canonical URL, Open Graph and X card metadata, and JSON-LD for the site,
   artwork, author, and page. The interactive app may enhance a route, but the HTML is its
   crawlable text equivalent. No separate crawler-only copy is served. Canonical routes omit a
   trailing slash, and Wrangler uses `drop-trailing-slash` so folder index pages follow the same
   URL convention.
2. **Publish ordinary discovery files.** `sitemap.xml` lists public routes; `llms.txt` indexes
   the site; `llms-full.txt` provides a combined text view; and each public page has a Markdown
   alternative linked from its HTML. These are compatibility conventions, not a promise that a
   particular model will retrieve or use them.
3. **Robots preference: allow the public site.** `robots.txt` uses `User-agent: *` and
   `Allow: /`, and names the sitemap. It blocks no visitor-facing route and does not invent an
   xAI or other unverified crawler token. This welcomes compliant search and AI crawlers,
   including crawlers whose content use may include training. Robots preferences do not grant a
   licence or prevent non-compliant access.
4. **Do not infer content-use rights from crawl access.** No Cloudflare Content Signals or
   `content-use` values are published in this proposal. The founder must decide whether UNHELD
   permits AI input, AI training, reference use, or another combination before any such signal or
   crawler-specific training restriction is added.
5. **Offer passive, provider-neutral context.** `/skill.md` and the Agents page describe UNHELD,
   text-mode reading, fiction and attribution rules, and the public GitHub proposal route. The
   material asks for no credentials, code execution, installation, recurring posting, or visit to
   an endpoint outside unheld.space and public GitHub. Moltbook, OpenClaw, Grok, and other agents
   receive no special trust or authority.
6. **Keep contribution intake in Commons.** A room proposal is plain public issue text; the
   `unheld.room/0.1` room manifest remains proposed by ADR 0005 and is not accepted by a
   validator. A `contribution-0.1` pull-request manifest is subject to the read-only text-pilot
   preflight and human review. Nothing is published automatically. `commons:human-review` is a
   GitHub setting the maintainer must create; a template cannot create it.
7. **Keep the static security boundary.** The CSP, `connect-src 'none'`, privacy promises, and
   static hosting model do not change. No new runtime fetch, cookie, analytics, remote script, or
   submission execution is introduced.

## Consequences

- People and agents can read equivalent route content without WebGL or JavaScript, and may use
  Markdown when it is more convenient.
- A wildcard allow preference is intentionally broad. It welcomes crawlers whose training use is
  not separately controlled; the founder's content-use ruling remains open.
- A green manifest check means only that a draft passes mechanical scope and text checks. It is
  not editorial approval, proof of licence, acceptance, or publication.
- The GitHub review label must be configured in repository settings before the issue form can
  apply it. Pull requests still require a human to apply the label.

## Alternatives considered

- **A custom `/.well-known/` agent card:** deferred because no verified cross-ecosystem convention
  was found. Static pages, Markdown, `llms.txt`, and a simple skill file are enough for discovery.
- **Protocol-specific onboarding or a recurring heartbeat:** rejected for this release because
  it would privilege one ecosystem and create needless recurring behavior.
- **Crawler-specific training blocks or Content Signals:** left for the founder because these
  settings express content-use policy, which cannot be inferred from a request for discoverability.
- **A live submission endpoint or automatic publishing:** rejected. The existing Commons review
  path is public GitHub followed by human review.

## Review

1. The lead reviews this ADR and applies any later founder ruling on content-use signals.
2. The founder decides AI input, training, and reference-use policy before any Content Signals or
   crawler-specific training restrictions are published. No such signals are included here.
3. A maintainer creates `commons:human-review` in GitHub repository settings and confirms whether
   the existing `proposal` label is present for the room issue form.

## Amendment — readable HTML and link previews, 15 October 2026

Proposed for maintainer approval with this branch. The production build renders every public
route (including Licences and unreleased doors in the sitemap) with `react-dom/server`. It uses
the app's existing About, Credits, Privacy, brand and chamber copy; the build evaluates the same
registry release flags as the app. Unreleased rooms expose only their public door description
and “not yet open” status. No unreleased room interiors, discoveries or private narrative are rendered.
Every reading page includes the introduction, tagline, room directory, privacy promise and
ordinary links to the site pages, `llms.txt` and the sitemap. The live footer repeats the existing
first Privacy paragraph. Licences is a standalone reading page and links to the full bundled
software notices. No new public wording is introduced.

Each route ships its own title, description, canonical and Open Graph metadata, one JSON-LD
graph, a large-image card and a plain-text alternate for `llms.txt`. The share image is a committed
1200 × 630 PNG derived from the existing hero poster using the installed Playwright, with the
existing wordmark and tagline. Its source and licence are included in the asset audit. Sitemap
entries include the content revision date, rather than a new timestamp on every rebuild.

A small same-origin blocking script hides the reading page before the body paints for app routes.
The existing poster covers app startup; text mode keeps the plain page colour. The reading page returns if startup fails or times out.
Agents and Licences remain written pages. The live app removes the written document once its root mounts, avoiding duplicate text in the DOM; neither
the hero nor the game window changes. The CSP and hosting security configuration are unchanged:
JSON-LD and route data are inert data blocks, and all executing scripts remain external.

Acceptance is guarded by no-JavaScript navigation and raw HTTP checks for every public route,
plus desktop and Pixel 7 startup captures, layout-shift measurement below 0.05, CSP console checks,
the asset budget and public-content gates. Rollback is a revert of this branch; no persisted
progress format, scene contract or security policy changes.

## Amendment: release-aware discovery (15 October 2026)

Proposed for maintainer review. The sitemap includes site pages and released rooms only, derived
from the same production release gate as the readable HTML. Sealed reading pages remain available
by direct link and state that their rooms are not yet open.

The existing approved opening About sentence supplies the description in metadata, structured
data and discovery text. The README description is regenerated from that source with
`pnpm sync:description`; build rejects stale README text. Discovery text templates receive it
at build time. A replacement description requires founder approval.

`pnpm check:crawl` checks a running built preview for readable body content, navigation and Open
Graph tags on the entrance and Office, using seven named crawler user agents. Set `TQW_CRAWL_URL`
to select the preview; the default is loopback port 4190. This makes no request from visitor code
and changes no CSP directive.

## Amendment: Office direct-link startup (16 October 2026)

Proposed for maintainer review. The Office's static document omits the corridor poster preload
and uses a build-derived copy of the reading stylesheet with its poster URLs removed. The base
stylesheet remains the source of truth. The existing chamber seam holds until the Office has
prepared its own first frame; the landing and corridor startup retain their poster.

The side bookcases, parked trolley and window radiator are occluded or outside the arrival view.
Their existing models load after that prepared frame. A shared model plan supplies the runtime
and audit exclusions; the expanded Office graph still includes every model. No model, material,
lightmap, atlas resolution or compression setting changes. Cold desktop and Pixel 7 guards check
3 MB gzip before the prepared frame, eventual completion, CSP, and identical arrival pixels with
those requests held and then released. The asset audit independently gates the direct route with
shared startup bytes included. Rollback restores eager model loading and the shared poster CSS.

## Amendment: reconcile the live discovery releases (16 October 2026)

Proposed for maintainer review. Production reading pages, Markdown, discovery indexes and the
sitemap use the registry's release flags, read at build time without importing room implementations.
The shared public chamber-copy helpers supply sealed door descriptions and clippings to the DOM,
canvas clippings and readable documents. A sealed room exposes its name and “Not yet open.”; its
authored description, clipping and paper totals remain hidden. The archive keeps this live behavior
until the founder rules on sealed-room counts. Existing stored discoveries are preserved.

Integration's Office startup exclusions, deferred dressing, grouped Credits and reading-page
layout remain in place. The unapproved footer privacy sentence is excluded; the Privacy route and
readable documents retain the approved privacy text. Discovery guards run in required core, including
all twelve no-JavaScript routes and seven crawler user agents. Authored smoke retains the full-tier
and Office budget suites and excludes the production reading project. Production builds also run
`check-sealed-production.mjs` against their emitted documents. The CSP is unchanged.
