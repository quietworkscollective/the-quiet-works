import type { OpenedOfficeItem } from '../../engine/src/office/archive.ts';

/** Content reaches every presentation only after the visit archive has opened it. */
export function OfficeFinding({ opened }: { readonly opened: OpenedOfficeItem | undefined }) {
  if (!opened) return null;
  const { item, digest } = opened;
  return <div className="tqw-office-finding" data-item-id={item.id} data-item-digest={digest}>
    {item.label ? <p>{item.label}</p> : null}
    {item.body.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
  </div>;
}
