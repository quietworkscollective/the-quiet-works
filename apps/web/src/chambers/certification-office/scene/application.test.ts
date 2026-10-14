import { expect, it } from 'vitest';
import { applicationAt } from './application.ts';
import { beatDuration } from './beatMotion.ts';
it('lights the current lamp with the relay, then drops its catch when its paper lands', () => {
 for(let step=1;step<=4;step++) {
  expect(applicationAt(step,-1).lamps[step-1]).toBe(false);
  expect(applicationAt(step,0).lamps[step-1]).toBe(true);
  expect(applicationAt(step,beatDuration(step)-1).catches[step-1]).toBe(0);
  expect(applicationAt(step,beatDuration(step)+180).catches[step-1]).toBe(1);
 }
});
it('keeps the fifth socket empty during overload and all later stamps', () => {
 for(const step of [0,1,4,5,6,999])expect(applicationAt(step,10000).lamps[4]).toBe(false);
 expect(applicationAt(5,10000).lamps).toEqual([true,true,true,true,false]);
});
it('reveals the vacant officer over 1.5 seconds after the final physical beat', () => {
 const end=beatDuration(5);expect(applicationAt(5,end).reveal).toBe(0);
 expect(applicationAt(5,end+750).reveal).toBe(.5);expect(applicationAt(5,end+1500).reveal).toBe(1);
 expect(applicationAt(4,10000).reveal).toBe(0);expect(applicationAt(0,10000).lamps).toEqual([false,false,false,false,false]);
});
it('cuts catch and reveal motion when reduced motion is enabled', () => {
 expect(applicationAt(4,0,true).catches).toEqual([1,1,1,1]);
 expect(applicationAt(5,0,true).reveal).toBe(1);
 expect(applicationAt(5,-1,true).reveal).toBe(0);
});
