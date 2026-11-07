import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isDynamicExchangeNode } from './nodes.ts';
import { OUTLINE_NODES } from './scene/hotspots.ts';
import { readGlbDocument } from './scene/lettering.ts';

const model = readGlbDocument(new Uint8Array(readFileSync(new URL('./assets/exchange.glb', import.meta.url))));
const named = (name: string) => model.json.nodes.find(node => node.name === name);
const names = new Set(model.json.nodes.map(node => node.name));

describe('The Exchange model contract', () => {
  it('ships every node a hotspot outlines', () => {
    expect(OUTLINE_NODES.filter(name => !names.has(name))).toEqual([]);
  });

  it('numbers the twelve lines in reading order with CERTIFICATION third on the lowest row', () => {
    expect(names.has('certification_jack')).toBe(true);
    expect(names.has('line_jack_03')).toBe(false);
    const at = (line: number) => named(`line_card_${String(line).padStart(2, '0')}`)?.translation ?? [];
    expect(at(1)[0]).toBeCloseTo(-1.375, 4);
    expect(at(3)[0]).toBeCloseTo(0.455, 4);
    expect(at(3)[1]).toBeCloseTo(1.43, 4);
    expect(at(4)[1]).toBeCloseTo(1.43, 4);
    expect(at(5)[1]).toBeCloseTo(2.35, 4);
    expect(at(12)[0]).toBeCloseTo(1.37, 4);
    expect(at(12)[1]).toBeCloseTo(3.27, 4);
  });

  it('carries the plate and the lever on empty pivots at their hinges', () => {
    const plate = named('operator_plate_pivot');
    const lever = named('night_service_pivot');
    expect(plate?.mesh).toBeUndefined();
    expect(lever?.mesh).toBeUndefined();
    expect(plate?.translation?.[0]).toBeCloseTo(0.50, 4);
    expect(plate?.translation?.[2]).toBeCloseTo(-5.70, 4);
    expect(lever?.translation?.[0]).toBeCloseTo(1.37, 4);
    const children = plate?.children?.map(index => model.json.nodes[index]?.name);
    expect(children).toEqual(expect.arrayContaining(['operator_plate', 'operator_plate_outer', 'operator_plate_inner']));
    expect(lever?.children?.map(index => model.json.nodes[index]?.name)).toContain('night_service_switch');
  });

  it('keeps parts on their authored origins, which position quantisation would move', () => {
    const handset = named('phone_handset');
    expect(handset?.translation?.[0]).toBeCloseTo(0.42, 3);
    expect(handset?.translation?.[1]).toBeCloseTo(1.30, 3);
    expect(handset?.scale).toBeUndefined();
    const card = named('line_card_03');
    expect(card?.translation?.[1]).toBeCloseTo(1.43, 3);
  });

  it('holds what moves or changes by state outside the bake, and leaves the room in it', () => {
    for (const name of ['enquiry_plug', 'enquiry_cord_seated', 'operator_plate', 'operator_lamp', 'line_lamp_03', 'line_card_12',
      'ticket_shelf_drawer', 'ticket_form', 'night_service_switch', 'phone_handset', 'operator_ticket_old', 'operator_socket_recess']) {
      expect(isDynamicExchangeNode(name), name).toBe(true);
    }
    for (const name of ['operator_panel', 'ticket_shelf', 'switchboard', 'operator_desk', 'certification_jack', 'exchange_walls']) {
      expect(isDynamicExchangeNode(name), name).toBe(false);
    }
    expect(isDynamicExchangeNode('line_lamp_13')).toBe(false);
  });

  it('has none of the geometry the script cut', () => {
    const cut = [...names].filter(name => /^(field_jacks|gallery|inspect_ladder|inspect_lamp_test|inspect_operator_frame|window_seat)/.test(name ?? ''));
    expect(cut).toEqual([]);
  });
});
