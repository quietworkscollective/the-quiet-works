import { describe, expect, it } from 'vitest';
import { chooseQuality, isSoftwareRenderer, LITE_PIXEL_RATIO } from './quality.ts';

const SOFTWARE = [
  'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)',
  'llvmpipe (LLVM 15.0.6, 256 bits)',
  'Microsoft Basic Render Driver',
  'Software Rasterizer',
];
const GPU = [
  'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)',
  'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'Mali-G710 MC10',
  'Adreno (TM) 730',
  'Mesa Intel(R) UHD Graphics 630 (CFL GT2)',
];

describe('render tier', () => {
  it('recognises software rasterisers by the names they report', () => {
    for (const name of SOFTWARE) expect(isSoftwareRenderer(name), name).toBe(true);
  });

  it('leaves every real GPU on the full tier', () => {
    for (const name of GPU) expect(isSoftwareRenderer(name), name).toBe(false);
  });

  it('picks the lite tier for a software renderer and the full tier for a GPU', () => {
    expect(chooseQuality(SOFTWARE[0]!, '')).toBe('lite');
    expect(chooseQuality(GPU[0]!, '')).toBe('full');
    expect(chooseQuality('', '')).toBe('full');
  });

  it('lets ?quality=high and ?quality=low override detection, and ignores anything else', () => {
    expect(chooseQuality(SOFTWARE[0]!, '?quality=high')).toBe('full');
    expect(chooseQuality(GPU[0]!, '?quality=low')).toBe('lite');
    expect(chooseQuality(SOFTWARE[1]!, '?quality=ultra')).toBe('lite');
    expect(chooseQuality(GPU[1]!, '?mode=text&quality=low')).toBe('lite');
  });

  it('renders the lite tier at a reduced, but still positive, pixel ratio', () => {
    expect(LITE_PIXEL_RATIO).toBeGreaterThan(0.3);
    expect(LITE_PIXEL_RATIO).toBeLessThan(1);
  });
});
