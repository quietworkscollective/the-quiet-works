import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { BoxGeometry, CylinderGeometry, SphereGeometry, MeshBasicMaterial, MeshStandardMaterial, CanvasTexture, SRGBColorSpace, type Material } from 'three';
import { OFFICE_OBJECTS, type OfficeObjectId, type OfficeStore, type OfficeArchive } from '@tqw/engine';
import { OfficeAsset } from './OfficeAsset.tsx';
import { officeAssetPose, officeAssetSlot, officeInteractionAnchor } from './assetSlots.ts';
import { useScene } from './context.ts';
import { boxAt, merge } from './geometry.ts';

function label(text: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 160;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Document labels need a 2D canvas');
  ctx.fillStyle = '#ddd5c8'; ctx.fillRect(0, 0, 512, 160);
  ctx.fillStyle = '#2c3431'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '28px "IBM Plex Mono", monospace';
  ctx.fillText(text, 256, 80, 480);
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
  return { texture, material: new MeshBasicMaterial({map: texture}) };
}

export function RoomObjects({ office, archive, overloaded, shadow, onInspect, onFocus, onEntrance }: {
  office: OfficeStore; archive: OfficeArchive; overloaded: boolean; shadow: boolean;
  onInspect(id: OfficeObjectId): void; onFocus(id: OfficeObjectId | null): void; onEntrance(): void;
}) {
  const { materials, cursor } = useScene();
  const state = useSyncExternalStore(office.subscribe, office.getState);
  const opened = useSyncExternalStore(archive.subscribe, archive.getState);
  const reverse = opened['office-14']?.item.fields?.['reverse'] ?? '';
  const heading = opened['office-08']?.item.fields?.['heading'] ?? '';
  const issue = opened['office-08']?.item.fields?.['issue'] ?? '';
  const inscription = opened['office-07']?.item.fields?.['inscription'] ?? '';
  const ticket = opened['office-06']?.item.fields?.['ticket'] ?? '';
  const bellTicket = opened['office-15']?.item.fields?.['ticket'] ?? 'SERVICE';
  const clockHeading = opened['office-18']?.item.fields?.['heading'] ?? '';
  const invalidate = useThree(s => s.invalidate);
  const [hover, setHover] = useState<OfficeObjectId | null>(null);
  const parts = useMemo(() => {
    const cube = new BoxGeometry(1, 1, 1);
    const sphere = new SphereGeometry(1, 12, 8);
    const cylinder = new CylinderGeometry(1, 1, 1, 24);
    const stack = merge(Array.from({length: 12}, (_,i) => boxAt(.7,.17,.8, Math.sin(i)*.009, -.99+i*.182, 0)));
    const chair = merge([
      boxAt(.5,.09,.5,0,.05,0),boxAt(.48,.48,.06,0,.45,.24),
      ...[-1,1].flatMap(x=>[-1,1].map(z=>boxAt(.022,.46,.022,x*.2,-.22,z*.2))),
    ]);
    const frame = merge([boxAt(1.14,.035,.05,0,1.16,0), boxAt(.035,2.3,.05,-.56,0,0),boxAt(.035,2.3,.05,.56,0,0)]);
    const hook = merge([boxAt(.025,.16,.025,0,-.02,0),boxAt(.025,.025,.09,0,-.09,-.045)]);
    const hit = new MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,colorWrite:false});
    const outline = new MeshBasicMaterial({color:'#ddd5c8',wireframe:true,transparent:true,opacity:.45});
    const figure = new MeshStandardMaterial({color:'#c1a752',roughness:.68});
    const dark = new MeshBasicMaterial({color:'#151a20'});
    const doorPaint = new MeshStandardMaterial({color:'#667168', roughness:.86, metalness:.12, emissive:'#667168', emissiveIntensity:.06});
    const shadowMaterial = new MeshBasicMaterial({color:'#20241f'});
    const labels = {
      sign: label('CERTIFICATION OFFICE'), reverse: label(reverse),
      panel: label(overloaded ? 'SERVICE — RELEASED' : 'SERVICE — LOCKED'),
      clock: label(clockHeading),
      register: label(heading), issue: label(issue), tiny: label(inscription), ticket: label(ticket),
      bell: label(bellTicket),
      door: label('SIDE EXIT'),
    };
    return {cube,sphere,cylinder,stack,chair,frame,hook,hit,outline,figure,dark,doorPaint,shadowMaterial,labels};
  // Only changed inscriptions recreate their texture set; ordinary inspections keep it stable.
  }, [overloaded, reverse, heading, issue, inscription, ticket, bellTicket, clockHeading]);
  useEffect(() => {
    invalidate();
    return () => {
      for (const g of [parts.cube,parts.sphere,parts.cylinder,parts.stack,parts.chair,parts.frame,parts.hook]) g.dispose();
      for (const m of [parts.hit,parts.outline,parts.figure,parts.dark,parts.doorPaint,parts.shadowMaterial]) m.dispose();
      for (const item of Object.values(parts.labels)) { item.texture.dispose(); item.material.dispose(); }
    };
  }, [parts,invalidate]);
  useEffect(() => { invalidate(); }, [state,hover,shadow,invalidate]);
  useEffect(() => () => cursor.hover('objects',false), [cursor]);
  const box = (size: readonly [number,number,number], position: readonly [number,number,number], material: Material=materials.enamelDark) => (
    <mesh key={position.join(',')} geometry={parts.cube} material={material} scale={[...size]} position={[...position]} />
  );
  const inkOpen = state.toggles['ink-pad'];
  const drawerOpen = state.uses.drawer > 0;
  const signTurned = state.toggles.sign;
  const windowOpen = state.toggles.window;
  const touch = (id: OfficeObjectId) => (event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); onInspect(id); };
  return (
    <group dispose={null}>
      <group {...officeAssetPose('ink-pad')} userData={{officeObjectId:'ink-pad'}}>
        {box([.16,.028,.1],[0,0,0],materials.tin)}
        {box([.145,.004,.085],[0,.017,0],materials.felt)}
        <group userData={{ bake: 'dynamic' }} position={[0,.022,.05]} rotation={[inkOpen ? 1.7 : 0,0,0]}>{box([.16,.007,.1],[0,0,-.05],materials.tin)}</group>
      </group>
      <group position={[...officeAssetSlot('drawer').position.slice(0,2),officeAssetSlot('drawer').position[2] - (drawerOpen ? .32 : 0)] as [number,number,number]} userData={{officeObjectId:'drawer', bake:'dynamic'}}>
        {box([.42,.02,.4],[0,0,0],materials.wood)}
        {box([.42,.1,.025],[0,.04,-.2],materials.wood)}
        {drawerOpen ? <group position={[0,.05,0]} rotation={[0,state.uses.drawer > 1 ? Math.PI/2 : 0,0]}>
          <mesh geometry={parts.sphere} material={parts.figure} scale={[.045,.035,.055]} />
          <mesh geometry={parts.sphere} material={parts.figure} scale={.027} position={[0,.035,-.035]} />
          {box([.031,.012,.019],[0,.027,-.061],materials.brassWorn)}
          <mesh geometry={parts.sphere} material={parts.dark} scale={.004} position={[-.018,.042,-.052]} />
          {box([.065,.002,.035],[.095,-.013,-.04],parts.labels.ticket.material)}
        </group> : null}
      </group>
      <group userData={{ bake: 'dynamic' }} position={[-.45,.75,4]} rotation={[state.uses['tiny-stamp'] ? Math.PI/2 : 0,0,0]}>
        {box([.045,.035,.025],[0,0,0],materials.wood)}
        {box([.045,.002,.025],[0,-.018,0],parts.labels.tiny.material)}
      </group>
      <group {...officeAssetPose('register')} userData={{officeObjectId:'register'}}>
        {box([.32,.04,.24],[0,0,0],materials.enamelDark)}
        <group userData={{ bake: 'dynamic' }} rotation={[0,0,state.uses.register && state.variants.register !== 2 ? -1.35 : 0]}>{box([.32,.004,.24],[0,.025,0],materials.boneSheet)}</group>
        {box([.3,.002,.16],[0,.029,0],state.variants.register === 1 ? parts.labels.issue.material : parts.labels.register.material)}
      </group>
      <group position={[-2.25,1.15,7.85]}>
        {box([.35,.22,.01],[0,0,0],materials.brass)}
        <group userData={{ bake: 'dynamic' }} rotation={[windowOpen ? -1.1 : 0,0,0]}>{box([.32,.19,.015],[0,0,-.015],materials.enamelDark)}</group>
      </group>
      {box([.3,.002,.13],[-2.25,1.01,7.77],parts.labels.bell.material)}
      <group userData={{ bake: 'dynamic' }} position={[3.65,1.55,1.8]} rotation={[0,-Math.PI/2 + (signTurned ? Math.PI : 0),0]}>
        {box([.35,.22,.012],[0,0,0],signTurned ? parts.labels.reverse.material : parts.labels.sign.material)}
      </group>
      <OfficeAsset id="side-door" fittings={['side-door']}>{box([1.03,2.22,.06],[0,0,0],parts.doorPaint)}</OfficeAsset>
      {box([.04,.14,.055],[4.055,1.06,2.14],materials.brassWorn)}
      {box([.07,.025,.12],[4.015,1.06,2.1],materials.brassWorn)}
      <group position={[4.07,1.55,1.8]} rotation={[0,-Math.PI/2,0]}>{box([.4,.14,.01],[0,0,0],parts.labels.door.material)}</group>
      <group position={[3.2,1.15,6.7]}>
        <mesh geometry={parts.frame} material={materials.frame} />
        {box([1.1,2.3,.07],[0,0,0],parts.doorPaint)}
        {Array.from({length:8},(_,i)=>box([.018,2.16,.025],[-.45+i*.13,0,-.05],materials.frame))}
        <group userData={{ bake: 'dynamic' }}>{box([.12,.08,.035],[.3,.05,overloaded ? -.12 : -.045],materials.brassWorn)}</group>
        {box([.8,.16,.012],[0,.5,-.047],parts.labels.panel.material)}
      </group>
      <OfficeAsset id="clerk-chair" fittings={['chair']}><mesh geometry={parts.chair} material={materials.enamelDark} /></OfficeAsset>
      {box([.16,.003,.25],[-2.3,.599,8.77],materials.wood)}
      {box([.12,.002,.085],[-2.11,.602,8.64],materials.boneSheet)}
      <OfficeAsset id="attended-stack" fittings={['stack']}><mesh geometry={parts.stack} material={materials.paperStack} /></OfficeAsset>
      {state.uses.stack > 0 ? <group userData={{ bake: 'dynamic' }} position={[-2.55,1.3,6.7]} rotation={[0,0,state.variants.stack ? Math.PI : 0]}>{box([.22,.002,.28],[0,0,0],materials.boneSheet)}</group> : null}
      <group userData={{ bake: 'dynamic' }}>{state.uses['tiny-stamp'] > 1 ? box([.12,.002,.06],[-.45,.79,3.85],parts.labels.tiny.material) : null}</group>
      <group position={[...officeAssetSlot('clock').position]} rotation={[Math.PI/2,0,0]} userData={{officeObjectId:'clock'}}>
        <mesh geometry={parts.cylinder} material={materials.boneSheet} scale={[.19,.035,.19]} />
        {box([.3,.002,.10],[0,-.02,.09],parts.labels.clock.material)}
        <group userData={{ bake: 'dynamic' }} rotation={[0,state.uses.clock ? .55 : 0,0]}>{box([.007,.005,.15],[0,-.025,-.06],materials.frame)}</group>
        {box([.01,.005,.08],[.04,-.022,0],materials.brass)}
      </group>
      <group {...officeAssetPose('conduit')} userData={{officeObjectId:'conduit'}}>
        {box([.22,.12,.04],[0,0,0],materials.iron)}
        <group userData={{ bake: 'dynamic' }}>{box([.22,.12,.01],[state.toggles.conduit ? .24 : 0,0,-.035],materials.steelPanel)}</group>
        <group userData={{ bake: 'dynamic' }}>{state.uses.conduit ? box([.006,.07,.08],[.17,-.015,-.01],materials.frame) : null}</group>
      </group>
      <group {...officeAssetPose('routing-tray')}>
        {box([.34,.016,.26],[0,0,0],materials.frame)}
        {[0,1,2].map(i=>box([.24,.003,.18],[i*.012,.013+i*.014,0],materials.boneSheet))}
      </group>
      <group {...officeAssetPose('coat-hook')}>
        <mesh geometry={parts.hook} material={materials.brass} />
        <group userData={{ bake: 'dynamic' }}>{box([.22,.008,.008],[0,state.variants['coat-hook'] ? .07 : -.06,-.04],materials.frame)}</group>
      </group>
      <group userData={{ bake: 'dynamic' }}>{shadow ? box([1.4,.004,.035],[3.42,.009,1.8],parts.shadowMaterial) : null}</group>
      {OFFICE_OBJECTS.filter(object=>object.id!=='press').map(object=> (
        <group key={object.id} position={[officeInteractionAnchor(object.id)[0], officeInteractionAnchor(object.id)[1] + (object.id === 'chair' ? .15 : 0), officeInteractionAnchor(object.id)[2]]}>
          <mesh geometry={parts.cube} material={parts.hit} scale={object.id==='machine' ? [1.25,1.35,.75] : object.id==='service-panel' ? [1.1,2.3,.2] : object.id==='bell' ? [.7,.7,.7] : object.id==='chair' ? [.55,1.1,.6] : object.id==='coat-hook' ? [.8,.48,.48] : [.48,.48,.48]}
            onClick={touch(object.id)} onPointerOver={event=>{event.stopPropagation();setHover(object.id);onFocus(object.id);cursor.hover('objects',true);}}
            onPointerOut={()=>{setHover(null);onFocus(null);cursor.hover('objects',false);}} />
          {hover===object.id ? <mesh geometry={parts.cube} material={parts.outline} scale={[.5,.5,.5]} /> : null}
        </group>
      ))}
      <mesh geometry={parts.cube} material={parts.hit} position={[0,1.1,.05]} scale={[1.05,2.2,.1]} onClick={event=>{event.stopPropagation();onEntrance();}} />
    </group>
  );
}
