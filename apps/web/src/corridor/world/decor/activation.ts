/** Load the heavier scanned furnishings only after the visitor starts the walk or opens the scene. */
export function shouldLoadCorridorDecor(input: { progress: number; engaged: boolean; phase: string; bakeWorkbench: boolean }): boolean {
  return input.bakeWorkbench || input.engaged || input.phase !== 'entrance' || input.progress > 0;
}
