import { Bucket } from '../builder.ts';
import { linear, type Rgb } from '../colour.ts';
import type { Vec3 } from '../math.ts';
import { BRASS_TINT } from '../palette.ts';
import { bar, cylinder, sphere, stud } from '../shapes.ts';
import { LOBBY_CLOCK, LOBBY_WINDOW } from '../architecture/lobbyPlan.ts';

/**
 * The geometry of things that move, each built about its own pivot so a component can turn it:
 * the fan's blades (axis along the wall's normal, x), the clock's hands (pivot at the dial's
 * centre, along z), the paper tag at the fan's switch and the repair-bench
 * mobile. Kept as plain data so their sizes can be measured and tested without a GPU.
 */

/** Enamelled iron-grey green: dark enough to read as a silhouette against the bright window. */
const BLADE: Rgb = linear('#2F3F3A');
const INK: Rgb = [0.03, 0.03, 0.034];
const SIGNAL: Rgb = linear('#B3261E');

/** Blades of the extractor fan, about the origin with the axis along +x: paint (blades) and brass (hub). */
export function fanBlades(): { paint: Bucket; brass: Bucket } {
  const paint = new Bucket();
  const brass = new Bucket();
  const radius = LOBBY_WINDOW.fan.radius;
  const blades = 5;
  for (let k = 0; k < blades; k += 1) {
    const a = (k / blades) * Math.PI * 2;
    const reach = radius * 0.86;
    const mid = radius * 0.5 + 0.05;
    // A flat paddle, pitched about its own radial axis so it would move air.
    bar(
      paint,
      { at: [0, Math.cos(a) * mid, Math.sin(a) * mid], rot: [a, 0.38, 0], order: 'XYZ' },
      [0.004, reach - 0.05, 0.095],
      { colour: BLADE },
    );
  }
  cylinder(brass, { at: [0, 0, 0], rot: [0, 0, Math.PI / 2] }, 0.034, 0.034, 0.03, 18, { colour: BRASS_TINT });
  cylinder(brass, { at: [0.022, 0, 0], rot: [0, 0, Math.PI / 2] }, 0.016, 0.016, 0.02, 12, { colour: BRASS_TINT });
  return { paint, brass };
}

/**
 * The clock's hands, pointing up from the origin in the xy plane (the dial's face is +z): the
 * hour hand short and broad, the minute hand long, the second hand thin and red with a tail.
 */
export function clockHands(): { hour: Bucket; minute: Bucket; second: Bucket } {
  const r = LOBBY_CLOCK.radius;
  const hour = new Bucket();
  const minute = new Bucket();
  const second = new Bucket();
  const spade = { colour: INK };
  // Hour: a spade-tipped bar; minute: a long slim bar; both with a short tail past the centre.
  bar(hour, { at: [0, r * 0.2, 0] }, [0.02, r * 0.5, 0.004], spade);
  bar(hour, { at: [0, r * 0.47, 0] }, [0.032, 0.05, 0.004], spade);
  bar(hour, { at: [0, -r * 0.08, 0] }, [0.014, r * 0.16, 0.004], spade);
  bar(minute, { at: [0, r * 0.3, 0.006] }, [0.013, r * 0.8, 0.004], spade);
  bar(minute, { at: [0, -r * 0.08, 0.006] }, [0.011, r * 0.16, 0.004], spade);
  bar(second, { at: [0, r * 0.32, 0.012] }, [0.005, r * 0.86, 0.003], { colour: SIGNAL });
  bar(second, { at: [0, -r * 0.14, 0.012] }, [0.009, r * 0.28, 0.003], { colour: SIGNAL });
  stud(second, [0, 0, 0.0125], 0.014, 0.014, 0.004, 14, { colour: SIGNAL });
  return { hour, minute, second };
}

/**
 * A paper tag hung from a small brass hook at the origin, down (-y), in the plane of the wall (yz).
 * A hook and no string: nothing in the world may hang as a cord or a loop (founder rule), so the tag
 * sits on a rigid hook and turns about it.
 */
export function fanTag(): { paper: Bucket; string: Bucket } {
  const paper = new Bucket();
  const hook = new Bucket();
  // The hook: a short brass pin with a rounded head, then the card hangs directly under it.
  cylinder(hook, { at: [0, -0.004, 0] }, 0.0028, 0.0028, 0.008, 8, { colour: BRASS_TINT });
  sphere(hook, { at: [0, -0.008, 0] }, 0.0045, 8, 6, { colour: BRASS_TINT });
  // The tag itself: kraft paper with a red band printed across its lower third.
  bar(paper, { at: [0, -0.052, 0] }, [0.003, 0.07, 0.044], { colour: linear('#A88B5B') });
  bar(paper, { at: [0.0018, -0.067, 0] }, [0.003, 0.012, 0.044], { colour: SIGNAL });
  stud(paper, [0.0016, -0.024, 0], 0.003, 0.003, 0.0014, 8, { colour: [0.05, 0.05, 0.05] });
  return { paper, string: hook };
}

/**
 * The mobile over the repair bench: a brass wire, three arms and five shapes cut from paper and
 * brass, balanced, with no figure in any of them. Hangs from the origin down (-y).
 */
export function repairMobile(): { paper: Bucket; brass: Bucket } {
  const paper = new Bucket();
  const brass = new Bucket();
  const metal = { colour: BRASS_TINT };
  cylinder(brass, { at: [0, -0.25, 0] }, 0.0016, 0.0016, 0.5, 6, metal);
  // The beam, and two shorter beams hung from its ends.
  bar(brass, { at: [0, -0.5, 0] }, [0.5, 0.003, 0.003], metal);
  for (const [x, drop, len] of [[-0.25, 0.16, 0.2], [0.25, 0.2, 0.26]] as const) {
    cylinder(brass, { at: [x, -0.5 - drop / 2, 0] }, 0.0012, 0.0012, drop, 5, metal);
    bar(brass, { at: [x, -0.5 - drop, 0] }, [len, 0.0025, 0.0025], metal);
  }
  // Shapes: a disc, a diamond, a long triangle, a ring and a leaf, each hung by a thread.
  const shapes: { at: Vec3; size: Vec3; colour: Rgb; round?: boolean }[] = [
    { at: [-0.35, -0.7, 0], size: [0.07, 0.07, 0.003], colour: linear('#B98B4A'), round: true },
    { at: [-0.15, -0.72, 0], size: [0.05, 0.08, 0.003], colour: linear('#8FA7A1') },
    { at: [0.12, -0.76, 0], size: [0.045, 0.1, 0.003], colour: linear('#C7B28A') },
    { at: [0.36, -0.7, 0], size: [0.08, 0.08, 0.003], colour: linear('#B5503B'), round: true },
    { at: [0.0, -0.58, 0], size: [0.05, 0.06, 0.003], colour: linear('#D4C9A9') },
  ];
  for (const s of shapes) {
    cylinder(brass, { at: [s.at[0], s.at[1] + 0.04, s.at[2]] }, 0.0008, 0.0008, 0.08, 4, metal);
    if (s.round) cylinder(paper, { at: s.at, rot: [Math.PI / 2, 0, 0] }, s.size[0] / 2, s.size[0] / 2, s.size[2], 16, { colour: s.colour });
    else bar(paper, { at: s.at, rot: [0, 0, 0.5] }, s.size, { colour: s.colour });
  }
  sphere(brass, { at: [0, -0.005, 0] }, 0.009, 8, 6, metal);
  return { paper, brass };
}
