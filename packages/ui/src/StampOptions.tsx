
export type ImpressionPosition = 'left' | 'centre' | 'right';
export function StampOptions({ position, pressing, onPosition, onOnce }: {
  position: ImpressionPosition;
  pressing: boolean;
  onPosition(position: ImpressionPosition): void;
  onOnce(): void;
}) {
  return (
    <div className="tqw-stamp-options">
      <label>Impression position
        <select disabled={pressing} value={position} onChange={event => onPosition(event.currentTarget.value as ImpressionPosition)}>
          <option value="left">Left box</option><option value="centre">Centre box</option><option value="right">Right box</option>
        </select>
      </label>
      <button type="button" disabled={pressing} onClick={onOnce}>Stamp once</button>
    </div>
  );
}
