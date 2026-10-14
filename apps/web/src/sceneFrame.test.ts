import { describe, expect, it } from 'vitest';
import { firstFrameDrawn } from './sceneFrame.ts';

describe('firstFrameDrawn', () => {
  it('is false before the scene has published anything', () => {
    expect(firstFrameDrawn({}, 0)).toBe(false);
    expect(firstFrameDrawn({ frames: undefined, pose: undefined }, 5)).toBe(false);
  });

  it('is true as soon as a frame has been counted', () => {
    expect(firstFrameDrawn({ frames: '1' }, 0)).toBe(true);
    expect(firstFrameDrawn({ frames: '40', pose: '0,5.2,0' }, 0)).toBe(true);
  });

  it('is false while the count is still zero and no pose has been seen', () => {
    expect(firstFrameDrawn({ frames: '0' }, 10)).toBe(false);
  });

  it('counts a pose that is two animation frames old as drawn, for a scene that draws on demand', () => {
    expect(firstFrameDrawn({ frames: '0', pose: '0,5.2,0' }, 1)).toBe(false);
    expect(firstFrameDrawn({ frames: '0', pose: '0,5.2,0' }, 2)).toBe(true);
    expect(firstFrameDrawn({ pose: '0,5.2,0' }, 3)).toBe(true);
  });

  it('reads a garbled count as nothing drawn', () => {
    expect(firstFrameDrawn({ frames: 'nope' }, 0)).toBe(false);
  });
});
