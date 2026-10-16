import { ToggleIcon } from './ToggleIcon.tsx';
import type { SettingKey, SettingsBarProps } from './types.ts';

const TEXT_MODE_LOCKED = 'The 3D view is unavailable on this device.';

interface Toggle {
  key: SettingKey;
  /** Accessible name and tooltip. Fixed: the e2e suite and assistive technology rely on it. */
  label: string;
}

const TOGGLES: readonly Toggle[] = [
  { key: 'muted', label: 'Sound' },
  { key: 'reducedMotion', label: 'Reduced motion' },
  { key: 'captions', label: 'Captions' },
  { key: 'textMode', label: 'Text mode' },
];

/**
 * Four toggle buttons in one compact row. Each pairs an inline icon with its label; on
 * narrow screens the label is hidden visually (never removed, so it stays the accessible
 * name) and the icon carries the control. State is carried by `aria-pressed` and by the
 * icon changing shape between off and on, so it never relies on colour alone.
 */
export function SettingsBar({ settings, onToggle, canLeaveTextMode }: SettingsBarProps) {
  return (
    <div role="group" aria-label="Settings" className="tqw-settings">
      {TOGGLES.map(({ key, label }) => {
        const locked = key === 'textMode' && !canLeaveTextMode;
        // The Sound toggle reads as "sound is on", which is the inverse of `muted`.
        const pressed = key === 'muted' ? !settings.muted : locked || settings[key];
        return (
          <button
            key={key}
            type="button"
            className="tqw-toggle"
            aria-pressed={pressed}
            disabled={locked}
            // A tooltip for the icon-only layout. Equal to the name, so it is not announced twice.
            title={locked ? TEXT_MODE_LOCKED : label}
            onClick={() => onToggle(key)}
          >
            <span className="tqw-toggle__face">
              <ToggleIcon kind={key} pressed={pressed} />
              <span className="tqw-toggle__label">{label}</span>
              <span className="tqw-toggle__state" aria-hidden="true">{pressed ? 'On' : 'Off'}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
