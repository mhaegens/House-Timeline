import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Viewer as ViewerType } from '@photo-sphere-viewer/core';
import '@photo-sphere-viewer/core/index.css';
import type { Capture } from '../types';
import { CameraIcon } from './Icons';
import { alignedYaw, relativeYaw } from '../viewDirection';

export type PanoramaStatus = 'loading' | 'ready' | 'error';
export type PanoramaHandle = { getYaw: () => number | undefined };
type Perspective = { key: string; yaw: number; pitch: number; zoom: number };

export const PanoramaViewer = forwardRef<PanoramaHandle, {
  capture: Capture | undefined;
  viewKey?: string;
  onStatus?: (status: PanoramaStatus, captureId: string) => void;
}>(function PanoramaViewer({ capture, viewKey, onStatus }, ref) {
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<ViewerType | undefined>(undefined);
  const [viewer, setViewer] = useState<ViewerType>();
  const [status, setStatus] = useState<PanoramaStatus>('loading');
  const [retry, setRetry] = useState(0);
  const latest = useRef(capture);
  latest.current = capture;
  const notify = useRef(onStatus);
  notify.current = onStatus;
  const shown = useRef<Capture | undefined>(undefined);
  const remembered = useRef<Perspective | undefined>(undefined);
  const initialPerspective = useRef<Perspective | undefined>(undefined);
  const key = viewKey ?? capture?.locationId;
  const hasImage = Boolean(capture?.panoramaPath);

  useImperativeHandle(ref, () => ({
    getYaw: () => instance.current?.state.ready
      ? ((instance.current.getPosition().yaw * 180 / Math.PI) % 360 + 360) % 360
      : undefined,
  }), []);

  // Keep one WebGL viewer while dates change. Changing the chosen point starts
  // in its own saved direction; a gap retains the current anchor's perspective.
  useEffect(() => {
    if (!hasImage || !container.current) return;
    let cancelled = false;
    let created: ViewerType | undefined;
    const previous = remembered.current?.key === key ? remembered.current : undefined;
    initialPerspective.current = previous;
    shown.current = undefined;
    void import('@photo-sphere-viewer/core').then(({ Viewer }) => {
      if (cancelled || !container.current) return;
      const first = latest.current!;
      created = new Viewer({
        container: container.current,
        defaultYaw: alignedYaw(first.initialYaw, previous?.yaw),
        defaultPitch: previous?.pitch ?? 0,
        defaultZoomLvl: 0,
        navbar: ['zoom', 'move'],
        touchmoveTwoFingers: false,
      });
      instance.current = created;
      setViewer(created);
    }).catch(() => {
      if (!cancelled) {
        setStatus('error');
        if (latest.current) notify.current?.('error', latest.current.id);
      }
    });
    return () => {
      cancelled = true;
      if (created) {
        if (shown.current && created.state.ready) {
          const position = created.getPosition();
          remembered.current = { key: key!, yaw: relativeYaw(position.yaw, shown.current.initialYaw), pitch: position.pitch, zoom: created.getZoomLevel() };
        }
        if (instance.current === created) instance.current = undefined;
        created.destroy();
      }
    };
  }, [hasImage, key, retry]);

  useEffect(() => {
    if (!viewer || viewer !== instance.current || !capture?.panoramaPath) return;
    let cancelled = false;
    const previous = shown.current;
    const position = viewer.getPosition();
    const offset = previous
      ? previous.id === capture.id && previous.initialYaw !== capture.initialYaw ? 0 : relativeYaw(position.yaw, previous.initialYaw)
      : initialPerspective.current?.yaw ?? 0;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    setStatus('loading');
    notify.current?.('loading', capture.id);
    void viewer.setPanorama(capture.panoramaPath, {
      position: { yaw: alignedYaw(capture.initialYaw, offset), pitch: previous ? position.pitch : initialPerspective.current?.pitch ?? 0 },
      zoom: 0,
      transition: previous && !reducedMotion ? { speed: 900, rotation: false, effect: 'fade' } : false,
      showLoader: !previous,
    }).then((completed) => {
      if (cancelled || !completed) return;
      shown.current = capture;
      setStatus('ready');
      notify.current?.('ready', capture.id);
    }).catch(() => {
      if (cancelled) return;
      setStatus('error');
      notify.current?.('error', capture.id);
    });
    return () => { cancelled = true; };
  }, [viewer, capture?.id, capture?.panoramaPath, capture?.initialYaw, key, retry]);

  if (!hasImage) return <div className="panorama-empty">
    <div className="panorama-grid" />
    <div className="panorama-empty-content">
      <span className="panorama-icon"><CameraIcon size={28} /></span>
      <strong>{capture ? 'Capture recorded' : 'Choose a camera point'}</strong>
      <span>{capture ? 'Its 360° image can be added when available.' : 'Open a dot on the plan to inspect its history.'}</span>
    </div>
  </div>;
  return <div className="panorama-shell">
    <div className="panorama-viewer" ref={container} />
    {status === 'loading' && <div className="panorama-status" role="status">Loading photograph…</div>}
    {status === 'error' && <div className="panorama-status panorama-error" role="alert">Could not load this photograph. <button onClick={() => setRetry(value => value + 1)}>Try again</button></div>}
  </div>;
});
