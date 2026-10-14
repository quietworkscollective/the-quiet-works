# Design principles

The public design reference for UNHELD and its world, The Quiet Works. It holds the principles,
art direction, accessibility rules, architecture, stewardship and release gates that every
contribution follows. Section numbers match the private design bible they come from, so
references such as "§6" or "P6" mean the same thing in both. The narrative, the chamber designs
and their secrets are deliberately not public.


## 2. Philosophy and ethics: twelve inviolable design laws

**P1 — Show; don't diagnose.** Mental traits and social burdens appear as objects, spaces, routines, light and sound. Never label visitors as having a condition.

**P2 — Burden is not identity.** Ambition, tenderness, pride, playfulness, fatherhood, friendship, creativity, grief, anxiety and self-doubt can coexist. Men are not reducible to suffering.

**P3 — Friction carries meaning.** A machine that asks for another certificate embodies impostor feelings better than a paragraph explaining them.

**P4 — Satisfaction before interpretation.** Every primary interaction works as a playful toy before its metaphor is revealed. No compulsory educational content.

**P5 — Humour is a door, not a punchline aimed at pain.** Bureaucracy, impossible mechanisms and procedural absurdity can be funny. The visitor and their suffering are not the joke.

**P6 — Recognition instead of reward for distress.** Award secrets and artifacts for discovery, experimentation, curiosity, collaboration and close observation. Never award rarity for reported pain, crisis intensity, or oversharing.

**P7 — No extraction.** Browsing should be anonymous by default; personal disclosures are unnecessary. No dark patterns, forced signups, intrusive analytics, or manipulative urgency.

**P8 — An open ending, not a false cure.** Growth is possible, not guaranteed. A visitor can leave with an unresolved feeling and still have completed the artwork.

**P9 — Multiple masculinities.** Stories must accommodate varied ages, cultures, incomes, bodies, sexual orientations, roles and life histories. No assertion of a single universal male experience.

**P10 — Participation carries responsibility.** The source can be open while publication is curated. Every live contribution has a maintainer, license, review and rollback path.

**P11 — Machines serve people.** AI agents can make art, accessibility adaptations, translations, music and code; they do not invent first-person testimony and present it as authentic human experience.

**P12 — Accessibility is not a degraded version.** A 2D narrative mode, reduced motion, captions, keyboard support, contrast and non-audio alternatives are genuine experiences, not error pages.

**Prohibited mechanics:** suffering leaderboards; 'most broken man' titles; distress-based loot; peer pressure streaks; delayed crisis support; public live confessional feeds; AI impersonation of real contributors; unmoderated public messaging; suicide depictions designed for shock; bots that scrape private stories into sentiment profiles.

**Responsible public-art standards:** Maintain a conspicuous 'About / Content Notes / Get Support' pathway. Use established responsible-portrayal guidelines if a chapter addresses suicide or self-harm. Commission expert and lived-experience review of sensitive chapters. National/international crisis links should be location-aware where possible and maintained as content, not hardcoded into scenes. No chatbot should pretend to provide clinical treatment.

---

## 6. Art direction, motion and interaction guidelines

### Visual language

- **Architecture:** retro-futurist civic bureaucracy + impossible industrial scale + miniature handcrafted objects. Not generic horror.
- **Materials:** worn concrete, enamel-painted steel, burnished brass, semi-translucent glass, paper, soft ink, occasional organic moss and warm light.
- **Colour set:** coal `#151A20`; warm bone `#DDD5C8`; oxidised teal `#3C7775`; approval amber `#D59B4A`; gentle human coral `#D78D79`; restorative dawn `#B8C6A4`. Keep colour semantic, not diagnostic.
- **Typography:** archival grotesk for interfaces; monospaced codes on machinery; humanist serif or restrained handwriting for intimate memos. Open-license fonts only.
- **Lighting:** soft, believable pools; darkness as composition rather than visibility hazard. Light rises as exploration changes understanding, not because the player achieves 'health'.
- **Camera:** first-person, standing-height exploration in the Corridor (no avatar, head bob or sprint) and authored chamber cameras, never unnecessary disorienting motion. Optional static point-and-click camera. No mandatory jump mechanic.
- **Motion:** ease into actions and accelerate departures. Large machines maintain mass and inertia; paper and dials are precise, tactile. Use finite spring parameters, predictable interactions, no disruptive autoplay.
- **Object semantics:** Paper represents judgment; glass represents perspective; clocks represent imagined time; radio and thread represent imperfect connection; lamps represent attention, not rescue.

### Interaction quality baseline

For each object document an input affordance, haptic/visual response, physical response, sound cue, state transition, idle response, reduced-motion alternative, input method parity and reset behaviour. Touch target 44 CSS px minimum; support mouse, touch, keyboard and controller when feasible. Every 3D interactive object has a focusable DOM equivalent in an overlay or alternative experience.

### Accessibility and comfort

Reduced motion disables camera shake, pulsing, abrupt fog movement and strobes. Captions cover sounds and any whispered dialogue. Audio is off until first deliberate user action; user can lower the music and the effects independently, switch to mono, and mute. Text mode preserves **all** story and collectible content. Content notes are available before sensitive chapters without forcing a disclosure. Fallback route on WebGL context loss resumes from the same scene state.

---

## 8. Architecture: web-native, modular, human-first

### Deployment diagram

```text
Browser (no login)
  ├── Vite + React / TypeScript UI (text accessibility path)
  ├── Three.js + React Three Fiber (WebGL2 stable baseline)
  ├── Scene runtime / deterministic interaction state / state machine
  ├── Audio graph (Web Audio API, positional SFX, adaptive stems)
  ├── Local progression (IndexedDB or localStorage, clear/export)
  └── Optional consensual interactions with /api/*
                   │
                   ▼
CDN / static hosting (Cloudflare Pages or equivalent)
                   │
           Optional serverless API
                   ├── Read-only world manifest & archived snapshots
                   ├── Contribution intake with moderation queue
                   ├── Aggregated monument events (no personal narratives)
                   ├── Agent gateway (capability-scoped)
                   ├── Signed release manifests / provenance
                   └── Operational telemetry (privacy-preserving)
               Storage: object store + simple SQL + optional realtime coordinator
```

### Stack decision table

| Layer | Recommendation | Reason | Alternative / caution |
|---|---|---|---|
| Package manager | pnpm workspaces | Fast deterministic lockfile, clear packages | Use npm if contributor simplicity wins |
| UI | Vite + React + TypeScript | Static-first, client-driven 3D, fewer SSR surprises | Avoid a heavy full-stack framework at launch |
| 3D | Three.js + stable R3F release | High-quality browser render / compositional reuse | R3F v10 WebGPU features were alpha in available docs; avoid alpha as baseline |
| Renderer | WebGL2 first | Predictable broad support | Explore WebGPU behind opt-in flag and feature detection |
| Animation | React Spring / GSAP where licensing allows + local spring/GSAP wrappers | Precise visual feel | Verify current license and tree-shaking |
| Physics | Rapier only for objects needing actual collisions | Use scripted kinematics elsewhere to save perf | Don't put all paper scraps in a live physics world |
| State | XState or explicit finite state machines + Zustand | Deterministic scene transitions and persistence | Avoid opaque event spaghetti |
| Sound | Web Audio API, optionally Tone.js for synth scheduling | Interactive buses, procedural notes, 3D sound | Pre-rendered motion and sound tools are preproduction only |
| 3D assets | glTF/GLB, Draco/meshopt as appropriate, KTX2 textures | Compression and cross-browser pipeline | Declare asset budgets and attribution |
| Accessibility | React DOM semantic mirror | Screen-reader and text-only experience | Do not rely on Canvas hover tooltips |
| E2E | Playwright desktop + mobile emulation | Screenshot, input and interaction coverage | Actual mobile device sampling needed |
| Backend | Cloudflare Workers | Low operations overhead, cheap scale potential | Vendor-portable API shapes |
| Storage | R2-style object + D1/SQLite-style metadata | Artifact snapshots, small structured data | Move to Postgres if moderation workflow grows |
| Shared state | Durable Objects or equivalent only when needed | Concurrency for live monument events | Avoid realtime complexity before users need it |
| CDN/edge | Cloudflare Pages or equivalent | Low friction static delivery | Independent build artifacts survive host changes |
| Monitoring | Error rate, render/device metrics with consent-aware sampling | Reliability | Do not collect inferred emotional state |

### Suggested repository tree

```text
quiet-works/
├── AGENTS.md                   # Agent-neutral hard rules, compact
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
├── LICENSE
├── docs/
│   ├── PHILOSOPHY.md
│   ├── NARRATIVE_BIBLE.md
│   ├── SOUND_BIBLE.md
│   ├── ART_DIRECTION.md
│   ├── SAFETY_AND_MODERATION.md
│   ├── ARCHITECTURE.md
│   ├── ADR/
│   └── RELEASE_CHECKLIST.md
├── apps/
│   ├── web/                     # Browser player
│   └── gateway/                 # Optional agent + contribution backend
├── packages/
│   ├── engine/                  # Scene, clock, events, interaction runtime
│   ├── ui/                      # Accessible equivalents, menus, inventory
│   ├── scenes/                  # Curated chapter modules
│   ├── audio/                   # Audio graph, score, cue definitions
│   ├── content-schema/          # Data-driven contributions + JSON schemas
│   ├── artifact-system/         # Recognitions, memo inventory, combinations
│   └── agent-contracts/         # Schemas for API/MCP/A2A
├── content/
│   ├── chapters/chapter-zero/
│   ├── memos/
│   ├── artifacts/
│   └── translations/
├── motion/                      # Pre-rendered motion & promo renders
├── tools/
│   ├── orchestration/
│   ├── validation/
│   └── procedural-assets/
├── .github/workflows/
└── tests/
    ├── unit/
    ├── scene-contract/
    ├── e2e/
    ├── performance/
    ├── accessibility/
    └── security/
```

### Performance budget (release gates; validate on real hardware)

- First meaningful interaction in <=3 seconds on a typical broadband phone and <=5 seconds on a constrained 4G device, after intentionally shipping only the initial small scene.
- Initial scene assets: target <=3 MB compressed for low-bandwidth profile, <=8 MB default; lazy-load later chapters. These are design budgets, not current measurements.
- Visual quality modes: 30 fps sustained on baseline midrange mobile; 60 fps targeted for representative desktops. Dynamic pixel ratio 0.75–2, lower shadow maps, disable postprocessing on low.
- Memory: profile and fix long-session leaks; dispose geometries, textures, audio buffers and event subscriptions on scene exit.
- Reduced mode: avoid shader-based assumptions, offer DOM narration and imagery.
- Edge API operational objectives: read path remains usable if mutable backends fail; disable contribution features gracefully during incidents.

### Deterministic world state

The client owns local interaction state. A scene is a finite state machine with versioned content metadata; side effects are mediated through a typed event bus: `ENTER_SCENE`, `USE_OBJECT`, `DISCOVER_MEMO`, `UNLOCK_ARTIFACT`, `SOUND_CUE`, `LEAVE_SCENE`. Each room has `init(seed, persistedState)`, `handle(event)`, `render(state)`, and optional `serialize`. IDs are immutable; state migrations are tested so adding rooms doesn't corrupt returning visitors' Cabinets.

**Core and chambers (ADR 0001).** The core owns the landing, Corridor, Notice Board, routing, thresholds, settings, sound lifecycle, captions and site pages; its spine machine (`packages/engine/src/spine.ts`) projects to the URL (`/`, `/<chamber>`, `/about`, `/credits`, `/privacy`). A chamber owns its scene, its own state machine and its door: `chambers/<id>/door.ts` is data for the core door kit, and the chamber component loads lazily behind it. A door is always data, so a future community chamber can contribute one as validated data.

Scene data and code are different trust classes. Public agent submissions can provide schema-validated data and assets, **never arbitrary executable React components or shaders** loaded from a remote payload. Executable authored scenes require a code review and a signed application release.

---

## 12. Open-source stewardship, licensing, and moderation

**Licences (decided 14 October 2026):** code is licensed under the Apache License 2.0; original art and writing under CC BY 4.0; both © Asiri Dalugoda. The UNHELD name and mark are not licensed. Third-party components keep their own licences. Personal first-person stories will need explicit publication and reuse permissions of their own, never blanket remix terms. See `LICENSING.md`.

**Governance:** Founder initially serves as curator, supported by a small editorial/safeguarding advisory circle. Publish a constitution, contributor code of conduct, licensing checklist, content sensitivity guide, moderation escalation, takedown and correction process, security disclosure policy, and rules for contributor credit. Preserve creative and technical dissent in ADRs and issue discussions rather than silent deletion.

**Privacy:** No accounts, no cookies, no analytics and no third-party trackers; progress stays on the visitor's device (the discovery store) and never leaves it. Keep hosting logs short-lived per legal/operational requirements; communicate retention clearly. User-submitted symbolic objects should contain no freeform personal text in the first release. Explicit deletion/withdrawal workflow for personal stories, with backups and snapshots reconciled. No model-training reuse without separate permission.

**Moderation:** All publishable incoming text, models, shaders, documents and media receive validation. Human review for political/grievance bait, misogynistic or hateful content, targeted humiliation, self-harm guidance, impersonation, misinformation framed as therapeutic advice, copyrighted assets and privacy leaks. Contributor guidance explicitly allows diverse and critical views on social expectations without allowing harassment or dehumanisation.

**Safety references:** WHO guidance on responsible suicide communication, mental-health reviewers, and maintained local support resources. Pre-launch testing includes players who felt understood, players who felt excluded, and players uncomfortable with mental-health material. Count harmful unintended interpretations in qualitative evaluation.

---

## 14. Testing, reliability and release gates

**Automated:** TypeScript strict/no unchecked schema, ESLint, unit interaction-state tests, golden-memo snapshots, Playwright UI flow (including reduced-motion and keyboard), axe accessibility review, first-scene compression budget, GPU baseline screenshot comparison, audio file peak/loudness checks, known-vulnerability scanning, license compliance, checksums, provenance manifest validation, content origin tests, outbound-link checks.

**Manual:** iPhone Safari, Android Chrome, older laptop, low power mode, headphones, muted, high contrast, slow network, WebGL unavailable/context lost, 2D navigation. Include people with varied lived experiences and different responses to the men's-health framing. Audit every secret for unintended coercion.

**Security adversarial tests:** Agent prompt injection in chapter prose; hostile GLB with gigantic textures/meshes; malicious SVG/script; zip bombs; oversized JSON; forged contributor identity; replayed approvals; cross-tenant draft access; unauthorized release attempt; public link enumeration of private submissions; social-engineering texts disguised as curator commands; AI-generated health claims; abusive mass placement in the Atrium.

**Release gates:** Protected main branch, required status checks and human approval, deploy from reviewed artifact, immutable tag, one-click rollback, checked content note links, audited default audio levels, documented known issues.

---
