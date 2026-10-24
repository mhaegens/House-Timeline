import type { TimelapseFrame } from '../timelapse';

export function TimelapseControls({ label, frames, index, playing, loading, pace, nearby, onPlay, onStep, onPace, onNearby, onClose }: {
  label: string; frames: TimelapseFrame[]; index: number; playing: boolean; loading: boolean;
  pace: number; nearby: boolean; onPlay: () => void; onStep: (direction: number) => void;
  onPace: (value: number) => void; onNearby: (value: boolean) => void; onClose: () => void;
}) {
  const frame = frames[index];
  return <section className="timelapse-controls floating-panel" aria-label="Timelapse controls">
    <div className="timelapse-heading">
      <div><strong>{label}</strong></div>
      <button className="panel-icon" aria-label="Close timelapse" onClick={onClose}>×</button>
    </div>
    <div className="timelapse-transport">
      <button className="timelapse-step" aria-label="Previous timelapse photo" disabled={index <= 0} onClick={() => onStep(-1)}>‹</button>
      <button className="timelapse-play" aria-label={playing ? 'Pause timelapse' : index === frames.length - 1 ? 'Replay timelapse' : 'Play timelapse'} disabled={frames.length < 2} onClick={onPlay}>
        {playing ? <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2h3v12H3zm7 0h3v12h-3z" fill="currentColor" /></svg> : <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 2 10 6-10 6z" fill="currentColor" /></svg>}
        {playing ? 'Pause' : index === frames.length - 1 ? 'Replay' : 'Play'}
      </button>
      <button className="timelapse-step" aria-label="Next timelapse photo" disabled={index < 0 || index >= frames.length - 1} onClick={() => onStep(1)}>›</button>
      <span className="timelapse-count" role="status">{loading ? 'Loading…' : `${Math.max(0, index + 1)} / ${frames.length}`}</span>
      <label className="timelapse-pace">Pace<select aria-label="Timelapse pace" value={pace} onChange={event => onPace(Number(event.target.value))}><option value="1500">Quick</option><option value="3500">Steady</option><option value="6500">Slow</option></select></label>
    </div>
    <div className="timelapse-options">
      <label><input type="checkbox" checked={nearby} onChange={event => onNearby(event.target.checked)} /> Include nearby photos</label>
      {frame && <span className={frame.nearby ? 'nearby-photo' : ''}>{frame.nearby ? `Nearby · ${frame.location.label}` : 'Same camera point'}</span>}
    </div>
    {frames.length < 2 && <p className="timelapse-help">This point needs photos on at least two dates. Try including nearby photos.</p>}
  </section>;
}
