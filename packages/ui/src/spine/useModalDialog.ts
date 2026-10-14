import { useEffect, useRef } from 'react';

/**
 * Drives a native modal `<dialog>` from `open`, reporting the dialog's own close (Escape, a
 * close button) through `onClose` exactly once and never echoing a close the parent asked for.
 * Same contract as the memo dialog.
 */
export function useModalDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const closedByParent = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) {
      closedByParent.current = true;
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onDialogClose = () => {
      if (closedByParent.current) {
        closedByParent.current = false;
        return;
      }
      onCloseRef.current();
    };
    dialog.addEventListener('close', onDialogClose);
    return () => dialog.removeEventListener('close', onDialogClose);
  }, []);

  return ref;
}
