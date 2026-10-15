import { describe, expect, it } from 'vitest';
import { APARTMENT_OBJECTS, createApartmentState, transitionApartmentState } from './state.ts';

describe('The Apartment state machine', () => {
  it('keeps the reply, investigation and unanswered paths independently reachable', () => {
    const openedPhone = transitionApartmentState(createApartmentState(), { type: 'touch', object: 'phone' });
    const engaged = transitionApartmentState(openedPhone, { type: 'reply', choice: 'fine' });
    expect(engaged.path).toBe('engage');
    expect(engaged.outwardReply).toBe(true);

    let investigated = createApartmentState();
    for (let index = 0; index < 3; index += 1) {
      investigated = transitionApartmentState(investigated, { type: 'touch', object: 'phone' });
    }
    expect(investigated.path).toBe('investigate');
    expect(investigated.replySet).toBe('revised');

    let stopped = transitionApartmentState(createApartmentState(), { type: 'wait' });
    stopped = transitionApartmentState(stopped, { type: 'tick', elapsedMs: 20_000 });
    expect(stopped.path).toBe('stop');
    expect(stopped.replySet).toBe('unsure');
  });

  it('gives every inspectable object a state-machine event and unlocks the platform without a hole', () => {
    let state = createApartmentState();
    for (const object of APARTMENT_OBJECTS) {
      state = transitionApartmentState(state, { type: 'touch', object: object.id });
      expect(state.touched).toContain(object.id);
    }
    expect(state.elevatorAvailable).toBe(true);
    expect(state.elevatorPlatformIntact).toBe(true);
    const selected = transitionApartmentState(state, { type: 'select-elevator' });
    expect(selected.elevatorGateRaised).toBe(true);
    expect(selected.elevatorPlatformIntact).toBe(true);
  });

  it('makes the elevator available after twelve seconds without counting hidden time', () => {
    const waiting = transitionApartmentState(createApartmentState(), { type: 'tick', elapsedMs: 11_999 });
    expect(waiting.elevatorAvailable).toBe(false);
    const ready = transitionApartmentState(waiting, { type: 'tick', elapsedMs: 1 });
    expect(ready.elevatorAvailable).toBe(true);
  });
});
