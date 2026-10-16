import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { BoxGeometry, DoubleSide, MeshStandardMaterial, Vector3, type Group, type Mesh, type Texture } from 'three';
import { beatAt, beatDuration, impression, poseFoldPanel, windowTarget, type ImpressionPosition } from './beatMotion.ts';
import { composeForm, drawFormBase, drawPaperDetail, FORM_H, FORM_W } from './canvasArt.ts';
import { useFontsReady, useScene } from './context.ts';
import { LAYOUT, PAPER_TOP } from './palette.ts';
import { createCanvas, makeTexture } from './textures.ts';

export interface PaperBeatsProps {
  selectedPosition?: ImpressionPosition;
  freshInk?: boolean;
  /** Root supplies the real employee-window clip in world coordinates. */
  windowClipWorld?: readonly [number, number, number];
  /** Desk-local feed direction; root can redirect the enclosed channel to the relocated machine. */
  channelDirection?: readonly [number, number];
  formTexture?: Texture;
}
const CHANNEL = [LAYOUT.machine.x - LAYOUT.press.x, LAYOUT.machine.z - LAYOUT.press.z] as const;
const WINDOW_CLIP = [-2.25, 1.08, 8] as const;

/** All coordinates are desk-local; the world target is converted through the mounted desk. */
export function PaperBeats({
  selectedPosition = 'centre', freshInk = false, windowClipWorld = WINDOW_CLIP,
  channelDirection = CHANNEL, formTexture,
}: PaperBeatsProps) {
  const { director, store, materials, motion } = useScene();
  const invalidate = useThree((s) => s.invalidate);
  const fontsReady = useFontsReady();
  const root = useRef<Group>(null);
  const original = useRef<Group>(null);
  const duplicate = useRef<Group>(null);
  const overlay = useRef<Mesh>(null);
  const tab = useRef<Mesh>(null);
  const clip = useRef<Group>(null);
  const folds = useRef<Array<Group | null>>([]);
  const sim = useRef({ step: 0, at: Number.NEGATIVE_INFINITY, inked: 0, liftAt: Number.NEGATIVE_INFINITY, preparing: false });

  const art = useMemo(() => {
    const canvas = createCanvas(FORM_W, FORM_H);
    const base = drawFormBase();
    const texture = makeTexture(canvas, { anisotropy: materials.anisotropy });
    const own = new MeshStandardMaterial({ map: formTexture ?? texture, roughness: 0.94, side: DoubleSide });
    const carbon = own.clone();
    carbon.color.set('#a8b8b3');
    const film = new MeshStandardMaterial({ color: '#b6beb2', transparent: true, opacity: 0.32, roughness: 0.82, depthWrite: false });
    const detail = (kind: 'expiry' | 'fold') => {
      const c = createCanvas(512, 256);
      drawPaperDetail(c, kind);
      const t = makeTexture(c, { anisotropy: materials.anisotropy });
      const m = new MeshStandardMaterial({ map: t, roughness: 0.94, side: DoubleSide });
      return { canvas: c, texture: t, material: m };
    };
    return { canvas, base, texture, own, carbon, film, expiry: detail('expiry'), fold: detail('fold'),
      sheet: new BoxGeometry(0.36, 0.0015, 0.48),
      filmGeometry: new BoxGeometry(0.35, 0.0005, 0.47),
      tabGeometry: new BoxGeometry(0.10, 0.001, 0.05),
      foldGeometry: new BoxGeometry(0.30, 0.0012, 0.18),
      clipGeometry: new BoxGeometry(0.085, 0.018, 0.025),
    };
  }, [materials.anisotropy, formTexture]);

  useEffect(() => () => {
    for (const g of [art.sheet, art.filmGeometry, art.tabGeometry, art.foldGeometry, art.clipGeometry]) g.dispose();
    for (const m of [art.own, art.carbon, art.film, art.expiry.material, art.fold.material]) m.dispose();
    for (const t of [art.texture, art.expiry.texture, art.fold.texture]) t.dispose();
  }, [art]);

  useEffect(() => {
    const n = store.getState().stamps;
    sim.current.step = n;
    sim.current.inked = n;
    sim.current.at = Number.NEGATIVE_INFINITY;
    invalidate();
  }, [store, invalidate]);

  useEffect(() => {
    composeForm(art.canvas, art.base, sim.current.inked, impression(selectedPosition, freshInk, 150));
    drawPaperDetail(art.expiry.canvas, 'expiry');
    drawPaperDetail(art.fold.canvas, 'fold');
    art.texture.needsUpdate = art.expiry.texture.needsUpdate = art.fold.texture.needsUpdate = true;
    invalidate();
  }, [art, fontsReady, selectedPosition, freshInk, invalidate]);

  useEffect(() => director.subscribe((event) => {
    const s = sim.current;
    if (event.type === 'contact' && store.getState().playStep === 'ready') {
      s.step = 1;
      s.preparing = true;
    }
    if (event.type === 'lift') { s.inked = event.n; s.liftAt = event.at; }
    if (event.type === 'reply') {
      s.step = event.step;
      s.preparing = false;
      s.at = event.printAt;
      composeForm(art.canvas, art.base, s.inked, impression(selectedPosition, freshInk, 150));
      art.texture.needsUpdate = true;
    }
    if (event.type === 'reset') {
      s.step = s.inked = 0;
      s.preparing = false;
      s.at = Number.NEGATIVE_INFINITY;
      composeForm(art.canvas, art.base, 0);
      art.texture.needsUpdate = true;
    }
  }), [director, store, art, selectedPosition, freshInk]);

  const channel = useMemo(() => new Vector3(channelDirection[0], 0, channelDirection[1]).normalize(), [channelDirection]);
  const target = useMemo(() => new Vector3(), []);
  const start = useMemo(() => new Vector3(LAYOUT.press.x, PAPER_TOP, LAYOUT.press.z - 0.048), []);
  const duplicateStart = useMemo(() => start.clone().add(new Vector3(-0.035, 0.004, 0.03)), [start]);
  useFrame((state) => {
    const s = sim.current;
    const elapsed = s.preparing ? 0 : performance.now() - s.at;
    const pose = beatAt(s.step, elapsed, motion.reduced);
    const desk = root.current;
    if (desk) target.copy(windowTarget(desk, windowClipWorld));
    if (original.current) {
      original.current.position.set(start.x + pose.shuffle + channel.x * pose.travel, start.y + pose.curl, start.z + channel.z * pose.travel);
      original.current.visible = !(s.step === 5 && elapsed >= 650) && s.step !== 4;
      // A short adhesion on release, then the stock drops free of the rubber.
      const lift = performance.now() - s.liftAt;
      if (!motion.reduced && lift >= 0 && lift < 120) {
        original.current.position.y += 0.003 * Math.sin(Math.PI * lift / 120);
        state.invalidate();
      }
    }
    if (overlay.current) overlay.current.visible = pose.overlay > 0 || s.step === 1 && elapsed >= beatDuration(1);
    if (tab.current) tab.current.visible = pose.expired;
    if (duplicate.current) {
      duplicate.current.visible = s.step === 3;
      duplicate.current.position.copy(duplicateStart).lerp(target, pose.duplicate);
      duplicate.current.rotation.x = -Math.PI / 2 * pose.duplicate;
    }
    if (clip.current) {
      clip.current.position.copy(target);
      clip.current.visible = s.step === 3;
    }
    for (let i = 0; i < 6; i += 1) {
      const fold = folds.current[i];
      if (!fold) continue;
      const amount = Math.max(0, Math.min(1, pose.folds - i));
      fold.visible = s.step === 4 && amount > 0;
      poseFoldPanel(fold, i, pose.folds, pose.drape, start);
    }
    if (!s.preparing && (pose.active || elapsed < 0 && Number.isFinite(s.at))) state.invalidate();
    // No narrative changes or frames after the finite sequence has settled.
    if (elapsed >= beatDuration(s.step)) s.at = Number.NEGATIVE_INFINITY;
  });

  return (
    <group ref={root}>
      <group ref={original} rotation={[0, LAYOUT.press.yaw - 0.025, 0]}>
        <mesh geometry={art.sheet} material={art.own} castShadow receiveShadow />
        <mesh ref={overlay} geometry={art.filmGeometry} material={art.film} position={[0, 0.002, 0]} visible={false} />
        <mesh ref={tab} geometry={art.tabGeometry} material={art.expiry.material} position={[0.12, 0.004, -0.22]} visible={false} />
      </group>
      <group ref={duplicate} visible={false}>
        <mesh geometry={art.sheet} material={art.carbon} castShadow receiveShadow />
      </group>
      <group ref={clip} visible={false}>
        <mesh geometry={art.clipGeometry} material={materials.brassWorn} />
      </group>
      {Array.from({ length: 6 }, (_, i) => (
        <group key={i} ref={(g) => { folds.current[i] = g; }} visible={false}>
          <mesh geometry={art.foldGeometry} material={art.fold.material} castShadow receiveShadow />
        </group>
      ))}
    </group>
  );
}
