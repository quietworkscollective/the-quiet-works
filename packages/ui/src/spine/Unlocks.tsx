import { useEffect, useId, useRef, useState } from 'react';
import { ARCHIVE_COPY } from '@tqw/engine';
import type { UnlocksProps } from './types.ts';
import { useDiscoveries } from './useDiscoveries.ts';
import { useModalDialog } from './useModalDialog.ts';

const EXPORT_FILE = 'unheld-discoveries.json';

function readText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/** Hands the visitor a copy of their archive as a small file. Nothing leaves the device. */
function saveFile(text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = EXPORT_FILE;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * The archive (ADR 0003): only what this visitor's own device has opened, to read again. A cabinet
 * made of spacing, grouping and paper proportions, not another bulletin board. Rooms appear only
 * when they hold a finding; unfound items, counts and totals have no place in the archive.
 *
 * Below, the only controls: export, import, and forget everything (behind a confirmation that says
 * what it does and offers the export first).
 */
export function Unlocks({ store, chambers, describe, onReread, onReplaced }: UnlocksProps) {
  const state = useDiscoveries(store);
  const titleId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [message, setMessage] = useState('');
  const [confirming, setConfirming] = useState(false);
  const confirmRef = useModalDialog(confirming, () => setConfirming(false));
  // Whatever is found after the page loaded gets the short reveal; what was already here does not.
  const [alreadyThere] = useState(() => new Set(Object.entries(state.found).flatMap(([room, list]) => (list ?? []).map((f) => `${room}/${f.id}`))));

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  const rooms = chambers.flatMap((chamber) => {
    if (chamber.status !== 'open') return [];
    const findings = state.found[chamber.id] ?? [];
    return findings.length > 0 ? [{ chamber, findings }] : [];
  });

  const exportArchive = () => {
    saveFile(store.exportText());
    setMessage(ARCHIVE_COPY.exported);
  };

  const importArchive = (file: File | undefined) => {
    if (!file) return;
    readText(file).then(
      (text) => {
        const ok = store.importText(text);
        setMessage(ok ? ARCHIVE_COPY.imported : ARCHIVE_COPY.importFailed);
        if (ok) onReplaced?.();
      },
      () => setMessage(ARCHIVE_COPY.importFailed),
    );
  };

  const forget = () => {
    store.forget();
    setConfirming(false);
    setMessage(ARCHIVE_COPY.forgotten);
    onReplaced?.();
  };

  return (
    <section id="archive" className="tqw-archive" aria-labelledby={titleId}>
      <div className="tqw-archive__inner">
        <header className="tqw-archive__head">
          <h2 id={titleId} className="tqw-archive__title">
            {ARCHIVE_COPY.title}
          </h2>
          <p className="tqw-archive__intro">{ARCHIVE_COPY.intro}</p>
        </header>

        {rooms.map(({ chamber: room, findings }) => {
          return (
            <section key={room.id} className="tqw-archive__room" aria-labelledby={`${titleId}-${room.id}`} data-room={room.id}>
              <h3 id={`${titleId}-${room.id}`} className="tqw-archive__room-title">{room.title}</h3>
              <ul className="tqw-archive__items">
                {findings.map((finding) => {
                  const info = describe?.(room.id, finding) ?? null;
                  const title = finding.title ?? info?.title ?? ARCHIVE_COPY.kinds[finding.kind];
                  return (
                    <li
                      key={finding.id}
                      className="tqw-paper"
                      data-state="found"
                      data-kind={finding.kind}
                      data-new={alreadyThere.has(`${room.id}/${finding.id}`) ? undefined : 'true'}
                    >
                      <h4 className="tqw-paper__title">{title}</h4>
                      {info?.fragment ? <p className="tqw-paper__fragment">{info.fragment}</p> : null}
                      {onReread ? (
                        <button
                          type="button"
                          className="tqw-paper__reread"
                          aria-label={`${ARCHIVE_COPY.reread}: ${title}`}
                          onClick={() => onReread(room.id, finding)}
                        >
                          {ARCHIVE_COPY.reread}
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

        <div className="tqw-archive__utility">
          <p className="tqw-archive__device">{ARCHIVE_COPY.deviceOnly}</p>
          <div className="tqw-archive__actions">
            <button type="button" className="tqw-archive__action" onClick={exportArchive}>
              {ARCHIVE_COPY.export}
            </button>
            <button type="button" className="tqw-archive__action" onClick={() => fileInput.current?.click()}>
              {ARCHIVE_COPY.import}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="tqw-visually-hidden"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                importArchive(event.currentTarget.files?.[0]);
                event.currentTarget.value = '';
              }}
            />
          </div>
          <div className="tqw-archive__forget">
            <button type="button" className="tqw-archive__forget-button" onClick={() => setConfirming(true)}>
              {ARCHIVE_COPY.forget}
            </button>
          </div>
          {/* A live region without the status role: it is announced the same, and a page has one status role per live readout. */}
          <p className="tqw-archive__message" aria-live="polite">
            {message}
          </p>
        </div>
      </div>

      <dialog ref={confirmRef} className="tqw-forget" aria-labelledby={`${titleId}-forget`}>
        <div className="tqw-forget__sheet">
          <h2 id={`${titleId}-forget`} className="tqw-forget__title">
            {ARCHIVE_COPY.forgetTitle}
          </h2>
          <p className="tqw-forget__body">{ARCHIVE_COPY.forgetBody}</p>
          <div className="tqw-forget__actions">
            <button type="button" className="tqw-forget__button" onClick={exportArchive}>
              {ARCHIVE_COPY.forgetExport}
            </button>
            <button ref={cancelRef} type="button" className="tqw-forget__button" onClick={() => setConfirming(false)}>
              {ARCHIVE_COPY.forgetCancel}
            </button>
            <button type="button" className="tqw-forget__button tqw-forget__button--confirm" onClick={forget}>
              {ARCHIVE_COPY.forgetConfirm}
            </button>
          </div>
        </div>
      </dialog>
    </section>
  );
}
