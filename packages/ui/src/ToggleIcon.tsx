import type { SettingKey } from './types.ts';

/**
 * Inline line icons for the settings toggles, drawn for this project: one 24-unit grid,
 * one stroke weight, round caps. No icon library.
 *
 * Each icon changes SHAPE between off and on, so the state never depends on colour:
 *   Sound           speaker with waves  <->  speaker struck through
 *   Reduced motion  wave                <->  two level lines
 *   Captions        outlined box        <->  filled box
 *   Text mode       cube (the 3D view)  <->  lines of text
 */
export function ToggleIcon({ kind, pressed }: { kind: SettingKey; pressed: boolean }) {
  return (
    <svg
      className="tqw-toggle__icon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-icon={`${kind}-${pressed ? 'on' : 'off'}`}
    >
      {shapes(kind, pressed)}
    </svg>
  );
}

function shapes(kind: SettingKey, pressed: boolean) {
  switch (kind) {
    case 'muted':
      // `pressed` here is "sound is on".
      return pressed ? (
        <>
          <path d="M4 9.5h3.2L12 5.6v12.8l-4.8-3.9H4z" />
          <path d="M15.2 9.2a4 4 0 0 1 0 5.6" />
          <path d="M17.8 6.6a7.6 7.6 0 0 1 0 10.8" />
        </>
      ) : (
        <>
          <path d="M4 9.5h3.2L12 5.6v12.8l-4.8-3.9H4z" />
          <path d="M15.6 9.6l5 4.8m0-4.8l-5 4.8" />
        </>
      );
    case 'reducedMotion':
      return pressed ? (
        <path d="M4 9.5h16M4 14.5h16" />
      ) : (
        <path d="M2.5 12c1.6-5 3.2-5 4.8 0s3.2 5 4.8 0 3.2-5 4.8 0 3.2 5 4.8 0" />
      );
    case 'captions':
      return (
        <>
          {/* On: the box is filled, a second shape that the outline alone does not have. */}
          {pressed ? <rect x="3" y="5.5" width="18" height="13" rx="2.5" fill="currentColor" fillOpacity="0.24" stroke="none" /> : null}
          <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
          <path d="M7 11h3.5M13 11h4M7 14.5h6M15.5 14.5H17" />
        </>
      );
    case 'textMode':
      return pressed ? (
        <path d="M5 6.5h14M5 11h14M5 15.5h9" />
      ) : (
        <>
          <path d="M12 3.2l7.6 4.4v8.8L12 20.8l-7.6-4.4V7.6z" />
          <path d="M4.4 7.6L12 12l7.6-4.4M12 12v8.8" />
        </>
      );
  }
}
