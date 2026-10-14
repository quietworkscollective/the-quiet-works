# UNHELD

*A space for everything we carry.* — [unheld.space](https://unheld.space)

UNHELD is an open-source, browser-native living artwork. **The Quiet Works** is its immersive 3D world; *HE'S FINE.* is the opening chapter (Chapter Zero). This repository holds the site and its first chapter: a landing that walks into an Edwardian corridor of doors, and the Certification Office, the first room behind them.

## Status

- In active development: the corridor, the site and the Certification Office are being built and finished in the open.
- `unheld.space` is the canonical public domain (set in `apps/web/src/site.ts`).
- Hosting: Cloudflare Workers static assets (`apps/web/wrangler.jsonc`; the build emits `_headers` with the CSP and caching rules). Deploying requires explicit founder approval.

## Requirements

- Node 22 or later.
- pnpm 10. With Corepack, `corepack enable` selects the version pinned in `package.json` (`pnpm@10.33.0`).
- A WebGL2 browser for the 3D office. Text mode works without WebGL2.

## Launch

```sh
pnpm install
pnpm dev                     # http://127.0.0.1:5173
pnpm build && pnpm preview   # production build at http://127.0.0.1:4173
```

Add `?mode=text` to either address, for example `http://127.0.0.1:5173/?mode=text`, to open text mode directly.

## Quality commands

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e                # Playwright; first run: pnpm --filter @tqw/web exec playwright install chromium
```

`pnpm test:e2e` builds the app and runs Playwright against the production preview (desktop and mobile Chromium). `TQW_EVIDENCE=1 pnpm test:e2e` also captures screenshots into `apps/web/evidence/tqw-001/`. `pnpm check:content` enforces the copy rules (banned diagnostic, crisis and score language; memo, caption and scene lengths; no remote references). `pnpm audit:assets` builds, then checks every shipped media file against a licence manifest, the bundled licence notices, remote references and the size budget.

## How to play

- Hold the stamp to press it. Release to lift it.
- Keyboard: focus the stamp button and hold Space or Enter. Release to lift.
- Touch works the same way as the mouse. What the machine does next is not explained here.

## Accessibility

- **Text mode** presents the full experience in semantic HTML. It opens automatically when WebGL2 is unavailable or the 3D view stops responding. A "Try the 3D view again" control returns to the scene.
- **Reduced motion** follows the operating system's `prefers-reduced-motion` setting. A Settings toggle overrides it on the current page.
- **Sound** starts only after a deliberate click, tap or key press. Scrolling does not start it. The Sound toggle in Settings mutes it; muting before the first press means no audio is ever started.
- **Captions** for sounds are a Settings toggle, off by default.

## Privacy

No accounts, cookies, analytics, telemetry or advertising. The app makes no network requests after it loads. Until a visitor finds something, nothing is stored in their browser. After the first find, one small record is kept in local storage under the key `unheld.v1`. It never leaves the device, and visitors can export it, import it, or forget it from the archive. Production builds ship a strict Content-Security-Policy in which every resource must be same-origin. All sound is synthesised in the browser with Web Audio; no audio files are loaded.

## Layout

- `apps/web`: Vite, React and React Three Fiber app. Entry point, 3D scene and sound desk.
- `packages/engine`: the single state machine and all copy. Renderers and sound read its state and cues; they do not decide.
- `packages/ui`: accessible components and text mode.

## Credits and licences

- IBM Plex Mono and IBM Plex Sans Condensed, copyright IBM Corp., SIL Open Font License 1.1, bundled via Fontsource.
- Newsreader, copyright The Newsreader Project Authors (Production Type), SIL Open Font License 1.1, bundled via Fontsource.
- three.js, React, React Three Fiber and their bundled dependencies, MIT. Every production build ships `third-party-notices.txt` with the name, version and full licence text of each bundled package and font; `pnpm audit:assets` fails if it is missing or incomplete.
- UNHELD: © 2026 Asiri Dalugoda. Code under the [Apache License 2.0](LICENSE); original art and writing under [CC BY 4.0](LICENSES/CC-BY-4.0.txt). The UNHELD name and mark are not licensed. [LICENSING.md](LICENSING.md) maps files to licences.

## Contributing

Read `AGENTS.md` and [CONTRIBUTING.md](CONTRIBUTING.md) before changing anything. Changes go through a branch and a reviewed pull request. Nothing is deployed or merged without explicit maintainer approval. Security reports: [SECURITY.md](SECURITY.md). Conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Design principles: [docs/DESIGN.md](docs/DESIGN.md).
