import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { CaptureDialog } from './components/CaptureDialog';
import { PlacementDialog } from './components/PlacementDialog';
import { EditCaptureDialog } from './components/EditCaptureDialog';
import { ArrowIcon, ClockIcon, LayersIcon, PlusIcon, CameraIcon, MapIcon, InfoIcon, ExpandIcon, FocusIcon } from './components/Icons';
import { Login } from './components/Login';
import { PanoramaViewer, type PanoramaHandle, type PanoramaStatus } from './components/PanoramaViewer';
import { TimelapseControls } from './components/TimelapseControls';
import { timelapseFrames, type TimelapseFrame } from './timelapse';
import { captureDay, captureDays, captureOnDay, dayToDate, locationsOnDay } from './timeline';
import { dayPosition, nearestDay, nearestPoint } from './navigation';
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
  const [mapOpen, setMapOpen] = useState(true);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [cameraFocus, setCameraFocus] = useState(false);
  const anchor = useRef<Location | null>(null);
  const panorama = useRef<PanoramaHandle>(null);
  const [timelapse, setTimelapse] = useState<{ location: Location; reference: Capture }>();
  const [playing, setPlaying] = useState(false);
  const [includeNearby, setIncludeNearby] = useState(true);
  const [pace, setPace] = useState(3500);
  const [readyCapture, setReadyCapture] = useState<string>();
  const [savingDirection, setSavingDirection] = useState(false);
  const [directionMessage, setDirectionMessage] = useState('');

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
      if (preferredLocation) {
        setSelectedLocationId(preferredLocation);
        anchor.current = next.locations.find((location) => location.id === preferredLocation) ?? null;
      }
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

  // Pick up direction corrections made in the admin tool without resetting the current visit.
  useEffect(() => {
    if (authStatus !== 'signed-in') return;
    let active = true;
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      void api.state().then((next) => { if (active) setData(next); }).catch(() => {});
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [authStatus]);

  const days = useMemo(() => captureDays(data.captures), [data.captures]);
  const frames = useMemo(() => timelapse
    ? timelapseFrames(data.captures, data.locations, timelapse.location, timelapse.reference, includeNearby)
    : [], [data.captures, data.locations, timelapse, includeNearby]);
  const timelineDays = timelapse ? frames.map(frame => frame.day) : days;
  const dayIndex = selectedDay ? timelineDays.indexOf(selectedDay) : -1;
  const visibleLocations = useMemo(
    () => locationsOnDay(data.locations, data.captures, selectedFloor, selectedDay),
    [data.locations, data.captures, selectedFloor, selectedDay],
  );
  const selectedLocation = visibleLocations.find((location) => location.id === selectedLocationId)
    ?? nearestPoint(visibleLocations, anchor.current?.floorId === selectedFloor ? anchor.current : null);
  useEffect(() => {
    if (selectedLocation && (!anchor.current || anchor.current.floorId !== selectedFloor)) anchor.current = selectedLocation;
  }, [selectedLocation, selectedFloor]);
  const selectedCapture = selectedLocation?.floorId === selectedFloor
    ? captureOnDay(data.captures, selectedLocation.id, selectedDay, selectedCaptureId)
    : undefined;
  const locationHistory = data.captures
    .filter((capture) => capture.locationId === selectedLocation?.id)
    .sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime());
  const floor = data.floors.find((item) => item.id === selectedFloor);

  const frameIndex = frames.findIndex(frame => frame.capture.id === selectedCapture?.id);

  useEffect(() => { setDirectionMessage(''); }, [selectedCapture?.id]);

  function showFrame(frame: TimelapseFrame) {
    setSelectedDay(frame.day);
    setSelectedLocationId(frame.location.id);
    setSelectedCaptureId(frame.capture.id);
  }

  useEffect(() => {
    if (!playing || !timelapse || readyCapture !== selectedCapture?.id) return;
    if (frameIndex < 0 || frameIndex >= frames.length - 1) { setPlaying(false); return; }
    const timer = window.setTimeout(() => showFrame(frames[frameIndex + 1]), pace);
    return () => window.clearTimeout(timer);
  }, [playing, timelapse, readyCapture, selectedCapture?.id, frameIndex, frames, pace]);

  useEffect(() => {
    const pause = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', pause);
    return () => document.removeEventListener('visibilitychange', pause);
  }, []);

  useEffect(() => {
    if (editingPosition || editingCapture || dialog || adminLogin) setPlaying(false);
  }, [editingPosition, editingCapture, dialog, adminLogin]);

  function photoStatus(status: PanoramaStatus, id: string) {
    setReadyCapture(status === 'ready' ? id : undefined);
    if (status === 'error') setPlaying(false);
  }

  function closeTimelapse() { setPlaying(false); setTimelapse(undefined); }

  function startTimelapse() {
    if (!selectedLocation || !selectedCapture) return;
    const sequence = timelapseFrames(data.captures, data.locations, selectedLocation, selectedCapture);
    anchor.current = selectedLocation;
    setTimelapse({ location: selectedLocation, reference: selectedCapture });
    setIncludeNearby(true);
    setPlaying(sequence.length > 1);
    setDetailsOpen(false);
    setMapExpanded(false);
    if (sequence[0]) showFrame(sequence[0]);
  }

  function playTimelapse() {
    if (playing) { setPlaying(false); return; }
    if (frameIndex >= frames.length - 1 || frameIndex < 0) { if (frames[0]) showFrame(frames[0]); }
    setPlaying(true);
  }

  function changeNearby(value: boolean) {
    setPlaying(false);
    setIncludeNearby(value);
    if (!timelapse) return;
    const sequence = timelapseFrames(data.captures, data.locations, timelapse.location, timelapse.reference, value);
    const nearest = nearestDay(sequence.map(frame => frame.day), selectedDay ? dayPosition(selectedDay) : 0);
    const frame = sequence.find(frame => frame.day === nearest);
    if (frame) showFrame(frame);
  }

  async function saveDirection() {
    const yaw = panorama.current?.getYaw();
    if (!selectedCapture || yaw === undefined) return;
    setPlaying(false);
    setSavingDirection(true);
    setDirectionMessage('');
    try {
      const updated = await api.updateCapture(selectedCapture.id, { initialYaw: Math.round(yaw * 10) / 10 % 360 });
      setData(previous => ({ ...previous, captures: previous.captures.map(capture => capture.id === updated.id ? updated : capture) }));
      setDirectionMessage('Starting view saved.');
    } catch (caught) { setDirectionMessage(caught instanceof Error ? caught.message : 'Could not save direction.'); }
    finally { setSavingDirection(false); }
  }

  if (authStatus === 'loading') return <div className="app-loading"><span className="spinner" />Opening archive…</div>;
  if (authStatus === 'signed-out') return <Login onAuthenticated={acceptSession} />;

  function chooseDay(day: string | undefined) {
    if (!day) return;
    setPlaying(false);
    if (timelapse) {
      const frame = frames.find(frame => frame.day === day);
      if (frame) showFrame(frame);
      return;
    }
    setSelectedDay(day);
    setSelectedCaptureId(undefined);
    setSelectedLocationId(undefined);
  }

  function choosePoint(location: Location) {
    closeTimelapse();
    setDirectionMessage('');
    anchor.current = location;
    setSelectedLocationId(location.id);
    setSelectedCaptureId(undefined);
  }

  function changeFloor(floorId: Floor['id']) {
    closeTimelapse();
    anchor.current = null;
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
    closeTimelapse();
    const location = data.locations.find((point) => point.id === capture.locationId);
    if (location) { anchor.current = location; setSelectedLocationId(location.id); }
    setSelectedCaptureId(capture.id);
    setSelectedDay(captureDay(capture.capturedAt));
  }

  async function removeCapture(capture: Capture) {
    if (!window.confirm(`Delete “${capture.title}”? This cannot be undone.`)) return;
    try {
      await api.deleteCapture(capture.id);
      await loadState(undefined, selectedLocation?.id);
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

      <main className={`workspace camera-workspace${timelapse ? ' has-timelapse' : ''}${cameraFocus ? ' camera-focus' : ''}`}>
        <section className="camera-stage" aria-label="360 degree camera view">
          <PanoramaViewer ref={panorama} capture={selectedCapture} viewKey={anchor.current?.id ?? selectedLocation?.id ?? selectedFloor} onStatus={photoStatus} />
        </section>

        <div className="scene-heading">
          <span className="scene-kicker"><i /> HOUSE / CONSTRUCTION ARCHIVE</span>
          <h1>{selectedLocation?.label ?? floor?.name ?? 'Explore the house'}</h1>
          <p>{selectedCapture ? <>{selectedCapture.title}<span> · {formatTimestamp(selectedCapture.capturedAt)}</span></> : 'No captures on this floor for this date. Choose another floor or date.'}</p>
        </div>

        <nav className="scene-dock" aria-label="View controls">
          <button aria-label="Floor map" aria-pressed={mapOpen && !cameraFocus && !detailsOpen} onClick={() => { setMapOpen(detailsOpen || !mapOpen || cameraFocus); setDetailsOpen(false); setCameraFocus(false); }}><MapIcon /><span>Map</span></button>
          <button aria-label="Capture details" aria-pressed={detailsOpen && !cameraFocus} onClick={() => { setDetailsOpen(!detailsOpen || cameraFocus); setCameraFocus(false); setMapExpanded(false); }}><InfoIcon /><span>Details</span></button>
          <button aria-label={timelapse ? 'Stop timelapse' : 'Start timelapse'} aria-pressed={Boolean(timelapse)} disabled={!selectedCapture?.panoramaPath} onClick={() => timelapse ? closeTimelapse() : startTimelapse()}><ClockIcon size={20} /><span>Timelapse</span></button>
          <span className="dock-divider" />
          <button aria-label={cameraFocus ? 'Restore panels' : 'Focus camera'} aria-pressed={cameraFocus} onClick={() => setCameraFocus(!cameraFocus)}><FocusIcon /><span>{cameraFocus ? 'Restore' : 'Focus'}</span></button>
        </nav>

        {(error || placing) && <div className="scene-notices">
          {error && <div className="global-error" role="alert">{error}<button onClick={() => loadState()}>Try again</button></div>}
          {placing && <div className="placement-banner"><span>Place a camera point</span> Click its position on the floor plan.<button onClick={() => setPlacing(false)}>Cancel</button></div>}
        </div>}

        {!cameraFocus && <aside className={`side-panels${mapExpanded && mapOpen ? ' map-expanded' : ''}`} aria-label="Archive panels">
          {mapOpen && <section className={`map-panel floating-panel${mapExpanded ? ' expanded' : ''}`} aria-label="Floor map panel">
            <header className="floating-heading">
              <div><span className="eyebrow">Find your position</span><h2>Floor map <span>{visibleLocations.length} points</span></h2></div>
              <div className="panel-actions">
                <button className="panel-icon" aria-label={mapExpanded ? 'Shrink map' : 'Expand map'} aria-expanded={mapExpanded} onClick={() => setMapExpanded(!mapExpanded)}><ExpandIcon /></button>
                <button className="panel-icon" aria-label="Collapse map" onClick={() => { setMapOpen(false); setPlacing(false); }}>−</button>
              </div>
            </header>
            <nav className="floor-tabs" aria-label="Floors">
              {data.floors.map((item) => <button key={item.id} aria-pressed={selectedFloor === item.id} className={selectedFloor === item.id ? 'active' : ''} onClick={() => changeFloor(item.id)}>{item.name}</button>)}
            </nav>
            <div className={`plan-frame ${placing ? 'placing' : ''}`}>
              {loading && <div className="plan-loading"><span className="spinner" /></div>}
              {floor && <div className="plan-canvas" onClick={planClicked}>
                <img src={`/plans/${floor.planPath}`} alt={`${floor.name} architectural plan`} draggable="false" />
                {visibleLocations.map((location, index) => <button
                  key={location.id}
                  className={`map-marker ${selectedLocation?.id === location.id ? 'selected' : ''}`}
                  style={{ left: `${location.x * 100}%`, top: `${location.y * 100}%`, '--yaw': `${location.capture.initialYaw}deg` } as React.CSSProperties}
                  onClick={(event) => { event.stopPropagation(); choosePoint(location); }}
                  aria-label={`${location.label}: ${location.capture.title}`}
                  aria-pressed={selectedLocation?.id === location.id}
                ><i className="direction-cone" /><span>{index + 1}</span></button>)}
              </div>}
            </div>
            <div className="map-footer"><span><i className="legend-dot selected" />{selectedLocation?.label ?? 'No points on this date'}</span>{isAdmin && <button className={placing ? 'placing-button active' : 'placing-button'} onClick={() => { setPlacing(!placing); setMapExpanded(true); }}><PlusIcon size={14} />{placing ? 'Cancel' : 'Add point'}</button>}</div>
          </section>}

          {detailsOpen && !(mapOpen && mapExpanded) && <section className="details-panel floating-panel" aria-label="Capture details panel">
            <header className="floating-heading"><div><span className="eyebrow">Behind the view</span><h2>Capture details</h2></div><button className="panel-icon" aria-label="Collapse details" onClick={() => setDetailsOpen(false)}>−</button></header>
            <div className="panel-scroll">
              {selectedLocation && selectedCapture ? <div className="capture-details">
                <div className="capture-title-row"><div><span className="eyebrow">{selectedLocation.label}</span><h2>{selectedCapture.title}</h2></div></div>
                <p className="capture-date"><ClockIcon /> {formatTimestamp(selectedCapture.capturedAt)}</p>
                {selectedCapture.description && <p className="capture-description">{selectedCapture.description}</p>}
                {selectedCapture.tags.length > 0 && <div className="tags">{selectedCapture.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
                {isAdmin && <div className="admin-actions">
                  <button className="button primary wide" onClick={() => setDialog({ kind: 'update', location: selectedLocation })}><PlusIcon /> Add a capture here</button>
                  <button className="button secondary" onClick={() => setEditingPosition(true)}>Move pin / floor</button>
                  <button className="button secondary" onClick={() => setEditingCapture(true)}>Edit capture / notes</button>
                  <button className="button secondary wide save-direction" disabled={savingDirection || readyCapture !== selectedCapture.id} onClick={saveDirection}>{savingDirection ? 'Saving…' : 'Save current view as starting direction'}</button>
                  {directionMessage && <p className="direction-message" role="status">{directionMessage}</p>}
                </div>}
                <div className="history">
                  <div className="history-heading"><strong>Location history</strong><span>{locationHistory.length} captures</span></div>
                  {locationHistory.map((capture) => <div className={`history-item ${capture.id === selectedCapture.id ? 'active' : ''}`} key={capture.id}>
                    <button onClick={() => selectHistory(capture)}><span>{shortTimestamp(capture.capturedAt)}</span><strong>{capture.title}</strong><ArrowIcon size={16} /></button>
                    {isAdmin && <button className="delete-button" onClick={() => removeCapture(capture)} aria-label={`Delete ${capture.title}`}>×</button>}
                  </div>)}
                </div>
              </div> : <div className="inspector-intro"><CameraIcon /><h2>No capture on this floor</h2><p>Choose another date or floor to explore the archive.</p></div>}
            </div>
          </section>}
        </aside>}

        {timelapse && <TimelapseControls label={timelapse.location.label} frames={frames} index={frameIndex} playing={playing} loading={readyCapture !== selectedCapture?.id} pace={pace} nearby={includeNearby}
          onPlay={playTimelapse} onStep={direction => { setPlaying(false); const frame = frames[frameIndex + direction]; if (frame) showFrame(frame); }}
          onPace={setPace} onNearby={changeNearby} onClose={closeTimelapse} />}
        <div className="scene-caption"><CameraIcon size={16} /><span>360° VIEW</span><i /><span>Drag to look around</span></div>
        <div className="scene-floor"><LayersIcon size={14} />{floor?.name}</div>
      </main>

      <footer className="timeline-panel" aria-label="Construction timeline">
        <div className="timeline-label"><ClockIcon /><div><span>{timelapse ? 'Point timelapse' : 'Construction timeline'}</span><strong>{selectedDay ? formatDay(selectedDay) : 'No captures yet'}</strong><small>{timelapse ? `${frames.length} dates · ${timelapse.location.label}` : `${visibleLocations.length} camera points · ${floor?.name}`}</small></div></div>
        <div className="timeline-control">
          <div className="timeline-dates"><span>{timelineDays[0] ? shortDay(timelineDays[0]) : 'Start'}</span><span className="timeline-hint">{timelapse ? 'Drag through this point’s visits' : 'Drag through time · closest camera point'}</span><span>{timelineDays.at(-1) ? shortDay(timelineDays.at(-1)!) : 'Today'}</span></div>
          <input
            aria-label="Construction day"
            aria-valuetext={selectedDay ? formatDay(selectedDay) : 'No captures yet'}
            type="range"
            min={timelineDays.length ? dayPosition(timelineDays[0]) : 0}
            max={timelineDays.length ? dayPosition(timelineDays.at(-1)!) : 0}
            value={selectedDay ? dayPosition(selectedDay) : 0}
            disabled={timelineDays.length < 2}
            onChange={(event) => chooseDay(nearestDay(timelineDays, Number(event.target.value)))}
            onKeyDown={(event) => {
              const direction = ['ArrowRight', 'ArrowUp', 'PageUp'].includes(event.key) ? 1 : ['ArrowLeft', 'ArrowDown', 'PageDown'].includes(event.key) ? -1 : 0;
              if (direction || event.key === 'Home' || event.key === 'End') {
                event.preventDefault();
                chooseDay(event.key === 'Home' ? timelineDays[0] : event.key === 'End' ? timelineDays.at(-1) : timelineDays[Math.max(0, Math.min(timelineDays.length - 1, dayIndex + direction))]);
              }
            }}
            style={{ '--progress': timelineDays.length > 1 && selectedDay ? `${((dayPosition(selectedDay) - dayPosition(timelineDays[0])) / (dayPosition(timelineDays.at(-1)!) - dayPosition(timelineDays[0]))) * 100}%` : '0%' } as React.CSSProperties}
          />
          <div className="timeline-ticks">{timelineDays.map((day) => <button key={day} className={day === selectedDay ? 'active' : ''} style={{ left: timelineDays.length > 1 ? `${((dayPosition(day) - dayPosition(timelineDays[0])) / (dayPosition(timelineDays.at(-1)!) - dayPosition(timelineDays[0]))) * 100}%` : '0%' }} aria-label={`Jump to ${formatDay(day)}`} title={formatDay(day)} onClick={() => chooseDay(day)} />)}</div>
        </div>
        <div className="timeline-stepper">
          <button aria-label="Previous capture date" disabled={dayIndex <= 0} onClick={() => chooseDay(timelineDays[dayIndex - 1])}>‹</button>
          <span>{timelineDays.length ? `${dayIndex + 1} / ${timelineDays.length}` : '0 / 0'}</span>
          <button aria-label="Next capture date" disabled={dayIndex < 0 || dayIndex >= timelineDays.length - 1} onClick={() => chooseDay(timelineDays[dayIndex + 1])}>›</button>
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

