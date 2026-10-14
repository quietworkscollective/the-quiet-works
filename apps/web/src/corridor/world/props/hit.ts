import { PROPS, type PropId } from '../../props.ts';
import type { Vec3 } from '../math.ts';
import type { Assembly, Box3Like } from './parts.ts';
import { placementOf } from './placement.ts';

/**
 * Where a prop can be hit. A prop is never a precision target (a hand on a trackpad, a thumb on a
 * phone): its hit area is its own extent plus a margin, never smaller than 0.42 m a side along the
 * wall and in height, so it stays above 44 CSS px out to about nine metres at the corridor's lens.
 */
export const HIT = {
  /** Margin added on every side of what the prop is made of, metres. */
  pad: 0.1,
  /** The smallest hit area along the wall and in height, metres. */
  minSpan: 0.42,
  /** The smallest depth out from the wall, metres. */
  minDepth: 0.22,
} as const;

export interface HitBox {
  id: PropId;
  /** World-space centre. */
  centre: Vec3;
  /** World-space size: x, y, z. */
  size: Vec3;
}

/** One axis of a hit box: the region padded, then grown about its middle to the smallest span. */
function axis(low: number, high: number, want: number): [number, number] {
  const lo = low - HIT.pad;
  const hi = high + HIT.pad;
  if (hi - lo >= want) return [lo, hi];
  const mid = (lo + hi) / 2;
  return [mid - want / 2, mid + want / 2];
}

/**
 * Where a prop is when nothing built says: the contract's approximate size, against its wall, at its
 * placement. A prop whose visual is external has no bounds in the assembly, and is hit here.
 */
function contractRegion(id: PropId): Box3Like {
  const spec = PROPS.find((p) => p.id === id);
  const p = placementOf(id);
  if (!spec) throw new RangeError(`unknown prop ${id}`);
  const [w, h, d] = spec.size;
  const y: [number, number] = spec.height === 0 ? [0, h] : [p.height - h / 2, p.height + h / 2];
  const x: [number, number] = spec.side === 'left' ? [p.wallX, p.wallX + d] : [p.wallX - d, p.wallX];
  return { min: [x[0], y[0], p.z - w / 2], max: [x[1], y[1], p.z + w / 2] };
}

export function hitBoxes(assembly: Assembly): HitBox[] {
  const out: HitBox[] = [];
  for (const { id } of PROPS) {
    const region = assembly.hits.get(id) ?? assembly.bounds.get(id) ?? contractRegion(id);
    // The wall is at constant x on both sides, so the depth axis is x and the wall runs along z.
    const x = axis(region.min[0], region.max[0], HIT.minDepth);
    const y = axis(region.min[1], region.max[1], HIT.minSpan);
    const z = axis(region.min[2], region.max[2], HIT.minSpan);
    out.push({
      id,
      centre: [(x[0] + x[1]) / 2, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2],
      size: [x[1] - x[0], y[1] - y[0], z[1] - z[0]],
    });
  }
  return out;
}

export interface PointerEventLike {
  stopPropagation(): void;
}

export type PointerKind = 'over' | 'out' | 'click';

/**
 * The pointer handlers of a prop's hit area. A hover or a click reports the prop and stops there,
 * so the door or the notice board behind a prop's generous hit area never answers for it too.
 */
export function pointerHandlers(id: PropId, onPointer: (id: PropId, kind: PointerKind) => void) {
  return {
    onPointerOver: (e: PointerEventLike) => {
      e.stopPropagation();
      onPointer(id, 'over');
    },
    onPointerOut: () => onPointer(id, 'out'),
    onClick: (e: PointerEventLike) => {
      e.stopPropagation();
      onPointer(id, 'click');
    },
  };
}
