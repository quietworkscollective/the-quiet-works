export type FrameFenceContext = Pick<WebGL2RenderingContext,
  'fenceSync' | 'flush' | 'clientWaitSync' | 'deleteSync' | 'isContextLost' |
  'SYNC_GPU_COMMANDS_COMPLETE' | 'TIMEOUT_EXPIRED' | 'WAIT_FAILED'>;

/** Wait without blocking the main thread or submitting another software-rendered frame. */
export function waitForGpuFrame(context: FrameFenceContext, complete: () => void, failed: () => void): () => void {
  const sync = context.fenceSync(context.SYNC_GPU_COMMANDS_COMPLETE, 0);
  if (!sync) {
    failed();
    return () => undefined;
  }
  let timer = 0;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    window.clearTimeout(timer);
    context.deleteSync(sync);
  };
  const poll = () => {
    if (disposed) return;
    const status = context.clientWaitSync(sync, 0, 0);
    if (context.isContextLost() || status === context.WAIT_FAILED) {
      dispose();
      failed();
    } else if (status === context.TIMEOUT_EXPIRED) {
      timer = window.setTimeout(poll, 16);
    } else {
      dispose();
      complete();
    }
  };
  context.flush();
  timer = window.setTimeout(poll, 0);
  return dispose;
}
