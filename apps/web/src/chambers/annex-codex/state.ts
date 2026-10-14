export type GuideId = 'wingnut' | 'tin-a' | 'tin-b' | 'service';
export type DrawingState = 'empty' | 'partial' | 'full';
export type DiscoveryPath = 'engage' | 'investigate' | 'stop' | null;

export const ROOM_OBJECTS = [
  { id: 'follower', node: 'PantographFollower', name: 'Pantograph follower', action: 'Trace once' },
  { id: 'selector', node: 'SpecimenSelector', name: 'Specimen selector', action: 'Select a guide' },
  { id: 'wingnut', node: 'WingNut', name: 'Wing nut', action: 'Inspect fastener' },
  { id: 'tin-a', node: 'TinA', name: 'Tin A and boat', action: 'Inspect contents' },
  { id: 'tin-b', node: 'TinB', name: 'Tin B and packed bowl', action: 'Inspect contents' },
  { id: 'leaves', node: 'DrawingLeaves', name: 'Drawing leaves', action: 'Inspect line' },
  { id: 'hood', node: 'ComparisonHood', name: 'Comparison hood', action: 'Lift comparison hood' },
  { id: 'rest', node: 'PencilRest', name: 'Ivory pencil rest', action: 'Leave untraced' },
  { id: 'eraser', node: 'EraserSled', name: 'Eraser sled', action: 'Wipe selected line' },
  { id: 'drawer', node: 'ServiceDrawer', name: 'Service drawer and guide shoe', action: 'Open service drawer' },
  { id: 'provenance', node: 'ProvenancePlate', name: 'Provenance plate', action: 'Read provenance' },
  { id: 'door', node: 'RoomDoor', name: 'Entrance door', action: 'Leave room' },
] as const;

export type RoomObjectId = (typeof ROOM_OBJECTS)[number]['id'];

export const OBJECTS = ROOM_OBJECTS;

export interface RoomState {
  selectedGuide: GuideId;
  guideBeforeService: Exclude<GuideId, 'service'>;
  hoodOpen: boolean;
  serviceDrawerOpen: boolean;
  followerParked: boolean;
  comparisonOverlaid: boolean;
  comparisonRevealed: boolean;
  tracedTinA: boolean;
  tracedTinB: boolean;
  lines: { wingnut: DrawingState; tinA: DrawingState; tinB: DrawingState; service: DrawingState };
  lineProgress: { wingnut: number; tinA: number; tinB: number; service: number };
  activeTrace: GuideId | null;
  boatMastRaised: boolean;
  boatLifted: boolean;
  boatUndersideRead: boolean;
  clothEdgeLifted: boolean;
  wingnutSideView: boolean;
  provenanceRead: boolean;
  discoveryPath: DiscoveryPath;
  discoveryTokens: readonly string[];
  inspection: 'equal-rims' | 'wingnut' | 'tin-a' | 'tin-b' | 'boat-underside' | 'bowl-cloth' | 'provenance' | null;
  traceSequence: number;
  revision: number;
}

export type RoomAction =
  | { type: 'SELECT_GUIDE'; guide: Exclude<GuideId, 'service'> }
  | { type: 'TRACE_BEGIN'; guide: GuideId }
  | { type: 'TRACE_PROGRESS'; guide: GuideId; progress: number }
  | { type: 'TRACE_COMPLETE'; guide: GuideId }
  | { type: 'CANCEL_TRACE'; guide: GuideId }
  | { type: 'OPEN_HOOD' }
  | { type: 'CLOSE_HOOD' }
  | { type: 'LEAVE_UNTRACED' }
  | { type: 'RESUME_TRACING' }
  | { type: 'TOGGLE_COMPARE' }
  | { type: 'INSPECT_EQUAL_RIMS' }
  | { type: 'INSPECT_WINGNUT' }
  | { type: 'INSPECT_TIN'; tin: 'tin-a' | 'tin-b' }
  | { type: 'WIPE_SELECTED_LINE' }
  | { type: 'OPEN_SERVICE_DRAWER' }
  | { type: 'CLOSE_SERVICE_DRAWER' }
  | { type: 'TRACE_GUIDE_SHOE' }
  | { type: 'RETURN_SPECIMEN_GUIDE' }
  | { type: 'TOGGLE_BOAT_MAST' }
  | { type: 'LIFT_BOAT' }
  | { type: 'REPLACE_BOAT' }
  | { type: 'INSPECT_BOAT_UNDERSIDE' }
  | { type: 'LIFT_CLOTH_EDGE' }
  | { type: 'REPLACE_CLOTH' }
  | { type: 'READ_PROVENANCE' };

export const GUIDE_SHOE_TOKEN = 'annex-codex/v1/service-shoe/traced';
export const BOAT_UNDERSIDE_TOKEN = 'annex-codex/v1/boat/underside-read';

export function initialRoomState(): RoomState {
  return {
    selectedGuide: 'wingnut',
    guideBeforeService: 'wingnut',
    hoodOpen: false,
    serviceDrawerOpen: false,
    followerParked: false,
    comparisonOverlaid: false,
    comparisonRevealed: false,
    tracedTinA: false,
    tracedTinB: false,
    lines: { wingnut: 'empty', tinA: 'empty', tinB: 'empty', service: 'empty' },
    lineProgress: { wingnut: 0, tinA: 0, tinB: 0, service: 0 },
    activeTrace: null,
    boatMastRaised: false,
    boatLifted: false,
    boatUndersideRead: false,
    clothEdgeLifted: false,
    wingnutSideView: false,
    provenanceRead: false,
    discoveryPath: null,
    discoveryTokens: [],
    inspection: null,
    traceSequence: 0,
    revision: 0,
  };
}

function lineFor(guide: GuideId): keyof RoomState['lines'] {
  if (guide === 'tin-a') return 'tinA';
  if (guide === 'tin-b') return 'tinB';
  return guide;
}

function addToken(state: RoomState, token: string): readonly string[] {
  return state.discoveryTokens.includes(token) ? state.discoveryTokens : [...state.discoveryTokens, token];
}

function changed(state: RoomState, next: Omit<RoomState, 'revision'>): RoomState {
  return { ...next, revision: state.revision + 1 };
}

export function reduceRoom(state: RoomState, action: RoomAction): RoomState {
  switch (action.type) {
    case 'SELECT_GUIDE':
      return changed(state, {
        ...state,
        selectedGuide: action.guide,
        guideBeforeService: action.guide,
        inspection: null,
        comparisonOverlaid: false,
      });
    case 'TRACE_BEGIN': {
      if (action.guide === 'service' && (!state.serviceDrawerOpen || state.followerParked)) return state;
      const key = lineFor(action.guide);
      return changed(state, { ...state, lines: { ...state.lines, [key]: 'empty' }, lineProgress: { ...state.lineProgress, [key]: 0 }, activeTrace: action.guide, inspection: null });
    }
    case 'TRACE_PROGRESS': {
      const key = lineFor(action.guide);
      const progress = Math.max(0, Math.min(1, action.progress));
      const lines = { ...state.lines, [key]: progress > 0 ? (progress >= 1 ? 'full' : 'partial') : state.lines[key] };
      return changed(state, { ...state, lines, lineProgress: { ...state.lineProgress, [key]: progress }, inspection: null });
    }
    case 'TRACE_COMPLETE': {
      if (action.guide === 'service' && !state.serviceDrawerOpen) return state;
      if (action.guide === 'service' && state.followerParked) return state;
      const key = lineFor(action.guide);
      const lines = { ...state.lines, [key]: 'full' as const };
      const lineProgress = { ...state.lineProgress, [key]: 1 };
      const tracedTinA = state.tracedTinA || action.guide === 'tin-a';
      const tracedTinB = state.tracedTinB || action.guide === 'tin-b';
      const revealsNow = !state.comparisonRevealed && tracedTinA && tracedTinB;
      let discoveryTokens = state.discoveryTokens;
      if (action.guide === 'service' && state.serviceDrawerOpen) discoveryTokens = addToken(state, GUIDE_SHOE_TOKEN);
      return changed(state, {
        ...state,
        lines,
        lineProgress,
        activeTrace: null,
        tracedTinA,
        tracedTinB,
        comparisonRevealed: state.comparisonRevealed || revealsNow,
        hoodOpen: revealsNow ? true : state.hoodOpen,
        discoveryPath: revealsNow ? 'engage' : state.discoveryPath,
        inspection: null,
        discoveryTokens,
        traceSequence: state.traceSequence + 1,
      });
    }
    case 'CANCEL_TRACE': {
      if (action.guide === 'service' && !state.serviceDrawerOpen) return state;
      const key = lineFor(action.guide);
      const lines = { ...state.lines, [key]: state.lines[key] === 'empty' ? 'empty' : 'partial' };
      return changed(state, { ...state, lines, activeTrace: null, inspection: null, traceSequence: state.traceSequence + 1 });
    }
    case 'OPEN_HOOD':
      return changed(state, { ...state, hoodOpen: true, comparisonRevealed: true, discoveryPath: state.discoveryPath ?? 'investigate', inspection: null });
    case 'CLOSE_HOOD':
      return changed(state, { ...state, hoodOpen: false, comparisonOverlaid: false, inspection: null });
    case 'LEAVE_UNTRACED':
      return changed(state, { ...state, followerParked: true, hoodOpen: true, comparisonRevealed: true, discoveryPath: state.discoveryPath ?? 'stop', inspection: null });
    case 'RESUME_TRACING':
      return changed(state, { ...state, followerParked: false, inspection: null });
    case 'TOGGLE_COMPARE':
      return changed(state, { ...state, comparisonOverlaid: !state.comparisonOverlaid, inspection: null });
    case 'INSPECT_EQUAL_RIMS':
      return state.hoodOpen ? changed(state, { ...state, inspection: 'equal-rims' }) : state;
    case 'INSPECT_WINGNUT':
      return changed(state, { ...state, wingnutSideView: !state.wingnutSideView, inspection: 'wingnut' });
    case 'INSPECT_TIN':
      return changed(state, { ...state, inspection: action.tin });
    case 'WIPE_SELECTED_LINE': {
      const key = lineFor(state.selectedGuide);
      return changed(state, { ...state, lines: { ...state.lines, [key]: 'empty' }, lineProgress: { ...state.lineProgress, [key]: 0 }, comparisonOverlaid: false, inspection: null });
    }
    case 'OPEN_SERVICE_DRAWER':
      return changed(state, { ...state, serviceDrawerOpen: true, inspection: null });
    case 'CLOSE_SERVICE_DRAWER':
      return changed(state, { ...state, serviceDrawerOpen: false, inspection: null });
    case 'TRACE_GUIDE_SHOE': {
      if (!state.serviceDrawerOpen || state.followerParked) return state;
      return reduceRoom(state, { type: 'TRACE_COMPLETE', guide: 'service' });
    }
    case 'RETURN_SPECIMEN_GUIDE':
      return changed(state, { ...state, selectedGuide: state.guideBeforeService, inspection: null });
    case 'TOGGLE_BOAT_MAST':
      return state.hoodOpen ? changed(state, { ...state, boatMastRaised: !state.boatMastRaised, inspection: null }) : state;
    case 'LIFT_BOAT':
      return state.hoodOpen ? changed(state, { ...state, boatLifted: true, inspection: null }) : state;
    case 'REPLACE_BOAT':
      return changed(state, { ...state, boatLifted: false, inspection: null });
    case 'INSPECT_BOAT_UNDERSIDE':
      if (!state.hoodOpen || !state.boatLifted) return state;
      return changed(state, { ...state, boatUndersideRead: true, inspection: 'boat-underside', discoveryTokens: addToken(state, BOAT_UNDERSIDE_TOKEN) });
    case 'LIFT_CLOTH_EDGE':
      return state.hoodOpen ? changed(state, { ...state, clothEdgeLifted: true, inspection: 'bowl-cloth' }) : state;
    case 'REPLACE_CLOTH':
      return changed(state, { ...state, clothEdgeLifted: false, inspection: null });
    case 'READ_PROVENANCE':
      return changed(state, { ...state, provenanceRead: true, inspection: 'provenance' });
  }
}
