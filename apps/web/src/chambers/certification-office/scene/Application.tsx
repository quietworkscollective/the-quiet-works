import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { BoxGeometry, CylinderGeometry, MeshStandardMaterial, PlaneGeometry, SphereGeometry, TorusGeometry, type Mesh, type PointLight } from 'three';
import { OFFICE_LEGIBILITY as COPY } from '@tqw/engine';
import { officeAssetPose, officeAssetSlot } from './assetSlots.ts';
import { useScene } from './context.ts';
import { beatDuration } from './beatMotion.ts';
import { applicationAt } from './application.ts';
import { createCanvas, context2d, FONT_COND, makeTexture } from './textures.ts';

function placard(lines: readonly string[], width = 1024, height = 320, font = 62, dark = false) {
  const canvas = createCanvas(width, height), ctx = context2d(canvas);
  ctx.fillStyle = dark ? '#23332e' : '#ddd5c8'; ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = dark ? '#b8ac85' : '#706d5b'; ctx.lineWidth = 8; ctx.strokeRect(12, 12, width - 24, height - 24);
  ctx.fillStyle = dark ? '#ddd5c8' : '#263331'; ctx.font = `600 ${font}px ${FONT_COND}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  lines.forEach((line, i) => ctx.fillText(line, width / 2, (i + .5) * height / lines.length, width - 64));
  const texture = makeTexture(canvas);
  const material = new MeshStandardMaterial({ map: texture, roughness: .7, emissive: '#ffffff', emissiveMap: texture, emissiveIntensity: dark ? .12 : .27 });
  return { texture, material };
}

/** Public institutional fittings. The blank certificate and empty socket never become rewards. */
export function Application() {
  const { store, director, motion, materials } = useScene();
  const invalidate = useThree(s => s.invalidate);
  const lamps = useRef<Array<Mesh | null>>([]), catches = useRef<Array<Mesh | null>>([]);
  const windowLight = useRef<PointLight>(null);
  const sim = useRef({ step: store.getState().stamps, at: Number.NEGATIVE_INFINITY });
  const art = useMemo(() => {
    const sign = placard([COPY.sign], 1536, 180, 112, true);
    const certificate = placard([COPY.certificate, ...COPY.certificateBody, `${COPY.approvalLine} __________________`], 1024, 720, 72);
    const officer = placard([COPY.officer, COPY.vacancy], 1024, 230, 78, true);
    const board = placard([COPY.board, '', ''], 1536, 540, 112, true);
    const ctx = context2d(board.texture.image as HTMLCanvasElement);
    ctx.fillStyle = '#ddd5c8'; ctx.font = `600 45px ${FONT_COND}`;
    COPY.lamps.forEach((line, i) => ctx.fillText(line, 170 + i * 300, 250, 276));
    board.texture.needsUpdate = true;
    const tabs = COPY.catches.map(line => placard([line], 512, 160, 80));
    return { sign, certificate, officer, board, tabs,
      plane: new PlaneGeometry(1,1), box: new BoxGeometry(1,1,1), lamp: new SphereGeometry(.03,12,8), socket: new CylinderGeometry(.036,.036,.012,16,1,true),
      rim: new TorusGeometry(.032,.004,8,24),
      bulb: new MeshStandardMaterial({color:'#d59b4a',emissive:'#d59b4a',emissiveIntensity:.8,roughness:.3}),
      unlit: new MeshStandardMaterial({color:'#403921',roughness:.4}),
    };
  }, []);
  useEffect(() => () => {
    for (const item of [art.sign,art.certificate,art.officer,art.board,...art.tabs]) { item.texture.dispose();item.material.dispose(); }
    for (const geometry of [art.plane,art.box,art.lamp,art.socket,art.rim]) geometry.dispose();
    art.bulb.dispose();art.unlit.dispose();
  }, [art]);
  useEffect(() => director.subscribe(event => {
    if(event.type === 'reply' && event.step <= 5) { sim.current = {step:event.step,at:event.printAt};invalidate(); }
    if(event.type === 'reset') { sim.current = {step:0,at:Number.NEGATIVE_INFINITY};invalidate(); }
  }), [director,invalidate]);
  useFrame(() => {
    const s=sim.current,elapsed=performance.now()-s.at,pose=applicationAt(s.step,elapsed,motion.reduced);
    lamps.current.forEach((mesh,i) => { if(mesh) mesh.material=pose.lamps[i] ? art.bulb : art.unlit; });
    catches.current.forEach((mesh,i) => {if(mesh){ const t=pose.catches[i]??0;mesh.visible=t>0;mesh.position.y=-.15-(1-t)*.12; }});
    art.officer.material.emissiveIntensity=.03+.55*pose.reveal;
    art.officer.material.color.setScalar(.08+.92*pose.reveal);
    if(windowLight.current)windowLight.current.intensity=8+12*pose.reveal;
    const end = motion.reduced ? 0 : beatDuration(s.step) + (s.step >= 5 ? 1500 : 180);
    if(Number.isFinite(s.at) && elapsed < end)invalidate();
  });
  const plane = (name: string, item: {material:MeshStandardMaterial}, position: readonly [number,number,number], size:[number,number]) =>
    <mesh name={name} geometry={art.plane} material={item.material} position={[...position]} rotation={[0,Math.PI,0]} scale={[...size,1]} />;
  return <group dispose={null}>
    {plane('office-certificate-sign',art.sign,officeAssetSlot('certificate-sign').position,[1.6,.26])}
    {plane('office-blank-certificate',art.certificate,officeAssetSlot('blank-certificate').position,[.64,.84])}
    <mesh geometry={art.box} material={materials.wood} {...officeAssetPose('certificate-easel')} scale={[.42,.025,.18]} />
    {plane('office-officer-nameplate',art.officer,officeAssetSlot('officer-nameplate').position,[1,.28])}
    <group name="office-application-board" {...officeAssetPose('application-board')}>
      <mesh geometry={art.box} material={materials.enamelDark} scale={[1.95,.62,.05]} />
      <mesh geometry={art.plane} material={art.board.material} position={[0,0,.027]} scale={[1.92,.57,1]} />
      {Array.from({length:5},(_,i)=><group key={i} position={[-.78+i*.39,-.02,.045]}>
        <mesh geometry={art.socket} material={materials.frame} rotation={[Math.PI/2,0,0]} />
        <mesh geometry={art.rim} material={materials.brass} position={[0,0,.008]} />
        {i<4 ? <mesh ref={el=>{lamps.current[i]=el;}} geometry={art.lamp} material={art.bulb} position={[0,0,.012]} /> : null}
        {i<4 ? <mesh ref={el=>{catches.current[i]=el;}} geometry={art.plane} material={art.tabs[i]?.material ?? materials.boneSheet} position={[0,-.15,.015]} scale={[.36,.13,1]} /> : null}
      </group>)}
    </group>
    <pointLight ref={windowLight} position={[-2.25,2.2,8.8]} color="#d1dcc7" intensity={8} distance={7} decay={2} />
  </group>;
}
