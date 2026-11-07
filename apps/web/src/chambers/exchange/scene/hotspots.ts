import type { ExchangeState } from '../state.ts';
import type { ExchangeHotspot, ExchangeLineHotspot, ExchangeViewId, StagePoint } from '../stage.ts';

/**
 * Generous hit volumes, in script coordinates. They live here as plain boxes, not scene meshes, so a
 * pick is a pure function of ray, view and state, and nothing touches the draw count or the bake.
 */
type SetPoint = readonly [x: number, y: number, z: number];

export interface HitVolume {
  readonly id: ExchangeHotspot;
  readonly min: SetPoint;
  readonly max: SetPoint;
  /** The model nodes that take the outline. */
  readonly nodes: readonly string[];
}

interface HitSpec extends HitVolume {
  readonly views: readonly ExchangeViewId[];
  readonly when?: (state: ExchangeState) => boolean;
}

const LINE_COLUMNS: readonly number[] = [-1.375, -0.46, 0.455, 1.37];
const LINE_ROWS: readonly number[] = [1.52, 2.44, 3.36];
const CELL_HALF_WIDTH = 0.4575;
const CELL_HALF_HEIGHT = 0.46;
const LOWEST_CELL_FLOOR = 1.25;

const plateOpen = (state: ExchangeState) => state.plate === 'open';
const plateShut = (state: ExchangeState) => state.plate === 'shut';
const leadSeated = (state: ExchangeState) => state.lead === 'seated';
const seated = (state: ExchangeState) => state.plug === 'seated';

function lineVolumes(): HitSpec[] {
  return Array.from({ length: 12 }, (_, index) => {
    const line = index + 1;
    const x = LINE_COLUMNS[index % 4] ?? 0;
    const z = LINE_ROWS[Math.floor(index / 4)] ?? 0;
    const number = String(line).padStart(2, '0');
    return {
      id: `line-${line}` as ExchangeLineHotspot,
      views: line <= 2 ? ['wide', 'jacks', 'shelf'] : ['wide', 'jacks'],
      min: [x - CELL_HALF_WIDTH, 8.58, line <= 4 ? LOWEST_CELL_FLOOR : z - CELL_HALF_HEIGHT],
      max: [x + CELL_HALF_WIDTH, 8.65, z + CELL_HALF_HEIGHT],
      nodes: [line === 3 ? 'certification_jack' : `line_jack_${number}`, `line_lamp_${number}`, `line_card_${number}`],
    };
  });
}

/** Low points are the build's catenaries; a parabola between the ends stays within two centimetres. */
const CORD_FROM: SetPoint = [-0.60, 5.76, 1.55];
const CORD_POSES = {
  rest: { end: [0.455, 8.35, 1.02], low: 0.83, node: 'enquiry_cord_rest' },
  guide: { end: [0.455, 8.35, 1.14], low: 0.88, node: 'enquiry_cord_guide' },
  seated: { end: [0.455, 8.385, 1.52], low: 1.10, node: 'enquiry_cord_seated' },
} as const;
const CORD_SPANS = 8;
const CORD_REACH = 0.07;

function cordVolumes(plug: keyof typeof CORD_POSES): HitSpec[] {
  const { end, low, node } = CORD_POSES[plug];
  const sag = (CORD_FROM[2] + end[2]) / 2 - low;
  const point = (t: number): SetPoint => [
    CORD_FROM[0] + (end[0] - CORD_FROM[0]) * t,
    CORD_FROM[1] + (end[1] - CORD_FROM[1]) * t,
    CORD_FROM[2] + (end[2] - CORD_FROM[2]) * t - 4 * sag * t * (1 - t),
  ];
  return Array.from({ length: CORD_SPANS }, (_, index) => {
    const a = point(index / CORD_SPANS);
    const b = point((index + 1) / CORD_SPANS);
    return {
      id: 'cord' as const,
      views: ['wide', 'jacks', 'desk-top'] as const,
      when: (state: ExchangeState) => state.plug === plug,
      min: [Math.min(a[0], b[0]) - CORD_REACH, Math.min(a[1], b[1]), Math.min(a[2], b[2]) - CORD_REACH] as const,
      max: [Math.max(a[0], b[0]) + CORD_REACH, Math.max(a[1], b[1]), Math.max(a[2], b[2]) + CORD_REACH] as const,
      nodes: [node, 'enquiry_cord_post'],
    };
  });
}

const VOLUMES: readonly HitSpec[] = [
  { id: 'sign', views: ['wide'], min: [-1.26, 8.56, 4.09], max: [1.26, 8.65, 4.51], nodes: ['exchange_board_title', 'exchange_board_title_face'] },
  // The window sits above every frame, so the hotspot is the cool light it throws on the steel.
  { id: 'clerestory', views: ['wide'], min: [0.5, 8.6, 4.62], max: [1.95, 8.66, 6.5], nodes: [] },
  { id: 'desk-lamp', views: ['wide', 'desk-top'], min: [-0.42, 5.33, 1.29], max: [-0.14, 5.61, 1.47], nodes: ['bankers_lamp'] },
  { id: 'desk-lamp', views: ['wide', 'desk-top'], min: [-0.68, 5.36, 1.08], max: [-0.44, 5.58, 1.14], nodes: ['bankers_lamp'] },
  { id: 'telephone', views: ['wide', 'desk-top'], min: [0.25, 5.09, 1.08], max: [0.59, 5.37, 1.21], nodes: ['inspect_handset', 'phone_handset'] },
  { id: 'telephone', views: ['wide', 'desk-top'], when: state => state.handset === 'cradle', min: [0.15, 5.18, 1.19], max: [0.69, 5.28, 1.35], nodes: ['inspect_handset', 'phone_handset'] },
  { id: 'telephone', views: ['wide', 'desk-top'], when: state => state.handset === 'off-hook', min: [0.38, 5.44, 1.08], max: [0.86, 5.76, 1.25], nodes: ['phone_handset'] },
  { id: 'rulebook', views: ['wide', 'desk-top'], min: [-0.42, 5.18, 1.08], max: [0.04, 5.52, 1.15], nodes: ['inspect_rulebook'] },
  { id: 'bell', views: ['wide', 'desk-top'], min: [0.72, 5.22, 1.08], max: [0.96, 5.46, 1.21], nodes: ['inspect_desk_bell'] },
  { id: 'flask', views: ['wide', 'desk-top'], min: [-0.77, 5.54, 1.08], max: [-0.59, 5.72, 1.36], nodes: ['inspect_tea_flask'] },
  { id: 'cardigan', views: ['wide'], min: [-1.02, 4.04, 0.60], max: [-0.38, 4.30, 1.38], nodes: ['inspect_cardigan'] },

  ...lineVolumes(),
  { id: 'plug', views: ['wide', 'jacks'], when: state => state.plug === 'rest', min: [0.38, 8.33, 0.98], max: [0.53, 8.62, 1.07], nodes: ['enquiry_plug'] },
  { id: 'plug', views: ['wide', 'jacks'], when: state => state.plug === 'guide', min: [0.38, 8.33, 1.09], max: [0.53, 8.62, 1.19], nodes: ['enquiry_plug'] },
  { id: 'plug', views: ['wide', 'jacks'], when: seated, min: [0.40, 8.36, 1.47], max: [0.51, 8.58, 1.57], nodes: ['enquiry_plug'] },
  { id: 'lever', views: ['wide', 'jacks'], min: [1.28, 8.36, 0.98], max: [1.46, 8.60, 1.18], nodes: ['night_service_switch', 'night_service_base'] },
  ...cordVolumes('rest'),
  ...cordVolumes('guide'),
  ...cordVolumes('seated'),

  { id: 'drawer', views: ['jacks', 'shelf'], when: state => !seated(state), min: [-1.66, 8.38, 0.79], max: [-1.14, 8.64, 0.96], nodes: ['ticket_shelf_drawer'] },
  { id: 'drawer', views: ['jacks', 'shelf'], when: seated, min: [-1.66, 8.17, 0.79], max: [-1.14, 8.42, 0.93], nodes: ['ticket_shelf_drawer'] },
  { id: 'form', views: ['jacks', 'shelf'], when: seated, min: [-1.64, 8.19, 0.93], max: [-1.16, 8.40, 0.97], nodes: ['ticket_form'] },
  { id: 'rota', views: ['jacks', 'shelf'], min: [-1.05, 8.56, 0.99], max: [-0.79, 8.65, 1.25], nodes: ['inspect_shift_roster', 'rota_clipboard'] },
  { id: 'index', views: ['jacks', 'shelf'], min: [-0.71, 8.56, 0.99], max: [-0.39, 8.65, 1.13], nodes: ['inspect_shelf_index', 'shelf_index_frame'] },

  { id: 'diagram', views: ['kneehole'], min: [-0.40, 5.70, 0.22], max: [0.04, 5.75, 0.54], nodes: ['inspect_wiring_diagram', 'wiring_diagram_sheet'] },
  // Shut, the plate covers the recess, so a tap anywhere on it lands on the plate.
  { id: 'plate', views: ['kneehole'], when: plateShut, min: [0.49, 5.68, 0.22], max: [0.87, 5.75, 0.50], nodes: ['operator_plate', 'operator_plate_outer'] },
  { id: 'plate', views: ['kneehole'], when: plateOpen, min: [0.13, 5.58, 0.22], max: [0.49, 5.71, 0.50], nodes: ['operator_plate', 'operator_plate_inner'] },
  { id: 'socket', views: ['kneehole'], when: plateOpen, min: [0.60, 5.70, 0.30], max: [0.745, 5.75, 0.46], nodes: ['operator_socket'] },
  { id: 'lead', views: ['kneehole'], when: state => plateOpen(state) && !leadSeated(state), min: [0.52, 5.70, 0.26], max: [0.60, 5.75, 0.48], nodes: ['operator_test_lead_rest'] },
  { id: 'lead', views: ['kneehole'], when: state => plateOpen(state) && leadSeated(state), min: [0.52, 5.70, 0.40], max: [0.60, 5.75, 0.48], nodes: ['operator_test_lead_seated'] },
  { id: 'docket', views: ['kneehole'], when: plateOpen, min: [0.745, 5.70, 0.29], max: [0.84, 5.75, 0.43], nodes: ['inspect_fitter_docket'] },
  { id: 'ticket-lip', views: ['kneehole'], min: [0.55, 5.68, 0.19], max: [0.81, 5.75, 0.222], nodes: ['operator_ticket_lip'] },
  { id: 'ticket-lip', views: ['kneehole'], when: state => plateOpen(state) && state.handset === 'off-hook', min: [0.55, 5.68, 0.222], max: [0.81, 5.72, 0.27], nodes: ['operator_ticket_lip', 'operator_ticket_old', 'operator_ticket_new'] },
];

export function hitVolumes(view: ExchangeViewId, state: ExchangeState): readonly HitVolume[] {
  return VOLUMES.filter(volume => volume.views.includes(view) && (volume.when?.(state) ?? true));
}

/** Every node an outline may name, so a test can hold the list to the exported model. */
export const OUTLINE_NODES: readonly string[] = [...new Set(VOLUMES.flatMap(volume => volume.nodes))];

export function outlineNodes(id: ExchangeHotspot, view: ExchangeViewId, state: ExchangeState): readonly string[] {
  return [...new Set(hitVolumes(view, state).filter(volume => volume.id === id).flatMap(volume => volume.nodes))];
}

function entry(origin: SetPoint, direction: SetPoint, volume: HitVolume): number | null {
  let near = 0;
  let far = Infinity;
  for (const axis of [0, 1, 2] as const) {
    const start = origin[axis];
    const step = direction[axis];
    const low = volume.min[axis];
    const high = volume.max[axis];
    if (Math.abs(step) < 1e-9) {
      if (start < low || start > high) return null;
      continue;
    }
    const a = (low - start) / step;
    const b = (high - start) / step;
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
    if (near > far) return null;
  }
  return near;
}

/** The nearest volume along a stage-space ray. */
export function pickHotspot(origin: StagePoint, direction: StagePoint, volumes: readonly HitVolume[]): ExchangeHotspot | null {
  const from: SetPoint = [origin[0], -origin[2], origin[1]];
  const along: SetPoint = [direction[0], -direction[2], direction[1]];
  let best: ExchangeHotspot | null = null;
  let nearest = Infinity;
  for (const volume of volumes) {
    const distance = entry(from, along, volume);
    if (distance !== null && distance < nearest) {
      nearest = distance;
      best = volume.id;
    }
  }
  return best;
}
