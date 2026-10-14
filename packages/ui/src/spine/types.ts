import type { ReactNode } from 'react';
import type { ChamberEntry, ChamberId, DiscoveryStore, Finding, PageId } from '@tqw/engine';
import type { SettingKey, Settings } from '../types.ts';

/** Anything the page can read a 0..1 scroll progress from (the shell's `ProgressSource`). */
export interface ProgressLike {
  get(): number;
  /** Called after every change; returns an unsubscribe. */
  subscribe(listener: (value: number) => void): () => void;
}

export interface DoorListItem {
  id: ChamberId;
  title: string;
  status: ChamberEntry['status'];
  description: string;
}

export interface DoorListProps {
  doors: readonly DoorListItem[];
  focus: ChamberId | null;
  onFocusDoor(id: ChamberId): void;
  onOpenDoor(id: ChamberId): void;
  /** 'overlay' sits over the 3D corridor (visible on focus); 'list' is the text-mode list. */
  variant: 'overlay' | 'list';
}

export interface NoticeBoardProps {
  open: boolean;
  chambers: readonly ChamberEntry[];
  onChoose(id: ChamberId): void;
  onClose(): void;
}

/** One provider's third-party models and surfaces, as the Credits page lists them. */
export interface ThirdPartyGroup {
  provider: string;
  items: ReadonlyArray<{
    title: string;
    author: string;
    /** The licence by its full name. */
    licence: string;
    /** The asset's own page at the provider: a plain link, never fetched. */
    source: string;
  }>;
}

export interface SitePageProps {
  page: PageId;
  onClose(): void;
  onNavigate(page: PageId): void;
  /**
   * Lets the not-found page offer the notice board as a way back. The shell closes the page and
   * opens the board; when absent the page offers only the entrance.
   */
  onOpenBoard?: (() => void) | undefined;
  /** The maker's own site. When given, the About page names him and links it (opens in the browser's way, never fetched). */
  authorUrl?: string | undefined;
  /** The third-party models and surfaces in the rooms. When there are some, the Credits page lists them by provider. */
  thirdParty?: readonly ThirdPartyGroup[] | undefined;
}

export interface TextCorridorProps {
  doors: Omit<DoorListProps, 'variant'>;
  onOpenBoard(): void;
  /** A notice above the corridor, e.g. why text mode is showing. */
  notice?: ReactNode;
}

/** The sound control that stays directly reachable once audio is on. */
export interface SoundControl {
  /** True when sound is muted; the control then says how to turn it back on. */
  muted: boolean;
  onToggle(): void;
}

export interface SiteMenuProps {
  /** 'hero' is the top-right menu; 'footer' repeats it above the footer's links. */
  variant: 'hero' | 'footer';
  onOpenBoard(): void;
  onOpenPage(page: PageId): void;
  onOpenMenu(): void;
  /** Present once audio is on: mute stays one press away, outside the menu. */
  sound?: SoundControl | undefined;
}

export interface MenuPanelProps {
  open: boolean;
  settings: Settings;
  onToggle(key: SettingKey): void;
  canLeaveTextMode: boolean;
  onOpenBoard(): void;
  onOpenPage(page: PageId): void;
  onClose(): void;
}

export interface HeroProps {
  /** The top-right menu, built by the shell. */
  menu: ReactNode;
  /** Quiet details from this visit only, in order. Empty parts are left out by the caller. */
  details: readonly string[];
  /** The scroll cue: carry on down to The Quiet Works. */
  onScrollCue(): void;
  /** The direct link: skip the travel and enter. */
  onEnter(): void;
  /** Text mode has no 3D world behind the hero, so it needs no scrim (and its lockup is still). */
  text?: boolean | undefined;
  /** The page's scroll progress: scrolling into the smoke lets the letters of the word go. */
  progress?: ProgressLike | undefined;
  /** `SITE_SCROLL.veil`: the letters fade with the smoke's coverage. */
  keyframes?: readonly (readonly [number, number])[] | undefined;
  /** Reduced motion: the lockup fades in over 200 ms and stays perfectly still. */
  reducedMotion?: boolean | undefined;
}

export interface SmokeVeilProps {
  progress: ProgressLike;
  /** `SITE_SCROLL.veil`: coverage at progress keyframes. */
  keyframes: readonly (readonly [number, number])[];
  reducedMotion: boolean;
  /** The game window has drawn its first frame. */
  ready: boolean;
  /** "Loading" appears only if the game is still not ready this long after the veil is full. */
  loadingDelayMs: number;
}

export interface GameWindowProps {
  progress: ProgressLike;
  /** Input is captured by the game window (ADR 0003). */
  engaged: boolean;
  /** The second line of the strip when engaged: "The Quiet Works · Corridor". */
  location: string;
  /** Present inside a chamber: the room action "Return to the corridor". */
  onReturn?: (() => void) | undefined;
  /** Resting: engage. */
  onEnter(): void;
  /** Engaged: hand scrolling back to the page. */
  onLeave(): void;
  onOpenMenu(): void;
  sound?: SoundControl | undefined;
  /** Fullscreen entered (true) or left (false), by any route including the browser's own. */
  onFullscreenChange?: ((active: boolean) => void) | undefined;
  /** The smoke veil, drawn above the world. */
  veil?: ReactNode;
  /** Text mode: the section is plain reading order, with no sticky window, veil or chrome. */
  text?: boolean | undefined;
  /** The world: the corridor scene, a chamber, or the text corridor. */
  children: ReactNode;
}

export interface LoreItemInfo {
  /** An approved title. */
  title: string;
  /** A modest paper fragment, if there is one. */
  fragment?: string | undefined;
}

export interface UnlocksProps {
  store: DiscoveryStore;
  chambers: readonly ChamberEntry[];
  /** Approved public text for a found item, or null when there is none to show. */
  describe?: ((chamber: ChamberId, finding: Finding) => LoreItemInfo | null) | undefined;
  /** The name of a recognition, or null when it has none to show (its id is never shown). */
  recognitionName?: ((id: string) => string | null) | undefined;
  /** Opens a found item to read again. When absent the item has no reread action. */
  onReread?: ((chamber: ChamberId, finding: Finding) => void) | undefined;
  /** The archive was replaced wholesale (an import, or forgetting everything), not found into. */
  onReplaced?: (() => void) | undefined;
}

export interface DetailsProps {
  onOpenPage(page: PageId): void;
}

export interface FooterProps {
  /** The menu again, built by the shell. */
  menu: ReactNode;
  onOpenPage(page: PageId): void;
  /** One line of non-spoiler trivia, chosen once per visit; empty until approved. */
  trivia?: string | undefined;
}
