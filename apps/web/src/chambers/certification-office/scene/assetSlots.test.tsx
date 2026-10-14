import { expect, it } from 'vitest';
import { Object3D } from 'three';
import { OFFICE_ASSET_SLOTS, OFFICE_BOX_SIZES, OFFICE_LABEL_VARIANTS, officeAssetSlot } from './assetSlots.ts';
import { OfficeAsset } from './OfficeAsset.tsx';
it('has unique finite placements in all seven production zones, with neutral local catalogue slots', () => {
 expect(new Set(OFFICE_ASSET_SLOTS.map(slot=>slot.id)).size).toBe(OFFICE_ASSET_SLOTS.length);
 expect(new Set(OFFICE_ASSET_SLOTS.map(slot=>slot.zone)).size).toBe(7);
 for(const slot of OFFICE_ASSET_SLOTS){
  expect([...slot.position,...slot.rotation,...slot.footprint].every(Number.isFinite)).toBe(true);
  expect(slot.footprint.every(size=>size>0)).toBe(true);
  expect(slot.catalogueId).toBeNull();
  expect(JSON.parse(JSON.stringify(slot))).toEqual(slot);
 }
 expect(OFFICE_ASSET_SLOTS.filter(slot=>/^archive-bay-/.test(slot.id))).toHaveLength(10);
 expect(OFFICE_BOX_SIZES).toHaveLength(3);expect(OFFICE_LABEL_VARIANTS).toHaveLength(4);
});
it('replaces a passive placeholder at the same mount without attaching interaction to the model', () => {
 const fallback=<mesh />,model=new Object3D();
 const placeholder=OfficeAsset({id:'desk',children:fallback});
 const scanned=OfficeAsset({id:'desk',children:fallback,model});
 expect(placeholder.props.position).toEqual(scanned.props.position);
 expect(placeholder.props.children).toBe(fallback);
 expect(scanned.props.children.props.object).toBe(model);
 expect(scanned.props.onClick).toBeUndefined();
 expect(officeAssetSlot('desk').position).toEqual(scanned.props.position);
 expect(()=>officeAssetSlot('missing')).toThrow('Unknown Office asset placement');
});
