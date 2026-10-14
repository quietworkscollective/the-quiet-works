# ADR 0003 — The site: hero, game window, unlocks and footer

- **Status:** accepted. Founder layout sketch and decisions of 14 October 2026.
- **Amends:** ADR 0001 ("Experience" 1–2, the branded landing, and "Privacy": no storage).
- **Relates to:** ADR 0002 (sealed content).

## Context

ADR 0001 made the first frame a first-person lobby with the brand laid over it, and walked the
visitor in as they scrolled. The founder's layout keeps the game at the centre but frames it as a
website: a bold hero, a transition into an embedded game window, then sections beyond it for the
visitor's unlocks, the project's details and a footer.

## Decision

UNHELD is one long page of full-viewport sections, in order:

1. **Hero** (100 vh, full bleed).
   - **Background:** the live 3D world (the lobby and corridor from ADR 0001), rendered by the same
     engine as the game, with a slow, quiet ambient camera drift.
   - **Wordmark:** centred **UNHELD** with a small **.space**, bold, on a dark ground.
   - **Live details:** quiet details from this visit only (doors open, the visitor's own
     discoveries), never anything from other visitors and never a network call.
   - **Menu:** small items at the top right.
2. **Smoke** (the scroll between hero and game). A dark smoke screen rises as the visitor scrolls.
   - **Camera:** behind it the camera walks in (the ADR 0001 walk-in, now driven by this stretch of
     scroll) and arrives at the corridor hand-over.
   - **Loading:** if the game is still loading when the smoke is fully dense, a quiet "Loading" line
     holds there.
   - **Clearing:** the smoke clears onto the game window.
3. **Game window** (100 vh). The corridor at hand-over, framed as the page's centrepiece.
   - **Engaging:** a click, a tap, Enter or "Enter The Quiet Works" captures input. Wheel, swipe and
     keys walk, and the page stops scrolling.
   - **Releasing:** "Leave" (and Escape, when no dialog is open) hands scrolling back to the page.
   - **Fullscreen:** a button puts the game window into fullscreen.
   - **Chambers:** they open inside the game window, fullscreen or not.
   - **Inputs:** every ADR 0001 input rule holds inside the window.
4. **Lore and unlocks** (at least 100 vh, interactive). The visitor's own discoveries:
   - every sealed item they have opened (ADR 0002), to reread;
   - per-room counts ("Certification Office: 3 of 7 papers found");
   - quiet named recognitions.

   Items not yet found show as sealed, without their content. Two controls: "Forget everything" and
   export/import of a small file.
5. **Contributions and details** (100 vh): what UNHELD is, how it grows, how to contribute, and
   privacy in brief.
6. **Footer:** the menu again, a line of non-spoiler lore trivia, About, Credits, Privacy, the
   licences and © 2026 Asiri Dalugoda.

Scrolling past the game window leaves the experience. Scrolling back up returns to it, in the state
the visitor left.

## Rulings (founder decisions)

- **R-1 Unlocks are remembered on the device only.** One versioned key in the browser's local
  storage holds discoveries, counts and recognitions:
  - it is written only when something is discovered, and never sent anywhere;
  - there are still no accounts and no cookies;
  - "Forget everything" erases it, and export/import moves it between devices by hand;
  - the Privacy page states this plainly.

  This replaces ADR 0001's "no storage". The e2e privacy guard changes from "nothing stored" to
  "nothing stored before a discovery, only that key after, no cookies, no network".
- **R-2 Wordmark lockup:** bold UNHELD with a small .space.
- **R-3 Milestones include per-room counts.** No points, percentages-as-scores, streaks,
  leaderboards, timers or any "fixed" or "cured" framing (the design laws). Counts and
  recognitions describe what was found, never how well someone did.
- **R-4 Hero motion is the live engine,** not a video. The hero, the smoke walk-in and the game
  window share one renderer, so the page loads straight into the game.

## Consequences

- **Spine:** the landing's entrance phase becomes the page's hero and smoke scroll. "Engaged" (input
  captured by the game window) is new state, held by the core shell.
- **URLs:** chamber URLs still open their chamber directly, inside an engaged game window.
- **Pages:** About, Credits and Privacy remain addressable pages; the Contributions section links to
  them.
- **Not public:** discovery tokens and sealed plaintext never appear in the Lore section's code.
  The section shows what the visitor's own device has opened.
- **Budget:** one live 3D renderer for the hero and the game. The sections below are DOM only and
  load nothing heavy.

## Verification

- **e2e, section flow:** hero → smoke → game window; engaging and releasing; fullscreen; scrolling
  past to the sections and back.
- **e2e, storage:**
  - nothing is written before a discovery;
  - after one, only the versioned key;
  - "Forget everything" empties it;
  - export then import round-trips.
- **Privacy:** no network, before and after.
- **Accessibility and comfort:** reduced motion (no drift, no smoke animation; the transition becomes
  a dissolve), text mode, keyboard and screen-reader paths through every section.
- **Screenshots** of every section at desktop, Pixel 7 and 320 px wide, for art review.

## Proposed amendment — content-height closing sections (for maintainer review)

The archive, details and footer take their height from their content. They do not reserve a
viewport-sized minimum: an empty archive, short details copy or footer must not create an unexplained
blank screen. The archive may grow as discoveries are added, and all three sections may grow with
text zoom or visitor settings.

About, Credits, Privacy and Licences appear once in the footer. The Details section links to the
contribution guidance instead of repeating site navigation. The footer is a colophon: the UNHELD
lockup, tagline, creator credit, the four links, licence lines and copyright. It contains neither a
detached Menu control nor a trivia slot.

This proposal amends the viewport-height treatment in decisions 4 and 5, and the menu and trivia
items in decision 6. Existing content, route behavior, local progress and the shared renderer remain
as recorded above. Its status stays proposed until maintainer review.
