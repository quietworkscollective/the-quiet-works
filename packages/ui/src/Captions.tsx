import type { CaptionsProps } from './types.ts';

const MAX_LINES = 3;

/**
 * Visual captions for sounds. Decorative to assistive technology: the machine's
 * live region already carries the meaning, so announcing these too would repeat it.
 */
export function Captions({ lines }: CaptionsProps) {
  return (
    <div className="tqw-captions" aria-hidden="true">
      {lines.slice(-MAX_LINES).map((line) => (
        <p key={line.id} className="tqw-captions__line">
          {line.text}
        </p>
      ))}
    </div>
  );
}
