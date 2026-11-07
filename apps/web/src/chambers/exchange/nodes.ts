/**
 * Nodes that stay out of the static lightmap: everything that moves, everything shown or hidden by
 * state, and the lamps and printed sheets whose look is set at runtime. The recess is listed because
 * the plate is shut at bake time, so a lightmap there would stay dark after the plate opens.
 */
const LIVE_NODES: ReadonlySet<string> = new Set([
  'apron_strip', 'clerestory_emitter', 'desk_lamp_emitter', 'ledge_lamp_emitter', 'operator_lamp',
  'enquiry_plug', 'enquiry_cord_rest', 'enquiry_cord_guide', 'enquiry_cord_seated',
  'phone_handset', 'phone_coiled_cord', 'phone_coiled_cord_laid',
  'night_service_switch', 'ticket_shelf_drawer', 'ticket_form',
  'operator_plate', 'operator_plate_outer', 'operator_plate_inner',
  'operator_socket_recess', 'operator_socket', 'operator_test_lead_rest', 'operator_test_lead_seated',
  'operator_test_lead_clip', 'operator_ticket_old', 'operator_ticket_new', 'fitter_docket_pin',
  'inspect_fitter_docket', 'inspect_shift_roster', 'inspect_shelf_index', 'wiring_diagram_sheet',
  'exchange_board_title_face',
]);

export function isDynamicExchangeNode(name: string): boolean {
  return LIVE_NODES.has(name) || /^line_(lamp|card)_(0[1-9]|1[0-2])$/.test(name);
}
