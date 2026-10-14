import { expect, it } from 'vitest';
import { createCueSelection } from './cues.ts';
const fitting = { id: 'fitting', distance: 2.2, angle: 25, occluded: false };
it('requires 250 ms continuously inside both eligibility limits', () => {
 const pick=createCueSelection(); expect(pick([fitting],0)).toEqual({id:null,wakeAt:250});
 expect(pick([fitting],249).id).toBeNull(); expect(pick([{...fitting,angle:25.01}],250).id).toBeNull();
 pick([fitting],300); expect(pick([fitting],550).id).toBe('fitting');
});
it('uses distance and angle hysteresis and keeps only one prompt', () => {
 const pick=createCueSelection();pick([fitting],0);pick([fitting],250);
 expect(pick([{...fitting,distance:2.7,angle:35},{...fitting,id:'other',angle:0}],500).id).toBe('fitting');
 expect(pick([{...fitting,distance:2.701}],501).id).toBeNull();
});
it('dismisses after 350 ms occluded and cancels the deadline on visibility', () => {
 const pick=createCueSelection();pick([fitting],0);pick([fitting],250);
 expect(pick([{...fitting,occluded:true}],300)).toEqual({id:'fitting',wakeAt:650});
 expect(pick([fitting],649).wakeAt).toBeNull();pick([{...fitting,occluded:true}],700);
 expect(pick([{...fitting,occluded:true}],1049).id).toBe('fitting');
 expect(pick([{...fitting,occluded:true}],1050).id).toBeNull();
});
it('never removes the focused fitting on a timer, distance or occlusion', () => {
 const pick=createCueSelection();expect(pick([],0,'fitting')).toEqual({id:'fitting',wakeAt:null});
 expect(pick([],10000,'fitting').id).toBe('fitting');expect(pick([],10001).id).toBeNull();
});
it('does not qualify outside 2.2 metres and leaves beyond 35 degrees', () => {
 const pick=createCueSelection();expect(pick([{...fitting,distance:2.201}],0).wakeAt).toBeNull();
 pick([fitting],100);pick([fitting],350);expect(pick([{...fitting,angle:35.001}],400).id).toBeNull();
});
it('frames the tapped fitting with the same delay and still releases it when walking away', () => {
 const pick=createCueSelection(),base={...fitting,angle:5},other={...fitting,id:'tapped',angle:20};
 pick([base,other],0);pick([base,other],250);
 expect(pick([base,other],300,null,'tapped').id).toBeNull();
 expect(pick([base,other],550,null,'tapped').id).toBe('tapped');
 expect(pick([],1000,null,'tapped').id).toBeNull();
 expect(pick([],1000,'fitting','tapped').id).toBe('fitting');
});
