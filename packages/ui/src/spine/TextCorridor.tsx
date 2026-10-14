import { BOARD, CORRIDOR_COPY, TEXT_MODE_CORRIDOR } from '@tqw/engine';
import { DoorList } from './DoorList.tsx';
import type { TextCorridorProps } from './types.ts';

/**
 * The corridor in prose with every door listed after it (text mode, or no WebGL). It stands in
 * the page's reading order where the game window would be; the hero above it already says
 * UNHELD.
 */
export function TextCorridor({ doors, onOpenBoard, notice }: TextCorridorProps) {
  return (
    <main className="tqw-text tqw-text-corridor">
      {notice}
      <h1>{CORRIDOR_COPY.heading}</h1>
      {TEXT_MODE_CORRIDOR.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      <DoorList {...doors} variant="list" />
      <button type="button" className="tqw-link-button" onClick={onOpenBoard}>
        {BOARD.title}
      </button>
    </main>
  );
}
