import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { CaptureDialog } from './components/CaptureDialog';
import { PlacementDialog } from './components/PlacementDialog';
import { EditCaptureDialog } from './components/EditCaptureDialog';
import { ArrowIcon, ClockIcon, LayersIcon, PlusIcon } from './components/Icons';
import { Login } from './components/Login';
import { PanoramaViewer } from './components/PanoramaViewer';
import { captureDay, captureDays, captureOnDay, dayToDate, locationsOnDay } from './timeline';
import type { AppState, Capture, Floor, Location, Session } from './types';

const emptyState: AppState = { floors: [], locations: [], captures: [] };

const dayFormat = new Intl.DateTimeFormat('en-BE', { day: '2-digit', month: 'short', year: 'numeric' });
const timestampFormat = new Intl.DateTimeFormat('en-BE', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const shortFormat = new Intl.DateTimeFormat('en-BE', { day: '2-digit', month: 'short' });

const formatDay = (day: string) => dayFormat.format(dayToDate(day));
const shortDay = (day: string) => shortFormat.format(dayToDate(day));
const formatTimestamp = (value: string) => timestampFormat.format(new Date(value));
const historyFormat = new Intl.DateTimeFormat('en-BE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const shortTimestamp = (value: string) => historyFormat.format(new Date(value));

type DialogState =
  | { kind: 'new'; point: { floorId: Floor['id']; x: number; y: number } }
  | { kind: 'update'; location: Location };

export default function App() {
  const [authStatus, setAuthStatus] = useState<'loading' | 'signed-out' | 'signed-in'>('loading');
  const [data, setData] = useState<AppState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedFloor, setSelectedFloor] = useState<Floor['id']>('ground');
  const [selectedDay, setSelectedDay] = useState<string>();
  const [selectedLocationId, setSelectedLocationId] = useState<string>();
  const [selectedCaptureId, setSelectedCaptureId] = useState<string>();
  const [placing, setPlacing] = useState(false);
  const [dialog, setDialog] = useState<DialogState>();
  const [role, setRole] = useState<Session['role']>(null);
  const [editingPosition, setEditingPosition] = useState(false);
  const [editingCapture, setEditingCapture] = useState(false);
  const [adminLogin, setAdminLogin] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [adminBusy, setAdminBusy] = useState(false);
  const isAdmin = role === 'admin';

  function acceptSession(session: Session) {
    setRole(session.role);
    setAuthStatus(session.authenticated ? 'signed-in' : 'signed-out');
  }

  useEffect(() => {
    api.session()
      .then(acceptSession)
      .catch(() => setAuthStatus('signed-out'));
  }, []);

  async function loadState(preferredDate?: string, preferredLocation?: string, preferredCapture?: string) {
    setLoading(true);
    try {
      const next = await api.state();
      setData(next);
      const days = captureDays(next.captures);
      const preferredDay = preferredDate ? captureDay(preferredDate) : undefined;
      const nextDay = preferredDay && days.includes(preferredDay) ? preferredDay : days.at(-1);
      setSelectedDay(nextDay);
      setSelectedCaptureId(preferredCapture);
      if (!preferredDate && !preferredLocation && !locationsOnDay(next.locations, next.captures, selectedFloor, nextDay).length) {
        const available = next.floors.find((item) => locationsOnDay(next.locations, next.captures, item.id, nextDay).length);
        if (available) setSelectedFloor(available.id);
      }
      if (preferredLocation) setSelectedLocationId(preferredLocation);
      setError('');
    } catch (caught) {
      if (caught instanceof Error && caught.message === 'Authentication required.') {
        setAuthStatus('signed-out');
      } else {
        setError(caught instanceof Error ? caught.message : 'Could not load the archive.');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authStatus === 'signed-in') void loadState();
  }, [authStatus]);

  const days = useMemo(() => captureDays(data.captures), [data.captures]);
  const dayIndex = selectedDay ? days.indexOf(selectedDay) : -1;
  const visibleLocations = useMemo(
    () => locationsOnDay(data.locations, data.captures, selectedFloor, selectedDay),
    [data.locations, data.captures, selectedFloor, selectedDay],
  );
  const selectedLocation = data.locations.find((location) => location.id === selectedLocationId);
  const selectedCapture = selectedLocation?.floorId === selectedFloor
    ? captureOnDay(data.captures, selectedLocation.id, selectedDay, selectedCaptureId)
    : undefined;
  const locationHistory = data.captures
    .filter((capture) => capture.locationId === selectedLocationId)
    .sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime());
  const floor = data.floors.find((item) => item.id === selectedFloor);

  if (authStatus === 'loading') return <div className="app-loading"><span className="spinner" />Opening archive…</div>;
  if (authStatus === 'signed-out') return <Login onAuthenticated={acceptSession} />;

  function changeFloor(floorId: Floor['id']) {
    setSelectedFloor(floorId);
    setSelectedLocationId(undefined);
    setSelectedCaptureId(undefined);
    setPlacing(false);
  }

  function planClicked(event: React.MouseEvent<HTMLDivElement>) {
    if (!placing || !isAdmin) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    setDialog({ kind: 'new', point: { floorId: selectedFloor, x, y } });
    setPlacing(false);
  }

  function selectHistory(capture: Capture) {
    setSelectedCaptureId(capture.id);
    setSelectedDay(captureDay(capture.capturedAt));
  }

  async function removeCapture(capture: Capture) {
    if (!window.confirm(`Delete “${capture.title}”? This cannot be undone.`)) return;
    try {
      await api.deleteCapture(capture.id);
      await loadState(undefined, selectedLocationId);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not delete capture.'); }
  }

  return (
    <div className={`app-shell${placing ? ' is-placing' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <div><strong>House Memory</strong><small>Construction archive</small></div>
        </div>
        <div className="topbar-meta">
          <span className={`access-badge ${isAdmin ? 'admin' : ''}`}>{isAdmin ? 'Admin' : 'View only'}</span>
          {!isAdmin && <button className="text-button" onClick={() => { setAdminLogin(true); setAdminError(''); }}>Admin sign in</button>}
          <button className="text-button" onClick={async () => { await api.logout(); setAuthStatus('signed-out'); }}>Lock</button>
        </div>
      </header>

      <nav className="floor-nav" aria-label="Floors">
        <span className="floor-nav-label"><LayersIcon /> Floors</span>
        <div className="floor-tabs">
          {data.floors.map((item) => (
            <button key={item.id} className={selectedFloor === item.id ? 'active' : ''} onClick={() => changeFloor(item.id)}>
              <span>{String(item.sortOrder).padStart(2, '0')}</span>{item.name}
            </button>
          ))}
        </div>
        {isAdmin && <button className={`button add-point ${placing ? 'active' : ''}`} onClick={() => setPlacing((value) => !value)}>
          <PlusIcon /> {placing ? 'Cancel placing' : 'Add camera point'}
        </button>}
      </nav>

      {error && <div className="global-error">{error}<button onClick={() => loadState()}>Try again</button></div>}
      {placing && <div className="placement-banner"><span>Placement mode</span> Click the precise camera position on the {floor?.name.toLowerCase()} plan.</div>}

      <main className="workspace">
        <section className="plan-panel">
          <header className="panel-heading">
            <div><span className="eyebrow">Current plan</span><h1>{floor?.name ?? 'Floor plan'}</h1></div>
            <span className="capture-count">{visibleLocations.length} {visibleLocations.length === 1 ? 'view' : 'views'} on this day</span>
          </header>
          <div className={`plan-frame ${placing ? 'placing' : ''}`}>
            {loading && <div className="plan-loading"><span className="spinner" /></div>}
            {floor && (
              <div className="plan-canvas" onClick={planClicked}>
                <img src={`/plans/${floor.planPath}`} alt={`${floor.name} architectural plan`} draggable="false" />
                {visibleLocations.map((location, index) => (
                  <button
                    key={location.id}
                    className={`map-marker ${selectedLocationId === location.id ? 'selected' : ''}`}
                    style={{ left: `${location.x * 100}%`, top: `${location.y * 100}%`, '--yaw': `${location.capture.initialYaw}deg` } as React.CSSProperties}
                    onClick={(event) => { event.stopPropagation(); setSelectedCaptureId(undefined); setSelectedLocationId(location.id); }}
                    aria-label={`${location.label}: ${location.capture.title}`}
                  >
                    <i className="direction-cone" />
                    <span>{index + 1}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="plan-legend"><span><i className="legend-dot current" /> Capture available</span><span><i className="legend-dot selected" /> Selected point</span><small>Dots show captures made on the selected day.</small></div>
        </section>

        <aside className="inspector">
          <PanoramaViewer capture={selectedCapture} />
          {selectedLocation && selectedCapture ? (
            <div className="capture-details">
              <div className="capture-title-row">
                <div><span className="eyebrow">{selectedLocation.label}</span><h2>{selectedCapture.title}</h2></div>
                <button className="icon-button" onClick={() => setSelectedLocationId(undefined)} aria-label="Close details">×</button>
              </div>
              <p className="capture-date"><ClockIcon /> {formatTimestamp(selectedCapture.capturedAt)}</p>
              {selectedCapture.description && <p className="capture-description">{selectedCapture.description}</p>}
              {selectedCapture.tags.length > 0 && <div className="tags">{selectedCapture.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
              {isAdmin && <div className="admin-actions">
                <button className="button primary wide" onClick={() => setDialog({ kind: 'update', location: selectedLocation })}><PlusIcon /> Add a newer capture here</button>
                <button className="button secondary" onClick={() => setEditingPosition(true)}>Move pin / floor</button>
                <button className="button secondary" onClick={() => setEditingCapture(true)}>Edit capture / notes</button>
              </div>}
              <div className="history">
                <div className="history-heading"><strong>Location history</strong><span>{locationHistory.length} captures</span></div>
                {locationHistory.map((capture) => (
                  <div className={`history-item ${capture.id === selectedCapture.id ? 'active' : ''}`} key={capture.id}>
                    <button onClick={() => selectHistory(capture)}><span>{shortTimestamp(capture.capturedAt)}</span><strong>{capture.title}</strong><ArrowIcon size={16} /></button>
                    {isAdmin && <button className="delete-button" onClick={() => removeCapture(capture)} aria-label={`Delete ${capture.title}`}>×</button>}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="inspector-intro">
              <span className="eyebrow">360° archive</span>
              <h2>{visibleLocations.length ? 'Choose a point on the plan' : 'No views at this time'}</h2>
              <p>{visibleLocations.length ? 'Each dot opens a capture from the selected day at that camera point.' : isAdmin ? 'Choose another day or add a camera point to document this floor.' : 'Choose another day to explore the archive.'}</p>
            </div>
          )}
        </aside>
      </main>

      <footer className="timeline-panel">
        <div className="timeline-label"><ClockIcon /><div><span>Construction timeline</span><strong>{selectedDay ? formatDay(selectedDay) : 'No captures yet'}</strong></div></div>
        <div className="timeline-control">
          <div className="timeline-dates"><span>{days[0] ? shortDay(days[0]) : 'Start'}</span><span>{days.at(-1) ? shortDay(days.at(-1)!) : 'Today'}</span></div>
          <input
            aria-label="Construction day"
            type="range"
            min="0"
            max={Math.max(0, days.length - 1)}
            value={Math.max(0, dayIndex)}
            disabled={!days.length}
            onChange={(event) => { setSelectedDay(days[Number(event.target.value)]); setSelectedLocationId(undefined); }}
            style={{ '--progress': days.length > 1 ? `${(Math.max(0, dayIndex) / (days.length - 1)) * 100}%` : '0%' } as React.CSSProperties}
          />
          <div className="timeline-ticks">{days.map((day) => <i key={day} title={formatDay(day)} />)}</div>
        </div>
        <div className="timeline-stepper">
          <button disabled={dayIndex <= 0} onClick={() => { setSelectedDay(days[dayIndex - 1]); setSelectedLocationId(undefined); }}>‹</button>
          <span>{days.length ? `${dayIndex + 1} / ${days.length}` : '0 / 0'}</span>
          <button disabled={dayIndex < 0 || dayIndex >= days.length - 1} onClick={() => { setSelectedDay(days[dayIndex + 1]); setSelectedLocationId(undefined); }}>›</button>
        </div>
      </footer>

      {adminLogin && <div className="dialog-backdrop" onMouseDown={() => { if (!adminBusy) setAdminLogin(false); }}>
        <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="admin-title" onMouseDown={(event) => event.stopPropagation()}>
          <header className="dialog-header"><div><span className="eyebrow">House Memory</span><h2 id="admin-title">Admin sign in</h2></div><button className="icon-button" disabled={adminBusy} onClick={() => setAdminLogin(false)} aria-label="Close">×</button></header>
          <form className="capture-form" onSubmit={async (event) => {
            event.preventDefault(); setAdminBusy(true); setAdminError('');
            const password = String(new FormData(event.currentTarget).get('password'));
            try {
              const session = await api.login(password);
              acceptSession(session);
              if (session.role !== 'admin') { setAdminError('That password provides view-only access. Enter the admin password.'); return; }
              setAdminLogin(false);
            } catch (caught) { setAdminError(caught instanceof Error ? caught.message : 'Could not sign in.'); }
            finally { setAdminBusy(false); }
          }}>
            <label><span>Admin password</span><input name="password" type="password" required autoFocus autoComplete="current-password" /></label>
            {adminError && <p className="form-error" role="alert">{adminError}</p>}
            <footer className="dialog-actions"><button type="button" className="button secondary" disabled={adminBusy} onClick={() => setAdminLogin(false)}>Cancel</button><button className="button primary" disabled={adminBusy}>{adminBusy ? 'Signing in…' : 'Sign in as admin'}</button></footer>
          </form>
        </section>
      </div>}
      {isAdmin && editingPosition && selectedCapture && selectedLocation && <PlacementDialog
        capture={selectedCapture} location={selectedLocation} floors={data.floors} historyCount={locationHistory.length}
        onClose={() => setEditingPosition(false)}
        onSaved={async (floorId, locationId) => { setEditingPosition(false); setSelectedFloor(floorId); await loadState(selectedCapture.capturedAt, locationId, selectedCapture.id); }}
      />}
      {isAdmin && editingCapture && selectedCapture && <EditCaptureDialog capture={selectedCapture}
        onClose={() => setEditingCapture(false)}
        onSaved={async (capture) => { setEditingCapture(false); await loadState(capture.capturedAt, capture.locationId, capture.id); }}
      />}
      {isAdmin && dialog && (
        <CaptureDialog
          point={dialog.kind === 'new' ? dialog.point : undefined}
          location={dialog.kind === 'update' ? dialog.location : undefined}
          onClose={() => setDialog(undefined)}
          onSaved={async (capturedAt, locationId) => { setDialog(undefined); await loadState(capturedAt, locationId); }}
        />
      )}
    </div>
  );
}

