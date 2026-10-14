/**
 * The UNHELD mark: an open lintel. Two uprights and a top bar, but the right upright stops short
 * of the bar, so the lintel spans the doorway without resting on it. Drawn on a 16-unit grid so
 * that at 16 px it lands on whole pixels: 2 px strokes and a 3 px gap, one pixel of margin all
 * round.
 *
 * `apps/web/public/favicon.svg` and the PNG icons (scripts/brand-assets.mjs) draw the same path;
 * a test keeps them from drifting apart.
 */
export const MARK = {
  /** Left upright and top bar, then the right upright, which starts below the bar. */
  path: 'M2 15V2h13M14 6v9',
  viewBox: '0 0 16 16',
  stroke: 2,
  /** The opening at the upper right: the bar's underside (y = 3) to the right upright's top (y = 6). */
  gap: 3,
} as const;

export interface MarkProps {
  /** Rendered size in CSS px (the mark is square). */
  size?: number;
  className?: string;
  /** Names the mark for assistive technology. Omit it when text beside the mark already says UNHELD. */
  title?: string;
}

export function Mark({ size = 24, className, title }: MarkProps) {
  return (
    <svg
      className={className ?? 'tqw-mark'}
      viewBox={MARK.viewBox}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={MARK.stroke}
      strokeLinecap="butt"
      strokeLinejoin="miter"
      focusable="false"
      data-mark=""
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true })}
    >
      <path d={MARK.path} />
    </svg>
  );
}
