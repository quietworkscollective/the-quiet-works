# ADR 0001 — The Corridor: landing, spine and chamber contract

- **Status:** accepted. Founder direction 2026-10-14; art direction from consult 2 (Astra), with lead rulings below.
- **Task:** `tasks/TQW-002.yaml`.
- **Supersedes:** the design bible's opening rule ("direct to a scene; no cinematic gate"), now amended to match.

## Context

TQW-001 shipped one chamber, the Certification Office, opened directly at `/`. UNHELD needs a front door and a way between experiences that grows with the artwork: new chambers over years, eventually community chambers. The founder's direction:
- the site opens on a branded landing;
- scrolling carries the visitor, with real depth, into a first-person walk (first person only, no avatar);
- the walk goes through a dim, well-decorated period corridor that feels endless;
- the corridor is lined with striking, different doors, and clicking a door opens its experience;
- each experience introduces its own door and entrance;
- an old-school notice board with a paper clipping per experience gives direct access without walking;
- full website branding is part of the work;
- the core owns the corridor; the Certification Office becomes its first door.

## Decision

### Experience

1. **One continuous camera from the landing.** The landing is the entrance lobby of The Quiet Works at night, seen at standing height, looking through open inner doors down a deep corridor.
   - **Scroll mapping:** 2.5 viewport heights of native scrolling move the camera 5 m along the axis. Smoothing is at most 120 ms, with no automatic travel and no scroll-jacking.
   - **Brand layer:** UNHELD's brand lives in a DOM layer over the scene that parallaxes and fades as the camera moves.
   - **After hand-over:** the wheel and swipe keep walking, so scrolling never stops being the verb. Reverse input walks backward.
2. **The landing is not a gate.** "Enter The Quiet Works", "Notice board" and "About" are present from the first frame. Deep links skip the landing entirely.
3. **The corridor.** It is the building's original spine: Edwardian administrative architecture of about 1910, adapted ever since.
   - **Finish:** oak dado, pale plaster, a deep cornice, cast radiators, occasional fanlights, a terrazzo floor with a restrained border and no runner.
   - **Decoration:** this means institutional accumulation, not ornament: framed building sections, glazed directories, obsolete conduit, repaired surfaces. One composed grouping every two bays; quiet walls between.
4. **Doors come from their department's era.** Each chamber was "installed" in its own decade and brought its own door. Differences are architectural (proportion, construction, mechanism). Shared mounting, signage and lighting make them one building.
5. **Endless by perspective, not by walking.**
   - About 22 m (six 3.6 m bays) of corridor is walkable. It holds the four Chapter Zero doors and a scatter of blank-plaque doors in varied sizes.
   - Beyond that the corridor recedes into fog for at least 50 m and is never reachable. Walking slows to a stop well before the dark.
   - Blank doors are architecture, not destinations: they are not focusable and do nothing.
   - The Office's "position vacant" joke stays inside the Office.
6. **Guidance by light.** Only the open door (now the Certification Office, in the second bay on the right) spills interior light. Sealed doors (The Apartment, The Tomorrow Engine, The Great Atrium) are present, identifiable and physically closed. Their DOM equivalents say "not yet open".
7. **The notice board** stands in the lobby, left of the walking line.
   - **Board:** 1.25 × 0.85 m with a 35 mm oak frame, olive felt `#505247` and brass pins.
   - **Clippings:** one per chamber, on bone, buff or grey-green stock, rotated within ±2°.
   - **DOM board:** the same stocks and hierarchy in an orderly grid. It opens from anywhere (the header, the landing, the corridor and inside chambers) and goes straight in.
8. **Opening a door.**
   - **Handle and swing:** the handle turns 25° over 140 ms, the latch releases over 80 ms, and the door swings 82° over 800 ms (cubic-bezier 0.4, 0, 0.2, 1).
   - **Entry:** the camera advances 1.6 m over 1.4 s.
   - **Seam:** the chamber appears behind the occluding jamb, with no white flash or blackout. The chamber's code starts loading when its door is first focused or hovered.
   - **Leaving:** the visitor returns to the corridor, standing 1.4 m from that door and facing it as it closes.
9. **First-person movement** (no head bob, roll or sprint):

   | Parameter | Value |
   |---|---|
   | Eye height | 1.62 m |
   | Vertical FOV | 48° desktop, 58° portrait |
   | Walk / assisted glide | 1.1 m/s / 0.8 m/s |
   | Acceleration / stop | 300 ms / 180 ms |
   | Easing | cubic-bezier(0.22, 0.61, 0.36, 1) |

   - **Look:** drag to look; looking never moves the camera by itself.
   - **Select:** clicking a door glides to 1.4 m in front of it with at most 12° of framing over 350 ms; a second click or Enter opens it.
   - **Keys:** W, S and the up and down arrows walk; A, D and the left and right arrows turn.
   - **Tab** moves through the doors' DOM equivalents in corridor order. Focus glides to that door, and Enter opens it.
   - **Touch:** visible forward and back controls, drag to look, tap a door to glide to it.

### Brand (UNHELD) and building signage (The Quiet Works)

- **Wordmark:** UNHELD in IBM Plex Sans Condensed 400, uppercase, tracking 0.20 em. It is 88 px at 1440 px wide and 52 px at 412 px, placed left at 96 / 24 px margins about 32% down the viewport. The tagline sits under it in Newsreader at 24 / 20 px. Nothing else in the first frame.
- **Mark:** an open lintel (two uprights and a top bar with a small gap at the upper right), drawn in bone on coal. At 16 px it uses 2 px strokes and a 3 px gap. It serves as favicon, touch icon and share-card mark.
- **Site tokens:**

  | Token | Hex |
  |---|---|
  | Coal | `#151A20` |
  | Bone | `#DDD5C8` |
  | Teal | `#3C7775` |
  | Amber (actionable attention only) | `#D59B4A` |
  | Muted text | `#B7B1A6` |
  | Divider | `#454A4C` |
  | Coral (reserved for chamber moments) | `#D78D79` |
  | Dawn (reserved for chamber moments) | `#B8C6A4` |

- **Pages:** About, Credits and Privacy are quiet coal pages over the dimmed scene.
  - **Layout:** a 680 px reading column, Newsreader 20 / 18 px at 1.55 line height, Sans Condensed 16 px navigation.
  - **Not-found page:** a cropped blank plaque and "This address isn't in the directory", with links to the entrance and the board.
- **Share image:** 1200 × 630, wordmark at (72, 88) at 76 px, tagline at 28 px, the corridor in the right 60% with one teal door catching light. A 64 px safe margin; no UI.
- **Two voices:** the UNHELD wordmark belongs to the outside world (landing, pages, share card). The building's signage (painted, gilt, stencilled, enamel; "THE QUIET WORKS" over the inner doors) belongs to the world.

### Corridor art direction (targets, not measurements)

- **Dimensions:**

  | Element | Value |
  |---|---|
  | Clear width | 3.2 m |
  | Ceiling | 3.8 m |
  | Bay length | 3.6 m |
  | Dado height | 1.15 m |
  | Cornice projection | 0.16 m |
  | First door beyond the lobby | 5–7 m |

- **Base colours (before lighting):**

  | Material | Hex |
  |---|---|
  | Plaster | `#77776B` |
  | Oak | `#302B25` |
  | Terrazzo | `#535954` |
  | Ceiling | `#929083` |
  | Aged brass | `#897044` |

  The Office teal stays the first strong chromatic event.
- **Lighting:**
  - Sconces at 2.25 m, every 7.2 m on each wall, staggered by 3.6 m. They are 2700 K, with wall pools of about 1.2 m radius and floor pools of 1.6 m.
  - Weak 4300 K ambient fill; door lamps at 3000 K.
  - Exposure is locked: no automatic exposure, and no flicker.
- **Fog:** `#4B3A27`, a warm brown (was the cool `#20282A`), negligible before 12 m, about 50% at 28 m and 90% by 50 m. Static and architectural, never drifting horror mist. The far end of the corridor reads as an old, lit distance, not a dark void: the founder's first-time visitor found the cold dark distance creepy, and the phone and lite tiers have no depth-based air to warm it, so the fog colour itself is the warm part.
- **Detail:** procedural geometry carries panelling, mouldings, frames, terrazzo, pipes and recesses. Quality comes from 2–5 mm bevels, real thickness, restrained roughness variation and contact shadows. Lettering is always typeset, never generated. Hero handles, close sconces, repairs and unusual mechanisms are authored as GLB later.

### Door kit

- **Sizes:** standard openings are 0.85–1.25 m wide by 2.1–2.7 m high; doubles are 1.6–2.2 m by 2.6–3.2 m. Oversized doors take adjacent bays.
- **Four silhouette families:**
  1. panelled timber;
  2. narrow glazed office door;
  3. steel industrial insertion;
  4. tall double ceremonial door.
- **Materials:** each chamber chooses one dominant material, one metal and one glazing treatment.
- **Shared grammar:** handle centre at 1.0 m; plaque centre at 1.55 m, about 280 × 90 mm; either a transom or a lamp. Titles are in Sans Condensed and codes in Mono.
- **States:**
  - An open door has a readable plaque, an inviting handle and light at its seam.
  - A sealed door shows physical closure.
  - A blank door has no departmental fittings.
  - Status is always also in text, never in colour alone.
- **The Certification Office door:**
  - **Frame:** a 1.05 × 2.25 m charcoal steel frame set into an older 1.45 × 2.9 m opening; patched plaster records the alteration.
  - **Door:** a lower teal enamel panel and upper wired glass, a closed 280 × 160 mm service hatch and a plain brass lever.
  - **Plaque:** a bone plaque reading CERTIFICATION OFFICE, with a small Mono department code.
  - **On opening:** 2900 K desk light in a narrow floor wedge, a teal reflection and a subdued mechanical hum.

### Architecture

- **Core** (`apps/web/src/` shell, `corridor/**`, `packages/ui/src/spine/**`, engine `spine.ts`) owns:
  - the landing, corridor and notice board;
  - routing, thresholds and settings;
  - the sound desk lifecycle and captions;
  - site pages and brand surfaces.
- **A chamber** (`apps/web/src/chambers/<id>/`) owns its scene, its own state machine and its door:
  - `door.ts` is data for the core door kit;
  - `index.ts` lazily exports the chamber component;
  - its props are `ChamberProps`: settings, sound, caption, `onReady`, `onLeave`, `onContextLost` and `onSceneError`.
  - Doors are data so that future community chambers can contribute a door as schema-validated data. Under `docs/DESIGN.md` §8, executable chamber code needs a reviewed release.
- **State:** `spineTransition(state, event) → { state, cues }` in `packages/engine/src/spine.ts`.
  - **Phases:** entrance, corridor, threshold and chamber; the board and pages are overlays.
  - **URL:** a projection of the state: `/`, `/<chamber-slug>`, `/about`, `/credits`, `/privacy`, with unknown paths showing the not-found page.
  - **Navigation:** back and forward arrive as ROUTE events.
  - **Text mode:** `?mode=text` is kept across navigation.
- **Rendering:**
  - The core Canvas renders the lobby and corridor; each chamber keeps its own Canvas.
  - Both exist only during the seam, at most 600 ms.
  - The corridor unmounts while a chamber is open and remounts on leaving.
  - A single shared Canvas was rejected for now: it means rewriting the verified Office scene's renderer and camera ownership. Revisit it when the second chamber exists.
- **Privacy:**
  - No storage, so the entrance plays on each fresh load of `/`. It is skippable from the first frame.
  - No network after load; the CSP keeps `connect-src 'none'`.

### Chambers are walkable rooms

Inside a chamber the visitor is also first person, with the same camera numbers, walking within the room's bounds. Authored stations (standing at the Office desk) frame an action; "Step back" or any movement input releases them. Every exit from a chamber returns to the corridor at one shared anchor: 1.4 m from that chamber's door, facing it as it closes. The Office's side door and rear service route use this anchor; neither implies a second corridor doorway. Room designs are private design documents.

### Accessibility and comfort

- **The landing is a real document:** headings, the brand, and links to enter, the board and About.
- **The corridor has a DOM mirror:** a list of doors in corridor order, each a button named "<title>, open the door" or "<title>, not yet open".
- **Reduced motion:**
  - static landing and corridor viewpoints;
  - destination controls instead of walking;
  - a 120 ms dissolve in place of travel and door swings.
- **Text mode:** the corridor in prose (`TEXT_MODE_CORRIDOR`), the door list, the board and the pages. Chambers keep their own text modes.
- **Sound:**
  - No audio before a deliberate gesture. Scrolling is not a gesture for audio; the first click, tap or key press is.
  - The lobby gramophone is the music source. A filtered, softly reverberant bed of the same record
    carries it through the walkable corridor. The diffuse path levels quiet and loud passages to a
    soft background: about −22 dBFS RMS beside the gramophone and never below about −30 dBFS along
    the route. Footsteps, doors and captions stay in front; the Sound setting, first-gesture start
    and 3 s fade apply to both paths. Music fades out over 1.5 s in a chamber.
  - Meaningful corridor sounds are captioned (`SPINE_CAPTIONS`).
- **Targets:** at least 44 px everywhere, and 48 px on the board. 4.5:1 contrast for body text over the scene. Check on a real phone in daylight.

### Performance budget (release gates; validate on real hardware)

- **Initial download:** landing and corridor at most 3 MB compressed, including JavaScript. The Office chunk loads only when its door is approached, focused or chosen on the board.
- **Corridor scene:**

  | Budget | Limit |
  |---|---|
  | Draw calls (instanced repeats) | 150 |
  | Triangles | 250k |
  | Dynamic lights | 6 |
  | Shadow maps | none; contact shadows are baked into vertex colour or textures |

- **Frame loop:** on demand, so no frames are drawn while idle. 30 fps on baseline mobile, 60 fps on desktop. Device pixel ratio is capped as in the Office.
- **Cleanup:** every geometry, texture and listener is disposed on unmount, in both directions through a door.

## Rulings on the art consult

- **R-1 (accepted).** Begin inside the lobby rather than outside the building: cheaper, and the stronger first image.
- **R-2 (accepted).** No repeated "POSITION VACANT" signs. Blank plaques only.
- **R-3 (adapted).** Endlessness: about 22 m walkable, at least 50 m of unreachable perspective. The founder's "endless doors" are honoured by varied blank doors receding into fog, not by fake destinations.
- **R-4 (accepted).** Four door families. One dominant material, one metal and one glazing treatment per chamber.
- **R-5 (deferred).** The consult asks for Content Notes and Get Support to be reachable everywhere. Support resources must be verified per region and approved by the founder; until then About carries one generic emergency line.
- **R-6 (founder decision).** Credits names the licences and the copyright holder; the in-world credits are designed privately.

## Alternatives rejected

- **A scrolling marketing landing page in front of the world.** CLAUDE.md requires that UNHELD never be a conventional website, and §5 forbids a gate.
- **Third-person avatar.** The founder chose first person only. An avatar raises representation questions and the cost of a rigged, licensed character.
- **A truly endless procedural corridor of interactive doors.** It promises destinations that do not exist, and adds walking without discovery.
- **Exterior facade at night.** Higher production cost, and it risks reading as a haunted mansion.

## Open questions (founder)

- New narrative lines need editorial review: the clippings and plaques for the sealed chambers, and the corridor prose.
- The support page: which regions and services, and who maintains it.
- The first-visit route once the Apartment exists: it is Chapter Zero's opening scene, but here it is a sealed door.

## Verification

Specified in `tasks/TQW-002.yaml`:
- unit tests for the spine machine;
- end-to-end tests for every route, door, board and page path in desktop and mobile projects, including no-WebGL, context loss, reduced motion and no-audio-before-gesture;
- screenshots of every beat for art review;
- an independent Codex review before merge.
