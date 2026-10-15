import { MODELS } from './models/index.ts';
import type { PropModelKit } from './modelKit.ts';
import type { PropVisual } from './model.ts';
import { Assembly } from './parts.ts';
import { placementOf } from './placement.ts';
import type { PropVisuals } from './visuals.ts';

/**
 * Every prop built into one assembly (pure data: no GL), in contract order. A prop's visual is its
 * procedural default unless `visuals` replaces it: with another procedural visual (built the same
 * way), or with an external one (its own meshes, mounted by the rig), in which case only the
 * prop's moving parts are declared here. `kit` is the ready-made models that loaded: a prop builds
 * from its models where it has them and procedurally where it does not.
 */
export function buildProps(visuals: PropVisuals = {}, kit?: PropModelKit): Assembly {
  const assembly = new Assembly();
  for (const model of MODELS) {
    const placement = placementOf(model.id);
    assembly.begin(placement, model.parts(placement));
    if (visuals.external?.[model.id]) {
      assembly.declareParts();
      continue;
    }
    const visual: PropVisual = visuals.procedural?.[model.id] ?? model;
    visual.build(assembly, placement, kit);
  }
  return assembly;
}
