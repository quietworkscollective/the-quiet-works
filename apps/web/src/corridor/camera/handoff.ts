export interface HandoffFrameState {
  visible: boolean;
  stillHero: boolean;
  handoffPending: boolean;
  firstFrameSubmitted: boolean;
  constrained: boolean;
}

export function handoffFrameMode(state: HandoffFrameState): 'demand' | 'never' {
  const holding = state.constrained && state.stillHero && state.handoffPending && state.firstFrameSubmitted;
  return state.visible && !holding ? 'demand' : 'never';
}
