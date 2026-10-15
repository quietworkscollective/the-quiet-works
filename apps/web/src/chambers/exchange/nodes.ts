/** Mesh node names retained in the lazy runtime model; every other stage mesh is baked. */
export function isDynamicExchangeNode(name: string): boolean {
  return name.startsWith('inspect_') ||
    name.startsWith('line_jack_') ||
    name.startsWith('line_lamp_') ||
    name.startsWith('line_card_') ||
    name === 'operator_lamp' ||
    name === 'operator_nameplate' ||
    name === 'phone_handset' ||
    name === 'desk_lamp_emitter' ||
    name === 'clerestory_emitter';
}
