import { useEffect, useId, useRef, useSyncExternalStore } from 'react';
import type { OfficeArchive } from '../../engine/src/office/archive.ts';
import { OFFICE_OBJECT_COPY, type OfficeStore } from '../../engine/src/office/objects.ts';
import { useModalDialog } from './spine/useModalDialog.ts';

export function OfficeMemoReader({ store, archive }: { readonly store: OfficeStore; readonly archive: OfficeArchive }) {
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const opened = useSyncExternalStore(archive.subscribe, archive.getState, archive.getState);
  const document = state.activeMemo ? opened[state.activeMemo] : undefined;
  const memo = document?.item;
  const ref = useModalDialog(Boolean(memo), () => store.readMemo(null));
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (memo) headingRef.current?.focus({ preventScroll: true });
  }, [memo]);

  return (
    <dialog ref={ref} className="tqw-memo" aria-labelledby={titleId}>
      {memo ? <article className="tqw-memo__sheet" data-item-id={memo.id} data-item-digest={document?.digest}>
        <header className="tqw-memo__head">
          <h2 id={titleId} ref={headingRef} tabIndex={-1} className="tqw-memo__title">{memo.title}</h2>
          <p className="tqw-memo__from">{memo.from}</p>
          <p className="tqw-memo__note">{memo.label}</p>
          <p className="tqw-memo__provenance">{memo.fields?.['classification']}</p>
        </header>
        <div className="tqw-memo__body">{memo.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
        <footer className="tqw-memo__foot">
          <button type="button" className="tqw-memo__close" onClick={() => ref.current?.close()}>{OFFICE_OBJECT_COPY.close}</button>
        </footer>
      </article> : null}
    </dialog>
  );
}
