import type { Material, WebGLProgramParametersWithUniforms } from 'three';
import { FOG_POWER, FOG_RATE } from './fog.ts';
import { MAX_LAMPS } from './lighting.ts';
import { CORRIDOR } from '../layout.ts';

/**
 * Shader additions shared by every corridor material, injected with onBeforeCompile:
 *  - the static lamps (see lighting.ts), evaluated with three's own GGX and Lambert terms so
 *    metal, enamel and polished terrazzo catch the sconces correctly;
 *  - the corridor's fog curve, replacing three's smoothstep fog.
 * No shadow maps and no real lights are involved. The anchors are checked at compile time and
 * by a unit test, so a three.js upgrade that moves a chunk fails loudly instead of silently
 * rendering an unlit corridor.
 */

export interface SharedUniforms {
  tqwLampPos: { value: Float32Array };
  tqwLampCol: { value: Float32Array };
  /** How many of the lamp slots are in use: the loop stops there, so spare slots cost nothing. */
  tqwLampCount: { value: number };
  /** Strength of the broad, faint tail every lamp adds to its pool (see the lamp loop). */
  tqwTail: { value: number };
}

/** How a material takes the corridor's shader additions. */
export type ShaderMode =
  /** Lit by the lamps (diffuse and GGX specular) and fogged: MeshStandard / MeshPhysical. */
  | 'lit'
  /** Lit by the lamps (diffuse only) and fogged: MeshLambert, the lite tier. */
  | 'lambert'
  /** Fogged toward the fog colour (unlit, opaque or alpha-blended). */
  | 'flat'
  /** Fogged by fading out: additive glows must not add the fog colour. */
  | 'additive';

/** The three.js chunk includes this patch replaces; exported so a test can check each exists. */
export const LIGHT_PARS_ANCHOR = '#include <lights_pars_begin>';
export const LIGHT_ANCHOR = '#include <lights_fragment_begin>';
export const FOG_ANCHOR = '#include <fog_fragment>';

export const LAMP_PARS = /* glsl */ `
${LIGHT_PARS_ANCHOR}
#define TQW_LAMPS ${MAX_LAMPS}
// A sconce is an opal shade, not a point: no mirror finish may reflect it as a pinpoint.
#define TQW_MIN_LAMP_ROUGHNESS 0.26
uniform vec4 tqwLampPos[ TQW_LAMPS ];
uniform vec4 tqwLampCol[ TQW_LAMPS ];
uniform float tqwTail;
uniform float tqwLampCount;
`;

export const LAMP_LOOP = /* glsl */ `
${LIGHT_ANCHOR}
{
	mat3 tqwView = mat3( viewMatrix );
	vec3 tqwWorld = cameraPosition + geometryPosition * tqwView;
	for ( int i = 0; i < TQW_LAMPS; i ++ ) {
		if ( float( i ) >= tqwLampCount ) break;
		vec4 lp = tqwLampPos[ i ];
		vec3 d = lp.xyz - tqwWorld;
		float d2 = dot( d, d );
		if ( d2 > lp.w * lp.w ) continue;
		vec4 lc = tqwLampCol[ i ];
		float dist = sqrt( d2 );
		// A tight pool plus a broad faint tail: light bounces around a corridor, so the piers between
		// pools (and the doors set into them) are dim but never black.
		float att = 1.0 / ( 1.0 + d2 / ( lc.w * lc.w ) ) + tqwTail / ( 1.0 + d2 / ( lc.w * lc.w * 22.0 ) );
		att *= 1.0 - smoothstep( lp.w * 0.45, lp.w, dist );
		directLight.direction = normalize( tqwView * ( d / dist ) );
		directLight.color = lc.rgb * att;
		directLight.visible = true;
		float tqwNL = saturate( dot( geometryNormal, directLight.direction ) );
		vec3 tqwIrradiance = tqwNL * directLight.color;
		{ PhysicalMaterial tqwMat = material; tqwMat.roughness = max( material.roughness, TQW_MIN_LAMP_ROUGHNESS ); reflectedLight.directSpecular += tqwIrradiance * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, tqwMat ); }
		reflectedLight.directDiffuse += tqwIrradiance * BRDF_Lambert( material.diffuseContribution );
	}
}
`;

/** The same lamp loop for the lite tier's Lambert materials: no specular, a far shorter program. */
export const LAMP_LOOP_LAMBERT = LAMP_LOOP.replace(
  /\t\t\{ PhysicalMaterial[^\n]*\n\t\treflectedLight\.directDiffuse[^\n]*\n/,
  '\t\treflectedLight.directDiffuse += tqwIrradiance * BRDF_Lambert( material.diffuseColor );\n',
);

const FOG_AMOUNT = /* glsl */ `1.0 - exp( - ${FOG_RATE.toFixed(7)} * pow( max( vFogDepth - ${CORRIDOR.fog.near.toFixed(1)}, 0.0 ), ${FOG_POWER.toFixed(7)} ) )`;

export const FOG_CODE = /* glsl */ `
#ifdef USE_FOG
	float tqwFog = ${FOG_AMOUNT};
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, tqwFog );
#endif
`;

export const FOG_CODE_ADDITIVE = /* glsl */ `
#ifdef USE_FOG
	float tqwFog = ${FOG_AMOUNT};
	gl_FragColor.rgb *= 1.0 - tqwFog;
#endif
`;

/**
 * Patch a material in place. `lit` materials (MeshStandard / MeshPhysical) get the lamps; every
 * material gets the fog curve. Materials with the same mode share a compiled program.
 */
export function patchMaterial(material: Material, shared: SharedUniforms, mode: ShaderMode): void {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    let fragment = shader.fragmentShader;
    if (!fragment.includes(FOG_ANCHOR)) throw new Error('corridor shader: fog anchor missing from the fragment shader');
    fragment = fragment.replace(FOG_ANCHOR, mode === 'additive' ? FOG_CODE_ADDITIVE : FOG_CODE);
    if (mode === 'lit' || mode === 'lambert') {
      if (!fragment.includes(LIGHT_PARS_ANCHOR) || !fragment.includes(LIGHT_ANCHOR)) {
        throw new Error('corridor shader: light anchors missing from the fragment shader');
      }
      fragment = fragment.replace(LIGHT_PARS_ANCHOR, LAMP_PARS).replace(LIGHT_ANCHOR, mode === 'lambert' ? LAMP_LOOP_LAMBERT : LAMP_LOOP);
      shader.uniforms['tqwLampPos'] = shared.tqwLampPos;
      shader.uniforms['tqwLampCol'] = shared.tqwLampCol;
      shader.uniforms['tqwTail'] = shared.tqwTail;
      shader.uniforms['tqwLampCount'] = shared.tqwLampCount;
    }
    shader.fragmentShader = fragment;
  };
  material.customProgramCacheKey = () => `tqw-corridor-${mode}`;
}
