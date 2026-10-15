// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForGpuFrame, type FrameFenceContext } from './gpuFrame.ts';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup() {
  const sync = {} as WebGLSync;
  const context: FrameFenceContext = {
    SYNC_GPU_COMMANDS_COMPLETE: 37143, TIMEOUT_EXPIRED: 37147, WAIT_FAILED: 37149,
    fenceSync: vi.fn(() => sync), flush: vi.fn(), deleteSync: vi.fn(), isContextLost: vi.fn(() => false),
    clientWaitSync: vi.fn().mockReturnValueOnce(37147).mockReturnValue(37146),
  };
  const complete = vi.fn();
  const failed = vi.fn();
  return { context, sync, complete, failed };
}

describe('first GPU frame', () => {
  it('publishes readiness only after the submitted frame finishes, without blocking a poll', () => {
    const { context, sync, complete, failed } = setup();
    waitForGpuFrame(context, complete, failed);
    expect(complete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(complete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(16);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(context.clientWaitSync).toHaveBeenCalledWith(sync, 0, 0);
    expect(context.deleteSync).toHaveBeenCalledTimes(1);
    expect(failed).not.toHaveBeenCalled();
  });

  it('cancels the pending publication and releases its fence on unmount', () => {
    const { context, complete } = setup();
    const dispose = waitForGpuFrame(context, complete, vi.fn());
    dispose();
    vi.advanceTimersByTime(1000);
    expect(complete).not.toHaveBeenCalled();
    expect(context.deleteSync).toHaveBeenCalledTimes(1);
  });
});
