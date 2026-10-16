import { OFFICE_LEGIBILITY } from '@tqw/engine';
import { useId, useSyncExternalStore } from 'react';
import {
  OFFICE_OBJECTS, OFFICE_OBJECT_COPY, OFFICE_FINDINGS, type OfficeArtifactId, type OfficeItemId, type OfficeObjectId, type OfficeStore,
} from '../../engine/src/office/objects.ts';
import type { OfficePlayStep } from '../../engine/src/office/play.ts';
import type { OfficeArchive } from '../../engine/src/office/archive.ts';
import { OfficeFinding } from './OfficeFindings.tsx';
import { OfficeMemoReader } from './OfficeMemoReader.tsx';

export interface OfficeObjectsProps {
  readonly store: OfficeStore;
  readonly archive: OfficeArchive;
  readonly stamps: number;
  readonly overloaded: boolean;
  readonly stillness: boolean;
  readonly playStep?: OfficePlayStep;
  readonly showStampAction?: boolean;
  readonly onFocus?: (id: OfficeObjectId | null) => void;
  readonly onInspect: (id: OfficeObjectId) => void;
  readonly onStampOnce: () => void;
  readonly onExit: (route: 'entrance' | 'side' | 'service') => void;
  readonly onReadCounterMemo: () => void;
  readonly onReadMemo?: (id: OfficeItemId) => void;
}

export function OfficeObjects({ store, archive, stamps, overloaded, stillness, playStep, showStampAction = true, onFocus, onInspect, onStampOnce, onExit, onReadMemo }: OfficeObjectsProps) {
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const opened = useSyncExternalStore(archive.subscribe, archive.getState, archive.getState);
  const selected = OFFICE_OBJECTS.find((object) => object.id === state.response?.id);
  const titleId = useId();
  const memo = selected?.memoId ? opened[selected.memoId]?.item : undefined;
  const keepControl = (artifact: OfficeArtifactId) => opened[artifact] ? (
    <div key={artifact}>
      <button type="button" data-keep-item={artifact} disabled={state.kept.includes(artifact)} onClick={() => store.keep(artifact)}>
        {opened[artifact]?.item.fields?.['action'] ?? 'Keep a copy'}
      </button>
      {state.kept.includes(artifact) ? <p>{OFFICE_OBJECT_COPY.kept}</p> : null}
    </div>
  ) : null;
  const actionFor = (id: OfficeObjectId): string => {
    if (id === 'tiny-stamp' && playStep === 'drawer-open') return 'Mark inspection copy';
    if (id === 'machine' && playStep === 'inspection-recorded') return 'Pull hatch';
    if (id === 'routing-tray') return 'Read routing slip — The Exchange';
    return OFFICE_OBJECTS.find(object => object.id === id)?.action ?? '';
  };

  return (
    <section className="tqw-office-objects" aria-label={OFFICE_OBJECT_COPY.nearby}>
      <details>
        <summary>{OFFICE_OBJECT_COPY.nearby}</summary>
        <ul>{OFFICE_OBJECTS.map((object) => <li key={object.id}>
          <button type="button" onFocus={() => onFocus?.(object.id)} onBlur={() => onFocus?.(null)} onClick={() => onInspect(object.id)}>{object.name}: {object.id === 'side-door' && (overloaded || stillness) ? OFFICE_LEGIBILITY.leave : actionFor(object.id)}</button>
        </li>)}</ul>
      </details>
      {selected && state.response ? <section aria-labelledby={titleId}>
        <h2 id={titleId}>{selected.name}</h2>
        <div role="log" aria-label={OFFICE_OBJECT_COPY.response} aria-live="polite" aria-atomic="true">
          <p>{state.response.text}</p><p>{state.response.caption}</p>
          {(OFFICE_FINDINGS[selected.id] ?? []).filter(id => opened[id]?.item.kind !== 'memo' && id !== 'office-09').map(id =>
            <OfficeFinding key={id} opened={opened[id]} />)}
        </div>
        <button type="button" onClick={() => onInspect(selected.id)}>
          {selected.id === 'side-door' && (overloaded || stillness) ? OFFICE_LEGIBILITY.leave : selected.id === 'tiny-stamp' && playStep === 'drawer-open' ? 'Mark inspection copy' : selected.id === 'machine' && playStep === 'inspection-recorded' ? 'Pull hatch' : selected.id === 'routing-tray' ? 'Read routing slip — The Exchange' : selected.repeatActions?.[state.variants[selected.id]] ?? selected.repeatActions?.[0] ?? selected.action}
        </button>
        {selected.id === 'press' && showStampAction ? <button type="button" onClick={onStampOnce}>{OFFICE_OBJECT_COPY.stamp}</button> : null}
        {selected.id === 'ink-pad' && state.toggles['ink-pad'] ? <button type="button" onClick={() => store.reink()}>{OFFICE_OBJECT_COPY.reink}</button> : null}
        {selected.id === 'window' && state.toggles.window ? <button type="button" onClick={() => store.listen()}>{OFFICE_OBJECT_COPY.listen}</button> : null}
        {memo && selected.memoId ? <button type="button" data-read-item={selected.memoId} onClick={() => { const memoId = selected.memoId; if (memoId) { store.readMemo(memoId); onReadMemo?.(memoId); } }}>{OFFICE_OBJECT_COPY.read} {memo.title}</button> : null}
        {selected.id === 'machine' && stamps >= 2 ? keepControl('office-13') : null}
        {selected.id === 'routing-tray' || (selected.id === 'window' && state.listened) ? keepControl('office-12') : null}
        {selected.id === 'tiny-stamp' ? keepControl('office-17') : null}
      </section> : null}
      {state.listened ? <OfficeFinding opened={opened['office-09']} /> : null}
      {stillness ? <OfficeFinding opened={opened['office-10']} /> : null}
      <nav aria-label={OFFICE_OBJECT_COPY.exits}>
        <button type="button" onClick={() => onExit('entrance')}>{OFFICE_OBJECT_COPY.entrance}</button>
        <button type="button" onClick={() => onExit('side')}>{OFFICE_OBJECT_COPY.side}</button>
        <button type="button" disabled={!overloaded} onClick={() => onExit('service')}>{OFFICE_OBJECT_COPY.service}</button>
        {!overloaded ? <p>{OFFICE_OBJECT_COPY.serviceUnavailable}</p> : null}
      </nav>
      <OfficeMemoReader store={store} archive={archive} />
    </section>
  );
}
