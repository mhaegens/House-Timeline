import { useEffect, useState, type FormEvent } from 'react';
import type { Location } from '../types';
import { api } from '../api';
import { CameraIcon } from './Icons';

type NewPoint = { floorId: Location['floorId']; x: number; y: number };

type Props = {
  point?: NewPoint;
  location?: Location;
  onClose: () => void;
  onSaved: (capturedAt: string, locationId: string) => Promise<void>;
};

function localDateTimeValue() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

export function CaptureDialog({ point, location, onClose, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    let createdLocation: Location | undefined;
    try {
      const data = new FormData(event.currentTarget);
      const capturedAt = new Date(String(data.get('capturedAt'))).toISOString();
      let locationId = location?.id;

      if (!locationId && point) {
        createdLocation = await api.createLocation({
          ...point,
          label: String(data.get('locationLabel')),
        });
        locationId = createdLocation.id;
      }
      if (!locationId) throw new Error('A camera location is required.');

      data.delete('locationLabel');
      data.set('capturedAt', capturedAt);
      await api.addCapture(locationId, data);
      await onSaved(capturedAt, locationId);
    } catch (caught) {
      if (createdLocation) await api.deleteLocation(createdLocation.id).catch(() => undefined);
      setError(caught instanceof Error ? caught.message : 'Could not save this capture.');
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="capture-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="dialog-header">
          <div>
            <h2 id="capture-title">Record a construction view</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close">×</button>
        </header>

        <form onSubmit={submit} className="capture-form">
          {!location && (
            <label>
              <span>Location name</span>
              <input name="locationLabel" required maxLength={120} placeholder="e.g. Living room · garden side" autoFocus />
            </label>
          )}
          <div className="form-row">
            <label>
              <span>Capture title</span>
              <input name="title" required maxLength={160} placeholder="e.g. Heating pipes before screed" autoFocus={Boolean(location)} />
            </label>
            <label>
              <span>Date and time</span>
              <input name="capturedAt" type="datetime-local" required defaultValue={localDateTimeValue()} />
            </label>
          </div>
          <label>
            <span>Description</span>
            <textarea name="description" rows={3} maxLength={4000} placeholder="What should you remember about this view?" />
          </label>
          <div className="form-row compact">
            <label>
              <span>Tags <small>comma separated</small></span>
              <input name="tags" maxLength={500} placeholder="plumbing, underfloor heating" />
            </label>
            <label>
              <span>Initial direction <small>0–359°</small></span>
              <input name="initialYaw" type="number" min="0" max="359.999" step="0.1" defaultValue="0" />
            </label>
          </div>
          <label className="file-drop">
            <input
              name="panorama"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => setFileName(event.target.files?.[0]?.name ?? '')}
            />
            <CameraIcon size={23} />
            <span><strong>{fileName || 'Add a stitched panorama'}</strong><small>Optional for now · JPEG, PNG, or WebP · up to 120 MB</small></span>
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <footer className="dialog-actions">
            <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
            <button className="button primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save capture'}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}

