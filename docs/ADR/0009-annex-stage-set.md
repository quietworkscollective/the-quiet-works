# ADR 0009 — The Exchange Annex stage set

- **Status:** proposed; maintainers should review before release.
- **Relates to:** ADR 0002 (sealed content), ADR 0004 (Annex and door kit), ADR 0005 (room kit),
  ADR 0006 (renderer and asset pipeline), ADR 0007 (stage sets), and ADR 0008 (baked light).

## Decision

The first Annex room is registered as `exchange` at `/the-exchange`, in corridor bay six. Its door
uses the shared `DoorSpec` and `DoorCharacter` contracts; the room becomes enterable only after the
room reports its first ready frame. An enamel Annex sign sits above the door.

The authored stage measures 4.2 m wide, 9 m deep and 12.6 m high. Architecture, furniture and
interactive props come from committed Blender source under `scripts/blender/rooms/exchange/` and ship
as one lazy, quantised WebP glTF. The room uses the existing baked-light runner with a separate
switchboard/upper-gallery atlas and desk/threshold atlas. No runtime fetch or decoder is introduced.

There is no shared `Stage` runtime contract on the integration branch. The room therefore keeps its
station, walkable-area, horizontal-FOV yaw limit and edge easing in a small adapter under
`apps/web/src/chambers/exchange/stage.ts`. It declares a forward half-arc no wider than 90 degrees;
the yaw limit is recalculated from the active canvas field of view. Its keyboard, screen-reader and
text-mode controls use the same state-machine events as the 3D actions.

Discoverable text stays in the private content source and enters the public repository only as
ciphertext produced by the sealing tool. The room's progress remains local to the current visit, and
every audio cue has a caption. It adds no account, network service, visitor text collection or remote
executable content.

## Review gates

- Confirm stage composition, door placement and the four station views on desktop and Pixel 7.
- Measure draw calls, triangles, lights, lazy model bytes and baked atlas bytes in the richest view.
- Verify that every stage edge remains framed throughout the yaw and pitch sweep.
- Confirm that every discovery uses the private sealed source and its state-machine token.
- Approve this implementation before public release.
