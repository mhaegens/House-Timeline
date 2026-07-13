import { useEffect, useRef } from 'react';
import type { Viewer as ViewerType } from '@photo-sphere-viewer/core';
import '@photo-sphere-viewer/core/index.css';
import type { Capture } from '../types';
import { CameraIcon } from './Icons';

export function PanoramaViewer({ capture }: { capture: Capture | undefined }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current || !capture?.panoramaPath) return;
    let viewer: ViewerType | undefined;
    let cancelled = false;
    void import('@photo-sphere-viewer/core').then(({ Viewer }) => {
      if (cancelled || !container.current) return;
      viewer = new Viewer({
        container: container.current,
        panorama: capture.panoramaPath!,
        defaultYaw: (capture.initialYaw * Math.PI) / 180,
        navbar: ['zoom', 'move', 'fullscreen'],
        touchmoveTwoFingers: true,
      });
    });
    return () => {
      cancelled = true;
      viewer?.destroy();
    };
  }, [capture?.id, capture?.panoramaPath, capture?.initialYaw]);

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
