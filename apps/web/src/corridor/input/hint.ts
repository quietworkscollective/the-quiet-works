/**
 * The first-encounter hint (ADR 0004): one dismissible line, once per visit, in memory only. A
 * visit is one load of the page: the flag lives in this module, so leaving to a room and coming
 * back does not show it again, and nothing is written to storage.
 */
export interface Visit {
  /** The hint has been offered during this visit. */
  offered: boolean;
}

/** The default visit: the page's own. */
export const pageVisit: Visit = { offered: false };

export interface FirstHint {
  /** The visitor can act now: show the hint if this visit has not had it. True if it is showing. */
  offer(): boolean;
  /** The visitor chose to close it, or did what it points at. */
  dismiss(): void;
  visible(): boolean;
  dispose(): void;
}

export interface FirstHintOptions {
  /** Called whenever the hint appears or goes. */
  onChange(visible: boolean): void;
  /** How long it stays if left alone. */
  lifetimeMs?: number;
  visit?: Visit;
  /** For tests: a timer that can be driven by hand. Returns a cancel. */
  schedule?: (fn: () => void, ms: number) => () => void;
}

export const HINT_LIFETIME_MS = 12_000;

export function createFirstHint(options: FirstHintOptions): FirstHint {
  const visit = options.visit ?? pageVisit;
  const lifetime = options.lifetimeMs ?? HINT_LIFETIME_MS;
  const schedule =
    options.schedule ??
    ((fn: () => void, ms: number) => {
      const id = window.setTimeout(fn, ms);
      return () => window.clearTimeout(id);
    });
  let showing = false;
  let cancel: (() => void) | null = null;

  const hide = (): void => {
    cancel?.();
    cancel = null;
    if (!showing) return;
    showing = false;
    options.onChange(false);
  };

  return {
    offer() {
      if (visit.offered) return showing;
      visit.offered = true;
      showing = true;
      options.onChange(true);
      cancel = schedule(hide, lifetime);
      return true;
    },
    dismiss: hide,
    visible: () => showing,
    dispose() {
      // Leaving the scene takes the line away, but the visit has had it: it does not come back.
      hide();
    },
  };
}
