/**
 * Words outside the chambers: the landing, the corridor, the notice board and the site pages.
 * Scanned by `pnpm check:content` with the story copy. The UNHELD brand speaks plainly here;
 * the building's own signage (plaques, clippings) lives in chambers.ts.
 */

export const LANDING = {
  enter: 'Enter The Quiet Works',
  board: 'Notice board',
  about: 'About',
  /** Shown mid-way through the walk in. */
  choose: 'Walk, or choose a room.',
  /** Walking hints, one per input type; shown near the end of the entrance. */
  hints: {
    pointer: 'Scroll to walk · drag to look',
    touch: 'Swipe to walk · drag to look',
    keyboard: 'Arrow keys to walk · Tab to the doors',
  },
  /** In-world lettering over the inner doors. */
  lettering: 'THE QUIET WORKS',
} as const;

export const CORRIDOR_COPY = {
  /** The visually hidden heading for the corridor view. */
  heading: 'The corridor',
  backToEntrance: 'Back to the entrance',
  backToCorridor: 'Return to the corridor',
  /** Accessible name suffix for a door's DOM equivalent. */
  doorOpen: 'open the door',
  doorSealed: 'not yet open',
} as const;

/** Why the corridor is in text: same reasons as a chamber's, in the building's terms. */
export const TEXT_MODE_NOTICE_CORRIDOR = {
  chosen: 'Text mode. The corridor and every door are written out here.',
  unsupported: 'The 3D view is not available here. Nothing is lost; the corridor and every door are here, in text.',
  contextLost: 'The 3D view has stopped responding. Nothing is lost; the corridor and every door are here, in text.',
} as const;

/**
 * Things to touch in the corridor (ADR 0004). Drafts for editorial review: humour opens the
 * interaction, the object carries the rest; nothing tells the visitor what to feel.
 */
export const CORRIDOR_PROPS = {
  /** The verb shown on hover, focus and touch. */
  verbs: {
    'trophy-cabinet': 'Inspect trophies',
    'team-photo': 'Read caption',
    'watering-can': 'Water the plant',
    football: 'Turn the football',
    'cricket-bat': 'Turn the bat',
    'team-shirts': 'Lift a shirt',
    'walking-boots': 'Inspect the boots',
    'repair-kit': 'Open the repair tin',
    'bicycle-wheel': 'Turn the wheel',
    'recipe-drawer': 'Read a recipe card',
    chess: 'Move a piece',
    'work-glove': 'Turn the glove',
  },
  /** Small institutional labels fixed to the props. */
  labels: {
    'trophy-cabinet': 'POLISHING ROTA: Silverware monthly. Participants as required.',
    'team-shirts': 'TEAM DISBANDED. Laundry arrangements remain in force.',
    'walking-boots': 'OUTING POSTPONED. Boots remain available.',
    'repair-kit': 'REPAIRS DEPARTMENT. Buttons accepted without appointment.',
    'recipe-drawer': 'SERVES FOUR. Additional chairs may be borrowed.',
    'team-photo': 'ATTENDANCE COMPLETE. Several members are behind the camera.',
  },
  /** Engraved on the trophies; the last shelf space is kept. */
  trophies: ['MOST COMPOSED · 1987', 'BEST EFFORT · NOT SHOWN', 'RUNNER-UP · ASKING FOR HELP', 'RESERVED'],
  /** The notice board's office-hours card follows the visitor's own clock; nothing is sent anywhere. */
  officeHours: {
    open: 'OFFICE HOURS: NINE TO FIVE. ENQUIRIES WELCOME.',
    closed: 'OFFICE HOURS: CLOSED. COME IN ANYWAY.',
  },
  /** Shown once per visit near the start, dismissible. */
  firstHint: 'Choose the board or a door to look closer.',
  /** Sealed chamber doors offer this instead of an open verb. */
  sealedDoor: 'Inspect door, not yet open',
} as const;

/** Captions for corridor props' sounds: bracketed, at most seven words. */
export const PROP_CAPTIONS = {
  radiator: '[the radiator knocks twice, politely]',
  wheel: '[a bicycle wheel ticks, slowing]',
  drip: '[one drop lands in a saucer]',
  cabinet: '[a cabinet catch clicks open]',
} as const;

export const BOARD = {
  title: 'Notice board',
  intro: 'Every department posts its notice here. Choose one to go straight in.',
  open: 'Go in',
  sealed: 'Not yet open',
  close: 'Close the notice board',
} as const;

/** Captions for corridor sounds: bracketed, at most seven words, like the chamber captions. */
export const SPINE_CAPTIONS = {
  'door-focus': null,
  'door-open': '[a latch gives; the door swings in]',
  'door-sealed': '[the handle rattles; the door holds]',
  'chamber-enter': null,
  'chamber-leave': '[a door closes softly behind you]',
  'board-open': '[paper stirs on the board]',
  'board-close': null,
} as const;

/** Text mode for the corridor: the same building in prose, with every door listed after it. */
export const TEXT_MODE_CORRIDOR: readonly string[] = [
  'A long corridor, built around 1910 and altered ever since. Oak panelling to waist height, pale plaster above, a terrazzo floor that carries footsteps a long way. Brass lamps make pools of light with long stretches of shadow between them.',
  'The doors do not match. Each department arrived in its own decade and brought its own door. Further down, past the last lamp, blank doors keep going until the dark takes them.',
];

export interface SitePage {
  title: string;
  /** Paragraphs, in order. */
  body: readonly string[];
}

export const ABOUT: SitePage = {
  title: 'About UNHELD',
  body: [
    'UNHELD is an interactive artwork about the expectations men carry without saying so, and the inner lives that go on underneath them.',
    'Its world is The Quiet Works: a building of departments, each one an absurd machine for something people are told to manage alone. You walk its corridor, open a door, and play. Some of it is funny. Some of it is quietly not.',
    'It is an artwork, not a support service. It does not assess anyone, and nothing you do here is scored.',
    'If you are in immediate danger, contact your local emergency number.',
  ],
};

/**
 * DRAFT FOR EDITORIAL REVIEW. The About page names its maker, and links his own site. The address
 * is not copy: it lives in the site's identity file (apps/web/src/site.ts, SITE.authorUrl) and the
 * page renders the link, so this holds only the words.
 */
export const AUTHOR = {
  line: 'UNHELD is made by Siri (Asiri) Dalugoda.',
  linkLabel: 'dalugoda.com',
} as const;

export const PRIVACY: SitePage = {
  title: 'Privacy',
  body: [
    'UNHELD has no accounts, no cookies, no analytics and no advertising. Until you find something, it stores nothing in your browser.',
    'Once you find something, UNHELD keeps one small record in your browser’s local storage, under the name unheld.v1, so your archive is still there on your next visit. The record never leaves your device. You can export it, import it, or forget everything in your archive.',
    'As you enter rooms, UNHELD may load its own room code, models and written records from the same site. It does not connect to other servers. Your archive stays in this browser. Sound is made here too; nothing is recorded.',
    'The site is served by Cloudflare, which handles standard request data such as IP addresses in order to deliver pages. UNHELD does not receive or keep that data.',
  ],
};

export const CREDITS: SitePage = {
  title: 'Credits',
  body: [
    'UNHELD and The Quiet Works are an independent artwork by Siri (Asiri) Dalugoda. Every word and sound is original to the project, and so is the design of its scenes. Some models and surfaces in the rooms are by other people and are credited below. © 2026 Siri (Asiri) Dalugoda.',
    'The code is licensed under the Apache License 2.0, and the original art and writing under Creative Commons Attribution 4.0 (CC BY 4.0). The UNHELD name and mark are not licensed.',
    'Typefaces: IBM Plex Mono, IBM Plex Sans Condensed and Newsreader, all under the SIL Open Font License.',
    'Software: React, Three.js and React Three Fiber (MIT). The full licence texts for everything bundled are published with the site in third-party-notices.txt.',
  ],
};

/**
 * DRAFT FOR EDITORIAL REVIEW. The Credits page's list of third-party models and surfaces. The list
 * itself (title, author, licence, source) is generated from the asset catalogue at build time; this
 * is the writing around it. `{author}` is filled in by the page.
 */
export const THIRD_PARTY_COPY = {
  heading: 'Third-party assets',
  intro:
    'Some models and surfaces in the rooms were made by other people and shared for anyone to use. Each one is listed below with its author and licence. Each title links to where it came from.',
  by: 'by {author}',
  original: "The models made for UNHELD itself are part of the project's own work, under Creative Commons Attribution 4.0 (CC BY 4.0).",
} as const;

export const NOT_FOUND: SitePage = {
  title: "This address isn't in the directory",
  body: ['The building has many doors, but not this one.'],
};

export const PAGE_NAV = {
  about: 'About',
  credits: 'Credits',
  privacy: 'Privacy',
  close: 'Close',
} as const;

// ---------------------------------------------------------------------------------------------
// ADR 0003: the page's sections.
//
// DRAFT COPY, FOR EDITORIAL REVIEW. Everything below is the DOM lane's proposal, built from the
// ADR and consult 4; none of it is approved for publication. Where a string carries `{n}`,
// `{found}` or `{total}`, the page fills in the number.
// ---------------------------------------------------------------------------------------------

export const HERO_COPY = {
  /** The cue near the foot of the hero. */
  scrollCue: 'Scroll to The Quiet Works',
  /** Quiet details from this visit only, set side by side on the page. Omitted when empty. */
  doorsOne: '1 door open',
  doorsMany: '{n} doors open',
  discoveriesOne: '1 discovery this visit',
  discoveriesMany: '{n} discoveries this visit',
} as const;

export const MENU_COPY = {
  menu: 'Menu',
  settings: 'Settings',
  close: 'Close the menu',
  /** The skip link at the very top of the page. */
  skip: 'Skip to The Quiet Works',
  /** The directly reachable sound control, shown once audio is on. */
  sound: 'Sound',
} as const;

export const GAME_WINDOW_COPY = {
  /** The resting strip's title. */
  title: 'The Quiet Works',
  /** The accessible name of the section. */
  label: 'The game window',
  enterLine: 'Enter to walk. Leave to scroll the page.',
  leave: 'Leave',
  leaveKey: 'Esc',
  fullscreen: 'Fullscreen',
  exitFullscreen: 'Exit fullscreen',
  /** Phones: the mode is said in words, resting and engaged. */
  modeResting: 'Page · swipe to scroll',
  modeEngaged: 'Walking · swipe to move',
  loading: 'Loading',
} as const;

export const ARCHIVE_COPY = {
  title: 'Your archive',
  intro: 'What this device has opened, kept here to read again. There is nothing to complete.',
  /** Per room: "3 of 7 papers found." */
  papersFound: '{found} of {total} papers found.',
  /** Secrets are counted only once found, with no total, so how many exist stays unspoiled. */
  secretsOne: '1 secret found.',
  secretsMany: '{n} secrets found.',
  sealed: 'Sealed',
  reread: 'Read again',
  /** What a found item is called when no approved title is available. */
  kinds: { memo: 'A paper', secret: 'A secret', payoff: 'A find', line: 'A note' },
  noRooms: 'More rooms will appear here as they open.',
  export: 'Export discoveries',
  import: 'Import discoveries',
  forget: 'Forget everything',
  deviceOnly: 'This archive is kept on this device only. It is never sent anywhere, and there is no account.',
  exported: 'Saved as unheld-discoveries.json.',
  imported: 'Imported. This archive now matches that file.',
  importFailed: 'That file could not be read, so nothing was changed.',
  forgotten: 'Forgotten. This device remembers nothing.',
  forgetTitle: 'Forget everything?',
  forgetBody:
    'This erases every paper and secret this device has opened. No copy exists anywhere else, so it cannot be undone.',
  forgetExport: 'Export first',
  forgetCancel: 'Cancel',
  forgetConfirm: 'Forget everything',
} as const;

export const CONTRIBUTIONS_COPY = {
  title: 'What UNHELD is, and how it grows',
  intro:
    'UNHELD is an interactive artwork about the expectations men carry without saying so. The Quiet Works is its building: a corridor of doors, each opening onto one absurd machine.',
  topics: [
    {
      title: 'How it grows',
      body: 'Rooms open one at a time, each built by hand. Until a room opens, its door stays shut and says so.',
    },
    {
      title: 'How to contribute',
      body: 'The project is open source. The code is Apache 2.0, and the art and writing are CC BY 4.0. Changes arrive as pull requests, and a maintainer reviews each one. New public copy gets an editorial review before it ships. First-person stories are published only with the contributor’s explicit consent.',
    },
    {
      title: 'What stays on your device',
      body: 'What you find is saved in your browser, on this device only, as one small record under the name unheld.v1. There are no accounts, no cookies and no analytics, and nothing is sent anywhere. Forgetting everything erases that record.',
    },
  ],
} as const;

export const FOOTER_COPY = {
  label: 'Site footer',
  licences: 'Licences',
  licencesNote: 'Code: Apache License 2.0. Art and writing: CC BY 4.0.',
  copyright: '© 2026 Siri (Asiri) Dalugoda',
  /** Non-spoiler trivia, one chosen per visit from this pool. Empty until suitable copy is approved. */
  trivia: [] as readonly string[],
} as const;
