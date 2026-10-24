import { useEffect, useState, type FormEvent, type MouseEvent } from 'react';
import { api } from '../api';
import type { Capture, Floor, Location } from '../types';

type Props = {
  capture: Capture;
  location: Location;
  floors: Floor[];
  historyCount: number;
  onClose: () => void;
  onSaved: (floorId: Floor['id'], locationId: string) => Promise<void>;
};

export function PlacementDialog({ capture, location, floors, historyCount, onClose, onSaved }: Props) {
  const [point, setPoint] = useState({ floorId: location.floorId, x: location.x, y: location.y, label: location.label });
  const [scope, setScope] = useState<'capture' | 'location'>('capture');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const floor = floors.find((item) => item.id === point.floorId);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [onClose, busy]);

  function place(event: MouseEvent<HTMLDivElement>) {
    if (busy) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setPoint((value) => ({ ...value,
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await api.moveCapture(capture.id, { ...point, scope });
      await onSaved(point.floorId, result.locationId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not move this pin.');
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={() => { if (!busy) onClose(); }}>
      <section className="dialog placement-dialog" role="dialog" aria-modal="true" aria-labelledby="placement-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="dialog-header">
          <div><h2 id="placement-title">Move pin or change floor</h2></div>
          <button className="icon-button" disabled={busy} onClick={onClose} aria-label="Close">×</button>
        </header>
        <form className="capture-form" onSubmit={submit}>
          <fieldset disabled={busy} className="editor-fields">
            <div className="form-row">
              <label><span>Location name</span><input required maxLength={120} value={point.label} onChange={(event) => setPoint({ ...point, label: event.target.value })} /></label>
              <label><span>Floor</span><select value={point.floorId} onChange={(event) => setPoint({ ...point, floorId: event.target.value as Floor['id'] })}>
                {floors.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
              </select></label>
            </div>
            <p className="editor-help">Choose the floor, then click the camera position on the plan. Coordinates are percentages from the top left.</p>
            <div className="placement-preview">
              <div className="plan-canvas" onClick={place}>
                <img src={`/plans/${floor?.planPath}`} alt={`${floor?.name} placement plan`} draggable="false" />
                <span className="placement-pin" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}>●</span>
              </div>
            </div>
            <div className="form-row">
              <label><span>X position (%)</span><input type="number" required min="0" max="100" step="any" value={Number((point.x * 100).toFixed(4))} onChange={(event) => setPoint({ ...point, x: Number(event.target.value) / 100 })} /></label>
              <label><span>Y position (%)</span><input type="number" required min="0" max="100" step="any" value={Number((point.y * 100).toFixed(4))} onChange={(event) => setPoint({ ...point, y: Number(event.target.value) / 100 })} /></label>
            </div>
            {historyCount > 1 && <label><span>Apply this correction to</span><select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}>
              <option value="capture">This capture only</option>
              <option value="location">The whole camera point ({historyCount} captures)</option>
            </select></label>}
            <p className="editor-help">{scope === 'capture' && historyCount > 1 ? 'This capture gets its own corrected pin. Other dates at the original camera point stay in place.' : 'The camera point and its history move together.'}</p>
          </fieldset>
          {error && <p className="form-error" role="alert">{error}</p>}
          <footer className="dialog-actions"><button className="button secondary" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save position'}</button></footer>
        </form>
      </section>
    </div>
  );
}
