import { useEffect, useRef } from 'react';
import type { Viewer as ViewerType } from '@photo-sphere-viewer/core';
import '@photo-sphere-viewer/core/index.css';
import type { Capture } from '../types';
import { CameraIcon } from './Icons';
import { alignedYaw, relativeYaw } from '../viewDirection';

export function PanoramaViewer({ capture, viewKey }: { capture: Capture | undefined; viewKey?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const perspective = useRef<{ key: string; yaw: number; pitch: number } | undefined>(undefined);

  useEffect(() => {
    if (!container.current || !capture?.panoramaPath) return;
    const key = viewKey ?? capture.locationId;
    const previous = perspective.current?.key === key ? perspective.current : undefined;
    let viewer: ViewerType | undefined;
    let cancelled = false;
    void import('@photo-sphere-viewer/core').then(({ Viewer }) => {
      if (cancelled || !container.current) return;
      viewer = new Viewer({
        container: container.current,
        defaultYaw: alignedYaw(capture.initialYaw, previous?.yaw),
        defaultPitch: previous?.pitch ?? 0,
        defaultZoomLvl: 0,
        navbar: ['zoom', 'move'],
        touchmoveTwoFingers: false,
      });
      // Explicit load options take precedence over embedded Insta360 opening-view metadata.
      void viewer.setPanorama(capture.panoramaPath!, {
        position: { yaw: alignedYaw(capture.initialYaw, previous?.yaw), pitch: previous?.pitch ?? 0 },
        zoom: 0,
        transition: false,
      }).catch(() => { if (!cancelled) viewer?.showError('Could not load this photograph.'); });
    });
    return () => {
      cancelled = true;
      if (viewer) {
        const position = viewer.getPosition();
        perspective.current = { key, yaw: relativeYaw(position.yaw, capture.initialYaw), pitch: position.pitch };
        viewer.destroy();
      }
    };
  }, [capture?.id, capture?.panoramaPath, capture?.initialYaw, viewKey]);

  if (!capture?.panoramaPath) {
    return (
      <div className="panorama-empty">
        <div className="panorama-grid" />
        <div className="panorama-empty-content">
          <span className="panorama-icon"><CameraIcon size={28} /></span>
          <strong>{capture ? 'Capture recorded' : 'Choose a camera point'}</strong>
          <span>{capture ? 'Its 360° image can be added when available.' : 'Open a dot on the plan to inspect its history.'}</span>
        </div>
      </div>
    );
  }
  return <div className="panorama-viewer" ref={container} />;
}

