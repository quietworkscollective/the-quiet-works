import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { BoxGeometry, CylinderGeometry, MeshStandardMaterial, PlaneGeometry, SphereGeometry, TorusGeometry, type Mesh, type PointLight } from 'three';
import { OFFICE_LEGIBILITY as COPY } from '@tqw/engine';
import { officeAssetPose, officeAssetSlot } from './assetSlots.ts';
import { useHeroModel } from './HeroModel.tsx';
import { useScene } from './context.ts';
import { nameplateRotation } from './nameplate.ts';
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
  const boardHero = useHeroModel('application-board'), signHero = useHeroModel('certificate-sign');
  const invalidate = useThree(s => s.invalidate);
  const lamps = useRef<Array<Mesh | null>>([]), catches = useRef<Array<Mesh | null>>([]);
  const windowLight = useRef<PointLight>(null);
  const nameplate = useRef<Mesh>(null);
  const sim = useRef({ revealAt: store.getState().memo.revealed ? 0 : Number.NEGATIVE_INFINITY });
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
    if (event.type === 'memo-revealed') { sim.current.revealAt = event.hatchAt; invalidate(); }
    if (event.type === 'reset') { sim.current.revealAt = Number.NEGATIVE_INFINITY; invalidate(); }
  }), [director,invalidate]);
  useFrame(() => {
    const revealAt = sim.current.revealAt;
    const elapsed = performance.now() - revealAt;
    const reveal = Number.isFinite(revealAt) ? (motion.reduced ? 1 : Math.max(0, Math.min(1, (elapsed - 800) / 700))) : 0;
    const bulbs = boardHero ? Array.from({length:4},(_,i) => boardHero.getObjectByName(`lamp-${i+1}`) as Mesh | undefined) : lamps.current;
    bulbs.forEach(mesh => { if (mesh) mesh.material = art.unlit; });
    if (boardHero) for (let i=0;i<4;i++) {
      const tab = boardHero.getObjectByName(`catch-${i+1}`);
      if (tab) tab.visible = false;
    }
    catches.current.forEach(mesh => { if (mesh) mesh.visible = false; });
    if(nameplate.current)nameplate.current.rotation.set(...nameplateRotation(reveal));
    art.officer.material.emissiveIntensity=.55*reveal;
    art.officer.material.color.setScalar(.08+.92*reveal);
    if (Number.isFinite(revealAt) && reveal < 1) invalidate();
  });
  const plane = (name: string, item: {material:MeshStandardMaterial}, position: readonly [number,number,number], size:[number,number]) =>
    <mesh name={name} geometry={art.plane} material={item.material} position={[...position]} rotation={[0,Math.PI,0]} scale={[...size,1]} />;
  return <group dispose={null}>
    {signHero ? <group {...officeAssetPose('certificate-sign')}><primitive object={signHero} /></group> : null}
    {plane('office-certificate-sign',art.sign,[...officeAssetSlot('certificate-sign').position.slice(0,2),officeAssetSlot('certificate-sign').position[2]-(signHero ? .018 : 0)] as [number,number,number],signHero?[1.54,.22]:[1.6,.26])}
    {plane('office-blank-certificate',art.certificate,officeAssetSlot('blank-certificate').position,[.64,.84])}
    <mesh geometry={art.box} material={materials.wood} {...officeAssetPose('certificate-easel')} scale={[.42,.025,.18]} />
    <mesh ref={nameplate} userData={{ bake: 'dynamic' }} name="office-officer-nameplate" geometry={art.plane} material={art.officer.material} position={[...officeAssetSlot('officer-nameplate').position]} rotation={nameplateRotation(0)} scale={[1,.28,1]} />
    <group name="office-application-board" {...officeAssetPose('application-board')}>
      {boardHero ? <primitive object={boardHero} /> : <mesh geometry={art.box} material={materials.enamelDark} scale={[1.95,.62,.05]} />}
      <mesh geometry={art.plane} material={art.board.material} position={[0,0,.027]} scale={[1.92,.57,1]} />
      {Array.from({length:5},(_,i)=><group key={i} userData={{ bake: 'dynamic' }} position={[-.78+i*.39,-.02,.045]}>
        {!boardHero ? <>
        <mesh geometry={art.socket} material={materials.frame} rotation={[Math.PI/2,0,0]} />
        <mesh geometry={art.rim} material={materials.brass} position={[0,0,.008]} />
        {i<4 ? <mesh ref={el=>{lamps.current[i]=el;}} geometry={art.lamp} material={art.bulb} position={[0,0,.012]} /> : null}
        </> : null}
        {i<4 ? <mesh ref={el=>{catches.current[i]=el;}} geometry={art.plane} material={art.tabs[i]?.material ?? materials.boneSheet} position={[0,-.15,boardHero ? .020 : .015]} scale={[.36,.13,1]} /> : null}
      </group>)}
    </group>
    <pointLight ref={windowLight} position={[-2.25,2.2,8.8]} color="#ffe0b5" intensity={3} distance={7} decay={2} />
  </group>;
}
