import { useEffect, useRef, useState } from 'react';
import { createSoundDesk } from './soundDesk.ts';
import type { SoundDesk } from './types.ts';

/**
 * The page's sound desk, alive for as long as the component that owns it is mounted.
 *
 * The desk is created when the component mounts and disposed when it unmounts. In development,
 * React's StrictMode mounts every component, unmounts it and mounts it again, to expose effects
 * that do not clean up. A disposed desk stays silent for good, so each mount makes its own desk.
 * The page holds one stable handle that forwards to whichever desk is alive; before the first
 * mount and after the last unmount, calls go nowhere.
 *
 * Settings and the current room reach a new desk through the page's own effects, which run after
 * this one on every mount.
 */
export function useSoundDesk(create: () => SoundDesk = createSoundDesk): SoundDesk {
  const live = useRef<SoundDesk | null>(null);
  const [handle] = useState<SoundDesk>(() => ({
    unlock: () => live.current?.unlock(),
    setMuted: (muted) => live.current?.setMuted(muted),
    play: (cue) => live.current?.play(cue),
    playSpine: (cue) => live.current?.playSpine(cue),
    setWalk: (speedMps) => live.current?.setWalk(speedMps),
    setRoom: (room) => live.current?.setRoom(room),
    dispose: () => live.current?.dispose(),
  }));
  useEffect(() => {
    const desk = create();
    live.current = desk;
    return () => {
      desk.dispose();
      if (live.current === desk) live.current = null;
    };
  }, [create]);
  return handle;
}
