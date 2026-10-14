# Office runtime

The chamber keeps apparatus, inspection and opened-content state for the page visit. Replaying
resets the apparatus; it preserves discovered documents and explicit copies. All departures use
the chamber host's `onLeave`. The chamber makes no requests and writes no persistent storage.

`scene/navigation.ts` supplies ground, start pose and stations to the shared first-person
controller. Movement uses its default tuning. Authored station travel follows the command clock
through shader preparation; free movement retains the shared hitch cap. Movement and Step back
release desk framing. `scene/OfficeCamera.tsx` owns the shared bindings, pose adapter and reduced
motion dissolve. Its stamp target is the actual handle projection and is empty outside the view.

A distant pointer or touch click approaches the press; operating within reach holds and releases
it. The DOM stamp action approaches and operates in the same action from anywhere. Reduced
motion uses stationary cuts with the shared outgoing-frame dissolve. Inspection scrolling stays
with the DOM; it does not walk the camera. A held press lifts once on blur, loss of visibility or
loss of the 3D context.

The inspection state machine produces opaque discovery tokens. The visit archive passes those
tokens to `openSealed`, coalesces pending derivations, and retains opened items for the visit.
Scene inscriptions, DOM inspection and document readers all consume that archive. Decryption
never opens a reader automatically. The original core memo remains public.

Private content is maintained outside this tree and sealed with `pnpm seal`. Public discovery
tests compare `digestItem` with the committed digest, without storing the content in fixtures.
Run the workspace gates and browser suite after changing this chamber; camera and archive guards
also live alongside their implementations.
