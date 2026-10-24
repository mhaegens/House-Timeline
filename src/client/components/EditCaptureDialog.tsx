import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import type { Capture } from '../types';

export function EditCaptureDialog({ capture, onClose, onSaved }: {
  capture: Capture; onClose: () => void; onSaved: (capture: Capture) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const date = new Date(capture.capturedAt);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [onClose, busy]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      const updated = await api.updateCapture(capture.id, {
        title: String(form.get('title')), description: String(form.get('description')),
        capturedAt: new Date(String(form.get('capturedAt'))).toISOString(),
        initialYaw: Number(form.get('initialYaw')),
        tags: String(form.get('tags')).split(',').map((value) => value.trim()).filter(Boolean),
      });
      await onSaved(updated);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save changes.'); setBusy(false); }
  }
  return <div className="dialog-backdrop" onMouseDown={() => { if (!busy) onClose(); }}>
    <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="edit-title" onMouseDown={(event) => event.stopPropagation()}>
      <header className="dialog-header"><div><h2 id="edit-title">Edit capture and notes</h2></div><button className="icon-button" onClick={onClose} disabled={busy} aria-label="Close">×</button></header>
      <form className="capture-form" onSubmit={submit}>
        <fieldset className="editor-fields" disabled={busy}>
          <label><span>Capture title</span><input name="title" required maxLength={160} defaultValue={capture.title} autoFocus /></label>
          <label><span>Date and time</span><input name="capturedAt" type="datetime-local" step="1" required defaultValue={date.toISOString().slice(0, 19)} /></label>
          <label><span>Description / notes</span><textarea name="description" rows={4} maxLength={4000} defaultValue={capture.description} /></label>
          <div className="form-row"><label><span>Tags (comma separated)</span><input name="tags" maxLength={500} defaultValue={capture.tags.join(', ')} /></label><label><span>Initial direction (0–359°)</span><input name="initialYaw" type="number" min="0" max="359.999" step="0.1" defaultValue={capture.initialYaw} /></label></div>
        </fieldset>
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer className="dialog-actions"><button className="button secondary" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></footer>
      </form>
    </section>
  </div>;
}
