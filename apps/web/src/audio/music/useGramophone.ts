import { useEffect, useSyncExternalStore } from 'react';
import { RECORDS, type RecordInfo } from './catalogue.ts';
import type { GramophoneState } from './needle.ts';
import { gramophone } from './index.ts';

/**
 * The gramophone, for the page. The page owns captions and the DOM; the gramophone owns the music.
 * These two hooks are all that joins them.
 */

/** The gramophone's needle and record: re-renders when either changes, never for the listener's every step. */
export function useGramophone(): GramophoneState {
  return useSyncExternalStore(gramophone.subscribe, gramophone.getState, gramophone.getState);
}

/** Whether the Sound setting is on, for the text reading. */
export function useSoundOn(): boolean {
  return useSyncExternalStore(gramophone.onMuted, () => !gramophone.isMuted(), () => true);
}

/** The record on the platter. */
export function currentRecord(state: GramophoneState): RecordInfo | undefined {
  return RECORDS[state.record];
}

/**
 * Show a caption each time a record begins to sound, but only while captions are on: with them off
 * nothing is even subscribed. `caption` is the page's own, so the line shares its position, lifetime
 * and limit with every other caption. The line is the catalogue's draft, for the editorial pass.
 */
export function useGramophoneCaptions(caption: (text: string) => void, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    return gramophone.onAnnounce(({ record }) => {
      const line = RECORDS[record]?.caption;
      if (line) caption(line);
    });
  }, [caption, enabled]);
}
