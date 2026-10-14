import { box, quad, type Style } from '../builder.ts';
import type { Buckets } from '../buckets.ts';
import { BRASS_TINT } from '../palette.ts';
import { cylinder, torus } from '../shapes.ts';
import { LOBBY_FRAMES } from './lobby.ts';
import { LOBBY_WINDOW } from './lobbyPlan.ts';
import { at } from './wall.ts';

/**
 * A high window in the lobby's left wall, over the notice board: the building borrowing light
 * from a well it shares with the next block. Three lights; the middle one has been given to an
 * extractor fan (the blades are an animated mesh, see ambient/LobbyLife.tsx). What shows through
 * is a pale, cool daylight, the lobby's one cold colour against 2700 K amber, painted as an
 * unlit plane at the foot of the reveal.
 */

/** Cool daylight, linear, over-bright so it reads as a light source after tone mapping. */
const DAYLIGHT_LOW = [0.44, 0.56, 0.68] as const;
const DAYLIGHT_HIGH = [0.78, 0.9, 1.02] as const;

export function buildLobbyWindow(b: Buckets, plaster: Style, oak: Style): void {
  const f = LOBBY_FRAMES.left;
  const { s, y, reveal, fan, mullions } = LOBBY_WINDOW;
  const P = (depth: number, yy: number, ss: number) => at(f, depth, yy, ss);
  const mid = (y[0] + y[1]) / 2;

  // The reveal: plaster on the jambs and the soffit, an oak sill below.
  quad(b.plaster, P(0, y[0], s[0]), P(-reveal, y[0], s[0]), P(-reveal, y[1], s[0]), P(0, y[1], s[0]), plaster, [0, 0, 1]);
  quad(b.plaster, P(-reveal, y[0], s[1]), P(0, y[0], s[1]), P(0, y[1], s[1]), P(-reveal, y[1], s[1]), plaster, [0, 0, -1]);
  quad(b.plaster, P(0, y[1], s[0]), P(-reveal, y[1], s[0]), P(-reveal, y[1], s[1]), P(0, y[1], s[1]), plaster, [0, -1, 0]);
  const sill: Style = { ...oak, colour: [1.5, 1.28, 1.05] };
  box(b.oak, [at(f, (0.11 - reveal) / 2, y[0] - 0.03, (s[0] + s[1]) / 2)[0], y[0] - 0.03, (s[0] + s[1]) / 2], [reveal + 0.11, 0.06, s[1] - s[0] + 0.1], 0.004, sill);

  // The light well: two bands of daylight, brighter overhead. Unlit, so it reads as the source.
  quad(b.lamp, P(-reveal, y[0], s[0]), P(-reveal, y[0], s[1]), P(-reveal, mid, s[1]), P(-reveal, mid, s[0]), { colour: DAYLIGHT_LOW }, [1, 0, 0]);
  quad(b.lamp, P(-reveal, mid, s[0]), P(-reveal, mid, s[1]), P(-reveal, y[1], s[1]), P(-reveal, y[1], s[0]), { colour: DAYLIGHT_HIGH }, [1, 0, 0]);

  // The frame on the room side: a heavy head, jambs, and a sill moulding, all in oak.
  const frame: Style = { colour: [1.5, 1.28, 1.05] };
  const sMid = (s[0] + s[1]) / 2;
  const w = s[1] - s[0];
  const bar = 0.075;
  box(b.oak, [at(f, 0.03, y[1] + 0.07, sMid)[0], y[1] + 0.07, sMid], [0.06, 0.14, w + 0.2], 0.005, frame);
  for (const sign of [-1, 1] as const) {
    const sj = sMid + sign * (w / 2 + 0.05);
    box(b.oak, [at(f, 0.03, mid, sj)[0], mid, sj], [0.06, y[1] - y[0] + 0.12, 0.1], 0.005, frame);
    // Inner jamb linings, so the lights' edges are crisp.
    const si = sMid + sign * (w / 2 - bar / 2);
    box(b.oak, [at(f, -0.02, mid, si)[0], mid, si], [0.08, y[1] - y[0], bar], 0.003, frame);
  }
  // Mullions between the three lights and a glazing bar across each side light.
  for (const m of mullions) {
    box(b.oak, [at(f, -0.04, mid, m)[0], mid, m], [0.14, y[1] - y[0], 0.05], 0.003, frame);
  }
  const lights: [number, number][] = [
    [s[0] + bar, mullions[0] as number - 0.025],
    [(mullions[1] as number) + 0.025, s[1] - bar],
  ];
  for (const [a, c] of lights) {
    box(b.oak, [at(f, -0.04, mid, (a + c) / 2)[0], mid, (a + c) / 2], [0.07, 0.025, c - a], 0.002, frame);
  }

  // The fan's housing: a brass ring in the middle light, held by a spider of iron bars behind the blades.
  const ring = at(f, fan.depth, fan.y, fan.s);
  torus(b.brass, { at: [ring[0], ring[1], ring[2]], rot: [0, Math.PI / 2, 0] }, fan.radius + 0.03, 0.013, 6, 36, { colour: BRASS_TINT });
  const spider = at(f, fan.depth - 0.07, fan.y, fan.s);
  // One bar up the wall and one along it.
  for (const rot of [0, Math.PI / 2] as const) {
    cylinder(b.iron, { at: [spider[0], spider[1], spider[2]], rot: [rot, 0, 0] }, 0.006, 0.006, 2 * (fan.radius + 0.03), 8, { colour: [0.5, 0.5, 0.52] });
  }
}
