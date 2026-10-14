import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  NormalBlending,
  PointsMaterial,
  type Points,
} from 'three';
import { easeOutCubic, lerp, mulberry32 } from './anim.ts';
import { useScene } from './context.ts';
import { PAPER_TOP } from './palette.ts';
import { drawSoftSprite } from './textures.ts';

const COUNT = 24;
/** Half extents of the rubber pad: the burst starts on its perimeter. */
const HALF_X = 0.083;
const HALF_Z = 0.054;
const LIFE_MIN = 280;
const LIFE_MAX = 420;

/**
 * Wet ink thrown outward from the rubber's edge at contact: 24 soft points, one Points object,
 * allocated once and reused for every stamp. Normal blending, no depth writes. Skipped entirely
 * under reduced motion.
 */
export function InkPuff() {
  const { director, motion } = useScene();
  const invalidate = useThree((s) => s.invalidate);
  const pointsRef = useRef<Points>(null);

  const puff = useMemo(() => {
    const geometry = new BufferGeometry();
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 4);
    const positionAttr = new BufferAttribute(positions, 3);
    const colorAttr = new BufferAttribute(colors, 4);
    geometry.setAttribute('position', positionAttr);
    geometry.setAttribute('color', colorAttr);
    const sprite = drawSoftSprite();
    const material = new PointsMaterial({
      map: sprite,
      size: 0.04,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
      fog: false,
    });
    return {
      geometry,
      material,
      sprite,
      positionAttr,
      colorAttr,
      positions,
      colors,
      startX: new Float32Array(COUNT),
      startZ: new Float32Array(COUNT),
      dirX: new Float32Array(COUNT),
      dirZ: new Float32Array(COUNT),
      reach: new Float32Array(COUNT),
      life: new Float32Array(COUNT),
      burstAt: Number.NEGATIVE_INFINITY,
      bursts: 0,
      ink: new Color('#24504e'),
    };
  }, []);

  useEffect(
    () => () => {
      puff.geometry.dispose();
      puff.material.dispose();
      puff.sprite.dispose();
    },
    [puff],
  );

  useEffect(
    () =>
      director.subscribe((event) => {
        if (event.type === 'contact') {
          if (motion.reduced) return;
          puff.bursts += 1;
          puff.burstAt = event.touchAt;
          const rng = mulberry32(0x1a4 + puff.bursts * 977);
          const perimeter = 4 * (HALF_X + HALF_Z);
          for (let i = 0; i < COUNT; i += 1) {
            // Spread evenly around the pad's perimeter with a little jitter.
            const along = ((i + rng() * 0.6) / COUNT) * perimeter;
            let x: number;
            let z: number;
            let nx = 0;
            let nz = 0;
            const wTop = 2 * HALF_X;
            const hSide = 2 * HALF_Z;
            if (along < wTop) {
              x = -HALF_X + along;
              z = -HALF_Z;
              nz = -1;
            } else if (along < wTop + hSide) {
              x = HALF_X;
              z = -HALF_Z + (along - wTop);
              nx = 1;
            } else if (along < 2 * wTop + hSide) {
              x = HALF_X - (along - wTop - hSide);
              z = HALF_Z;
              nz = 1;
            } else {
              x = -HALF_X;
              z = HALF_Z - (along - 2 * wTop - hSide);
              nx = -1;
            }
            const spread = (rng() - 0.5) * 0.9;
            const c = Math.cos(spread);
            const s = Math.sin(spread);
            puff.startX[i] = x;
            puff.startZ[i] = z;
            puff.dirX[i] = nx * c - nz * s;
            puff.dirZ[i] = nx * s + nz * c;
            puff.reach[i] = 0.018 + rng() * 0.034;
            puff.life[i] = LIFE_MIN + rng() * (LIFE_MAX - LIFE_MIN);
          }
        } else if (event.type === 'reset') {
          puff.burstAt = Number.NEGATIVE_INFINITY;
          if (pointsRef.current) pointsRef.current.visible = false;
        }
      }),
    [director, motion, puff],
  );

  useFrame((state) => {
    const points = pointsRef.current;
    if (!points) return;
    const elapsed = performance.now() - puff.burstAt;
    if (elapsed < 0) {
      points.visible = false;
      state.invalidate();
      return;
    }
    if (elapsed > LIFE_MAX) {
      if (points.visible) {
        points.visible = false;
        invalidate();
      }
      return;
    }
    points.visible = true;
    const { positions, colors } = puff;
    for (let i = 0; i < COUNT; i += 1) {
      const life = puff.life[i] ?? LIFE_MAX;
      const t = Math.min(1, elapsed / life);
      const travel = easeOutCubic(t) * (puff.reach[i] ?? 0);
      positions[i * 3] = (puff.startX[i] ?? 0) + (puff.dirX[i] ?? 0) * travel;
      positions[i * 3 + 1] = PAPER_TOP + 0.0016;
      positions[i * 3 + 2] = (puff.startZ[i] ?? 0) + (puff.dirZ[i] ?? 0) * travel;
      colors[i * 4] = puff.ink.r;
      colors[i * 4 + 1] = puff.ink.g;
      colors[i * 4 + 2] = puff.ink.b;
      colors[i * 4 + 3] = t >= 1 ? 0 : 0.95 * Math.pow(1 - t, 0.9);
    }
    puff.material.size = lerp(0.05, 0.085, easeOutCubic(Math.min(1, elapsed / LIFE_MAX)));
    puff.positionAttr.needsUpdate = true;
    puff.colorAttr.needsUpdate = true;
    state.invalidate();
  });

  return (
    <points
      ref={pointsRef}
      geometry={puff.geometry}
      material={puff.material}
      frustumCulled={false}
      visible={false}
      renderOrder={4}
    />
  );
}
