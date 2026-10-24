import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { CameraIcon } from './Icons';
import type { Session } from '../types';

export function Login({ onAuthenticated }: { onAuthenticated: (session: Session) => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = new FormData(event.currentTarget);
      const session = await api.login(String(data.get('password')));
      onAuthenticated(session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not sign in.');
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-mark"><CameraIcon size={30} /></div>
        <span className="eyebrow">Private construction archive</span>
        <h1>House Memory</h1>
        <p>Explore the construction archive with the viewer password, or use the admin password to make changes.</p>
        <form onSubmit={submit}>
          <label>
            <span>Password</span>
            <input name="password" type="password" required autoFocus autoComplete="current-password" />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button primary wide" type="submit" disabled={busy}>{busy ? 'Opening…' : 'Open archive'}</button>
        </form>
      </section>
      <p className="login-footnote">Designed for a private, self-hosted home archive</p>
    </main>
  );
}

