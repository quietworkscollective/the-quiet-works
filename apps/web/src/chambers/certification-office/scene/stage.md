# Office stage adapter

The inward axis is +z (yaw 180°); the visible half-arc is 90°. The floor polygon is the standing-clearance rectangle in `OFFICE_STAGE`, with the installed desk, machine and records footprints excluded by `ROOM_BOUNDS`. All assisted routes use the same bounds.

The shared controller at this base has no Stage parameter. `stage.ts` supplies the lens-derived yaw limit and the last 20° of turn easing; `navigation.ts` applies it to held turns, direct look and authored stations. Walking, pitch and travel timing remain the shared controller's. `OfficeCamera` supplies the current lens on resize. This adapter can retire when the shared Stage contract lands.

Side pillars frame the limits. The entrance wall is omitted, the side exit is within the forward stage, and the archive has a distant end wall. Verification sweeps the walkable half-metre grid at both yaw limits and centre, at pitch -25°, 0° and +25°, on desktop and portrait lenses.
