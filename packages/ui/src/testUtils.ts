import {
  initialState,
  transition,
  type CertificationEvent,
  type CertificationState,
} from '@tqw/engine';

/** Runs events through the real state machine, so test states are never hand-built. */
export function stateAfter(...events: CertificationEvent[]): CertificationState {
  return events.reduce<CertificationState>((state, event) => transition(state, event).state, initialState);
}

/** `count` completed stamps (press then release each time). */
export function stamped(count: number): CertificationState {
  const events: CertificationEvent[] = [];
  for (let i = 0; i < count; i += 1) events.push({ type: 'PRESS' }, { type: 'RELEASE' });
  return stateAfter(...events);
}
