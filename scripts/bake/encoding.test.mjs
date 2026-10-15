import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {verifyRoundtrip} from './codec.mjs';

test('recorded Blender PNG and WebP preserve irradiance with the current encoder',async()=>{
 const fixture=JSON.parse(await readFile(new URL('./fixtures/codec.json',import.meta.url),'utf8'));
 const encoderHash=createHash('sha256').update(await readFile(new URL('./encode.py',import.meta.url))).digest('hex');
 assert.equal(fixture.encoderHash,encoderHash,'Encoder changed; validate and refresh with UPDATE_BAKE_CODEC=1 pnpm test:bake-toolchain');
 const codecHash=createHash('sha256').update(await readFile(new URL('./webp.mjs',import.meta.url))).digest('hex');
 assert.equal(fixture.codecHash,codecHash,'Codec flags changed; validate and refresh with UPDATE_BAKE_CODEC=1 pnpm test:bake-toolchain');
 await verifyRoundtrip(fixture);
});
