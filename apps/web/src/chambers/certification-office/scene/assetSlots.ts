import { OFFICE_OBJECTS, type OfficeObjectId } from '@tqw/engine';

/** Metres and radians. Catalogue references are local licensed assets, never executable URLs. */
export type OfficeZone = 'floor' | 'walls' | 'ceiling' | 'desk' | 'machine' | 'window' | 'archive';
type Triple = readonly [number, number, number];
export interface OfficeAssetSlot {
  readonly id: string;
  readonly zone: OfficeZone;
  readonly position: Triple;
  readonly rotation: Triple;
  readonly footprint: readonly [number, number];
  readonly catalogueId: string | null;
  readonly placeholder: 'present' | 'pending';
  readonly variant?: string;
}
const slot = (id: string, zone: OfficeZone, position: Triple, footprint: readonly [number, number],
  rotation: Triple = [0,0,0], placeholder: OfficeAssetSlot['placeholder'] = 'pending', variant?: string): OfficeAssetSlot => ({
  id,zone,position,rotation,footprint,catalogueId:null,placeholder,...(variant ? {variant} : {}),
});

/** Found inscriptions remain runtime archive overlays and are never baked into catalogue textures.
 * Geometry production targets; fitting behavior and discoveries stay in the Office store. */
export const OFFICE_BOX_SIZES = [[.25,.22,.32],[.32,.25,.4],[.45,.32,.55]] as const;
export const OFFICE_LABEL_VARIANTS = ['a','b','c','d'] as const;
export const OFFICE_SCALE_ANCHORS = { handle: .9, desk: .74, seat: .45, paper: [.21,.297] } as const;

export const OFFICE_ASSET_SLOTS: readonly OfficeAssetSlot[] = [
  slot('floor-surface','floor',[0,0,15],[8.4,30],[0,0,0],'present'),
  slot('floor-perimeter','floor',[0,.001,15],[8.2,29.8]),
  slot('entrance-mat','floor',[0,.006,1.1],[1.1,.65]),
  slot('chair-wear','floor',[-2.25,.002,8.8],[1.1,1.1]),
  ...[[-2.7,4.9],[2.7,3.4]].map(([x,z],i)=>slot(`floor-repair-${i+1}`,'floor',[x??0,.001,z??0],[.65,.42])),
  ...Array.from({length:8},(_,i)=>slot(`floor-scuff-${i+1}`,'floor',[-2.8+(i%4)*1.65,.002,1.9+Math.floor(i/4)*3.9],[.28,.14])),
  ...[-1,1].map((side,i)=>slot(`skirting-${i+1}`,'walls',[side*4.15,.12,4],[.03,8])),
  slot('dado','walls',[-4.16,1.05,4],[.025,8]),
  slot('service-panel','walls',[3.2,1.15,6.7],[1.1,.07],[0,0,0],'present'),
  slot('service-panel-secondary','walls',[-4.14,1.1,4.95],[.04,.5]),
  slot('clock','walls',[0,2.5,7.85],[.38,.04],[0,0,0],'present'),
  ...[-1,1].map((side,i)=>slot(`institutional-notice-${i+1}`,'walls',[side*4.13,1.65,3.0],[.025,.42],[0,side*Math.PI/2,0])),
  slot('conduit','walls',[3.7,1.05,5.4],[.22,.12],[0,-Math.PI/2,0],'present'),
  ...Array.from({length:6},(_,i)=>slot(`conduit-clip-${i+1}`,'walls',[4.11,2.35,2.5+i*.6],[.04,.03])),
  slot('coat-hook','walls',[-4.1,1.55,2],[.025,.09],[0,Math.PI/2,0],'present'),
  slot('side-door','walls',[4.11,1.11,1.8],[.06,1.03],[0,-Math.PI/2,0],'present'),
  slot('side-handle','walls',[4.015,1.06,2.1],[.07,.12],[0,0,0],'present'),
  slot('entrance-frame','walls',[0,1.1,0],[1.05,.18],[0,0,0],'present'),
  ...[2,5,8].map((z,i)=>slot(`ceiling-bay-${i+1}`,'ceiling',[0,5.57,z],[8.4,.32],[0,0,0],'present')),
  slot('desk-practical','ceiling',[0,4.8,6],[.55,.18],[0,0,0],'present'),
  slot('exit-practical','ceiling',[3,3.7,1.8],[.24,.24],[0,0,0],'present'),
  slot('ventilation-grille','ceiling',[2.6,5.65,5.6],[.6,.38]),
  slot('ceiling-service-run','ceiling',[-3.7,5.65,4],[.05,6]),
  slot('desk','desk',[-1,.82,4],[2.2,1.1],[0,Math.PI,0],'present'),
  slot('press-rig','desk',[-1.16,.82,4.14],[.36,.48],[0,Math.PI,0],'present'),
  slot('lamp-rig','desk',[-2.68,.82,3.96],[.36,.36],[0,Math.PI,0],'present'),
  slot('ink-pad','desk',[-1.8,.85,3.9],[.16,.1],[0,0,0],'present'),
  slot('drawer','desk',[-1.5,.62,3.7],[.42,.4],[0,0,0],'present'),
  slot('underside-fitting','desk',[-.45,.75,4],[.045,.025],[0,0,0],'present'),
  slot('blotter','desk',[-1,.823,4],[.65,.5]),
  slot('squared-paper-stack','desk',[-1.95,.86,4.35],[.21,.297]),
  ...[-1,1].map((side,i)=>slot(`paper-tray-${i+1}`,'desk',[-1+side*.72,.85,4.35],[.25,.34])),
  slot('pencil-cup','desk',[-1.95,.87,3.85],[.075,.075]),
  ...Array.from({length:3},(_,i)=>slot(`pencil-${i+1}`,'desk',[-1.98+i*.02,.93,3.85],[.007,.007])),
  slot('closed-ledger','desk',[-.25,.86,4.3],[.23,.31]),
  slot('register','archive',[-3.5,1.29,5.9],[.32,.24],[0,Math.PI/2,0],'present'),
  slot('records-cabinet','archive',[-3.5,.625,5.9],[.9,.45],[0,0,0],'present'),
  slot('routing-tray','archive',[-2.7,.95,5.8],[.34,.26],[0,0,0],'present'),
  slot('attended-stack','archive',[-3.1,1.1,7],[.7,.8],[0,0,0],'present'),
  slot('service-bell','machine',[.9,1.4,4.9],[.13,.13],[0,0,0],'present'),
  slot('office-sign','walls',[3.65,1.55,1.8],[.35,.012],[0,-Math.PI/2,0],'present'),
  slot('drawer-object','desk',[-1.5,.67,3.7],[.09,.11],[0,0,0],'present'),
  ...Array.from({length:16},(_,i)=>slot(`archive-stack-${i+1}`,'archive',[[-3.15,-1.05,1.1,3.1][i%4]??0,0,10+Math.floor(i/4)*4.8],[.7,.8],[0,0,0],'present')),
  slot('machine-casing','machine',[1,.6,4.9],[1.25,1.2],[0,Math.PI-.22,0],'present'),
  slot('machine-rig','machine',[1.782,0,4.33],[1.3,1.3],[0,Math.PI,0],'present'),
  slot('document-channel','machine',[.225,.815,4.41],[1.45,.32],[0,0,0],'present'),
  slot('application-board','machine',[1,1.83,4.86],[1.95,.05],[0,Math.PI,0],'present'),
  ...Array.from({length:5},(_,i)=>slot(`application-socket-${i+1}`,'machine',[1.78-i*.39,1.81,4.815],[.072,.012],[0,0,0],'present')),
  ...Array.from({length:4},(_,i)=>slot(`application-tab-${i+1}`,'machine',[1.78-i*.39,1.66,4.8],[.36,.006],[0,Math.PI,0],'present')),
  ...[-1,1].map((side,i)=>slot(`machine-access-seam-${i+1}`,'machine',[1+side*.4,.62,4.58],[.005,.012])),
  ...Array.from({length:8},(_,i)=>slot(`machine-fastener-${i+1}`,'machine',[.56+(i%2)*.88,.25+Math.floor(i/2)*.24,4.57],[.012,.006])),
  slot('machine-service-plate','machine',[1,.3,4.57],[.3,.01]),
  slot('machine-inspection-label','machine',[1.3,.66,4.57],[.12,.008]),
  slot('certificate-sign','window',[-2,2.4,7.83],[1.6,.01],[0,Math.PI,0],'present'),
  slot('blank-certificate','window',[-1.86,1.65,7.89],[.64,.01],[0,Math.PI,0],'present'),
  slot('certificate-easel','window',[-1.86,1.24,7.95],[.42,.18],[0,0,0],'present'),
  slot('officer-nameplate','window',[-1.65,.93,7.76],[1,.01],[0,Math.PI,0],'present'),
  slot('window-frame','window',[-2.25,1.55,7.87],[1.66,.2],[0,0,0],'present'),
  slot('window-sill','window',[-2.25,.97,7.87],[1.66,.2],[0,0,0],'present'),
  slot('speaking-flap','window',[-2.25,1.15,7.85],[.35,.015],[0,0,0],'present'),
  slot('flap-handle','window',[-2.25,1.08,7.76],[.09,.03]),
  ...[-1,1].map((side,i)=>slot(`window-hinge-${i+1}`,'window',[-2.25+side*.14,1.22,7.82],[.022,.018])),
  slot('window-latch','window',[-2.09,1.15,7.82],[.025,.028]),
  ...[-1,1].map((side,i)=>slot(`window-wipe-${i+1}`,'window',[-2.25+side*.45,1.6,7.93],[.3,.002])),
  slot('clerk-chair','window',[-2.25,.5,8.8],[.5,.5],[0,0,0],'present'),
  ...Array.from({length:10},(_,i)=>slot(`archive-bay-${i+1}`,'archive',[i%2 ? 3.7 : -3.7,0,10+Math.floor(i/2)*3],[.6,3],[0,i%2 ? -Math.PI/2 : Math.PI/2,0])),
  ...Array.from({length:40},(_,i)=>{
    const bay=Math.floor(i/4),size=OFFICE_BOX_SIZES[i%3]??OFFICE_BOX_SIZES[1];
    return slot(`archive-box-${i+1}`,'archive',[bay%2?3.65:-3.65,.15+Math.floor((i%4)/2)*.5,9.4+Math.floor(bay/2)*3+(i%2)*.7],[size[0],size[2]],[0,0,(i%3-1)*.01],'pending',`${i%3}/${OFFICE_LABEL_VARIANTS[i%4]}`);
  }),
  slot('parked-trolley','archive',[3.25,0,9.2],[.6,.85]),
];
const slots = new Map(OFFICE_ASSET_SLOTS.map(item => [item.id,item]));
export function officeAssetSlot(id: string): OfficeAssetSlot {
  const item=slots.get(id);
  if(!item)throw new Error(`Unknown Office asset placement: ${id}`);
  return item;
}
export function officeAssetPose(id: string) {
  const {position,rotation}=officeAssetSlot(id);
  return {position:[...position] as [number,number,number],rotation:[...rotation] as [number,number,number]};
}

/** Physical targets can follow a catalogue placement without changing its discovery action. */
export function officeInteractionAnchor(id: OfficeObjectId): Triple {
  if (id === 'stack') return officeAssetSlot('attended-stack').position;
  if (id === 'side-door') return officeAssetSlot('side-door').position;
  if (id === 'clock') return officeAssetSlot('clock').position;
  if (id === 'register') return officeAssetSlot('register').position;
  if (id === 'drawer') {
    const [x,y,z] = officeAssetSlot('drawer').position;
    return [x,y+.04,z-.2];
  }
  if (id === 'window') return officeAssetSlot('speaking-flap').position;
  const object = OFFICE_OBJECTS.find(object => object.id === id);
  if (!object) throw new Error('Unknown Office fitting');
  return object.position;
}
