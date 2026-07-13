import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { CaptureDialog } from './components/CaptureDialog';
import { ArrowIcon, ClockIcon, LayersIcon, PlusIcon } from './components/Icons';
import { Login } from './components/Login';
import { PanoramaViewer } from './components/PanoramaViewer';
import { captureDates, locationsAtDate } from './timeline';
import type { AppState, Capture, Floor, Location } from './types';

const emptyState: AppState = { floors: [], locations: [], captures: [] };

function formatDate(value: string, includeTime = false) {
  return new Intl.DateTimeFormat('en-BE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(value));
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat('en-BE', { day: '2-digit', month: 'short' }).format(new Date(value));
}

type DialogState =
  | { kind: 'new'; point: { floorId: Floor['id']; x: number; y: number } }
  | { kind: 'update'; location: Location };

export default function App() {
  const [authStatus, setAuthStatus] = useState<'loading' | 'signed-out' | 'signed-in'>('loading');
  const [data, setData] = useState<AppState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedFloor, setSelectedFloor] = useState<Floor['id']>('ground');
  const [selectedDate, setSelectedDate] = useState<string>();
  const [selectedLocationId, setSelectedLocationId] = useState<string>();
  const [placing, setPlacing] = useState(false);
  const [dialog, setDialog] = useState<DialogState>();

  useEffect(() => {
    api.session()
      .then(({ authenticated }) => setAuthStatus(authenticated ? 'signed-in' : 'signed-out'))
      .catch(() => setAuthStatus('signed-out'));
  }, []);

  async function loadState(preferredDate?: string, preferredLocation?: string) {
    setLoading(true);
    try {
      const next = await api.state();
      setData(next);
      const dates = captureDates(next.captures);
      setSelectedDate(preferredDate && dates.includes(preferredDate) ? preferredDate : dates.at(-1));
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

  const dates = useMemo(() => captureDates(data.captures), [data.captures]);
  const dateIndex = selectedDate ? dates.indexOf(selectedDate) : -1;
  const visibleLocations = useMemo(
    () => locationsAtDate(data.locations, data.captures, selectedFloor, selectedDate),
    [data.locations, data.captures, selectedFloor, selectedDate],
  );
  const selectedLocation = data.locations.find((location) => location.id === selectedLocationId);
  const selectedCapture = visibleLocations.find((location) => location.id === selectedLocationId)?.capture;
  const locationHistory = data.captures
    .filter((capture) => capture.locationId === selectedLocationId)
    .sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime());
  const floor = data.floors.find((item) => item.id === selectedFloor);

  if (authStatus === 'loading') return <div className="app-loading"><span className="spinner" />Opening archive…</div>;
  if (authStatus === 'signed-out') return <Login onAuthenticated={() => setAuthStatus('signed-in')} />;

  function changeFloor(floorId: Floor['id']) {
    setSelectedFloor(floorId);
    setSelectedLocationId(undefined);
    setPlacing(false);
  }

  function planClicked(event: React.MouseEvent<HTMLDivElement>) {
    if (!placing) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    setDialog({ kind: 'new', point: { floorId: selectedFloor, x, y } });
    setPlacing(false);
  }

  function selectHistory(capture: Capture) {
    setSelectedDate(capture.capturedAt);
  }

  async function removeCapture(capture: Capture) {
    if (!window.confirm(`Delete “${capture.title}”? This cannot be undone.`)) return;
    await api.deleteCapture(capture.id);
    await loadState(undefined, selectedLocationId);
  }

  return (
    <div className={`app-shell${placing ? ' is-placing' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <div><strong>House Memory</strong><small>Construction archive</small></div>
        </div>
        <div className="topbar-meta">
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
        <button className={`button add-point ${placing ? 'active' : ''}`} onClick={() => setPlacing((value) => !value)}>
          <PlusIcon /> {placing ? 'Cancel placing' : 'Add camera point'}
        </button>
      </nav>

      {error && <div className="global-error">{error}<button onClick={() => loadState()}>Try again</button></div>}
      {placing && <div className="placement-banner"><span>Placement mode</span> Click the precise camera position on the {floor?.name.toLowerCase()} plan.</div>}

      <main className="workspace">
        <section className="plan-panel">
          <header className="panel-heading">
            <div><span className="eyebrow">Current plan</span><h1>{floor?.name ?? 'Floor plan'}</h1></div>
            <span className="capture-count">{visibleLocations.length} {visibleLocations.length === 1 ? 'view' : 'views'} at this date</span>
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
                    onClick={(event) => { event.stopPropagation(); setSelectedLocationId(location.id); }}
                    aria-label={`${location.label}: ${location.capture.title}`}
                  >
                    <i className="direction-cone" />
                    <span>{index + 1}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="plan-legend"><span><i className="legend-dot current" /> Capture available</span><span><i className="legend-dot selected" /> Selected point</span><small>Dots show the latest view available on the selected date.</small></div>
        </section>

        <aside className="inspector">
          <PanoramaViewer capture={selectedCapture} />
          {selectedLocation && selectedCapture ? (
            <div className="capture-details">
              <div className="capture-title-row">
                <div><span className="eyebrow">{selectedLocation.label}</span><h2>{selectedCapture.title}</h2></div>
                <button className="icon-button" onClick={() => setSelectedLocationId(undefined)} aria-label="Close details">×</button>
              </div>
              <p className="capture-date"><ClockIcon /> {formatDate(selectedCapture.capturedAt, true)}</p>
              {selectedCapture.description && <p className="capture-description">{selectedCapture.description}</p>}
              {selectedCapture.tags.length > 0 && <div className="tags">{selectedCapture.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
              <button className="button primary wide" onClick={() => setDialog({ kind: 'update', location: selectedLocation })}><PlusIcon /> Add a newer capture here</button>
              <div className="history">
                <div className="history-heading"><strong>Location history</strong><span>{locationHistory.length} captures</span></div>
                {locationHistory.map((capture) => (
                  <div className={`history-item ${capture.id === selectedCapture.id ? 'active' : ''}`} key={capture.id}>
                    <button onClick={() => selectHistory(capture)}><span>{shortDate(capture.capturedAt)}</span><strong>{capture.title}</strong><ArrowIcon size={16} /></button>
                    <button className="delete-button" onClick={() => removeCapture(capture)} aria-label={`Delete ${capture.title}`}>×</button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="inspector-intro">
              <span className="eyebrow">360° archive</span>
              <h2>{visibleLocations.length ? 'Choose a point on the plan' : 'No views at this time'}</h2>
              <p>{visibleLocations.length ? 'Each dot opens the most recent capture available at that point in the timeline.' : 'Move the timeline forward or add a camera point to start documenting this floor.'}</p>
            </div>
          )}
        </aside>
      </main>

      <footer className="timeline-panel">
        <div className="timeline-label"><ClockIcon /><div><span>Construction timeline</span><strong>{selectedDate ? formatDate(selectedDate) : 'No captures yet'}</strong></div></div>
        <div className="timeline-control">
          <div className="timeline-dates"><span>{dates[0] ? shortDate(dates[0]) : 'Start'}</span><span>{dates.at(-1) ? shortDate(dates.at(-1)!) : 'Today'}</span></div>
          <input
            aria-label="Construction date"
            type="range"
            min="0"
            max={Math.max(0, dates.length - 1)}
            value={Math.max(0, dateIndex)}
            disabled={!dates.length}
            onChange={(event) => { setSelectedDate(dates[Number(event.target.value)]); setSelectedLocationId(undefined); }}
            style={{ '--progress': dates.length > 1 ? `${(Math.max(0, dateIndex) / (dates.length - 1)) * 100}%` : '0%' } as React.CSSProperties}
          />
          <div className="timeline-ticks">{dates.map((date) => <i key={date} title={formatDate(date)} />)}</div>
        </div>
        <div className="timeline-stepper">
          <button disabled={dateIndex <= 0} onClick={() => { setSelectedDate(dates[dateIndex - 1]); setSelectedLocationId(undefined); }}>‹</button>
          <span>{dates.length ? `${dateIndex + 1} / ${dates.length}` : '0 / 0'}</span>
          <button disabled={dateIndex < 0 || dateIndex >= dates.length - 1} onClick={() => { setSelectedDate(dates[dateIndex + 1]); setSelectedLocationId(undefined); }}>›</button>
        </div>
      </footer>

      {dialog && (
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
