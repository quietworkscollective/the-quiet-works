/** Scene state still has to arrive; software WebGL on CI may take several seconds per frame. */
export const sceneTimeout = (localMs: number): number => process.env.CI ? Math.max(localMs, 120_000) : localMs;
