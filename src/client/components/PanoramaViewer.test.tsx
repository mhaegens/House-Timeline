// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { Capture } from '../types';
import { PanoramaViewer } from './PanoramaViewer';

const { views } = vi.hoisted(() => ({ views: [] as Array<{options: Record<string, number>; position: {yaw: number; pitch: number}; zoom: number; destroy: ReturnType<typeof vi.fn>; setPanorama: ReturnType<typeof vi.fn>}> }));
vi.mock('@photo-sphere-viewer/core', () => ({ Viewer: class {
  options: Record<string, number>;
  position: {yaw: number; pitch: number};
  zoom: number;
  destroy = vi.fn();
  setPanorama = vi.fn(async () => true);
  constructor(options: Record<string, number>) { this.options = options; this.position = {yaw: options.defaultYaw, pitch: options.defaultPitch}; this.zoom = options.defaultZoomLvl; views.push(this); }
  getPosition() { return this.position; }
  getZoomLevel() { return this.zoom; }
} }));
afterEach(() => { cleanup(); views.length = 0; });
const rad = (degrees: number) => degrees * Math.PI / 180;
const shot = (id: string, initialYaw: number): Capture => ({ id, locationId: id, title: id, description: '', capturedAt: '2026-10-01T12:00:00', panoramaPath: `/${id}.jpg`, originalFilename: null, tags: [], initialYaw });

describe('panorama alignment during scrubbing', () => {
  it('uses saved alignment and keeps relative yaw and pitch while starting fully zoomed out through nearby fallback points', async () => {
    const view = render(<PanoramaViewer capture={shot('first', 90)} viewKey="anchor" />);
    await waitFor(() => expect(views).toHaveLength(1));
    expect(views[0].options.defaultZoomLvl).toBe(0);
    views[0].position = { yaw: rad(120), pitch: .15 }; views[0].zoom = 72;
    view.rerender(<PanoramaViewer capture={shot('nearby', 270)} viewKey="anchor" />);
    await waitFor(() => expect(views).toHaveLength(2));
    expect(views[0].destroy).toHaveBeenCalledOnce();
    expect(views[1].options.defaultYaw).toBeCloseTo(rad(300));
    expect(views[1].options.defaultPitch).toBeCloseTo(.15);
    expect(views[1].options.defaultZoomLvl).toBe(0);
  });
  it('overrides embedded photo heading and zoom preferences on every load', async () => {
    const view = render(<PanoramaViewer capture={shot('first', 90)} viewKey="anchor" />);
    await waitFor(() => expect(views).toHaveLength(1));
    expect(views[0].setPanorama).toHaveBeenCalledWith('/first.jpg', {
      position: {yaw: rad(90), pitch: 0}, zoom: 0, transition: false,
    });
    views[0].position = {yaw: rad(120), pitch: .15}; views[0].zoom = 72;
    view.rerender(<PanoramaViewer capture={shot('next', 270)} viewKey="anchor" />);
    await waitFor(() => expect(views).toHaveLength(2));
    const options = views[1].setPanorama.mock.calls[0] as unknown as [string, {position: {yaw: number; pitch: number}; zoom: number}];
    expect(options[1].position.yaw).toBeCloseTo(rad(300));
    expect(options[1].position.pitch).toBeCloseTo(.15);
    expect(options[1].zoom).toBe(0);
  });
  it('opens an explicitly chosen camera point in its saved direction', async () => {
    const view = render(<PanoramaViewer capture={shot('first', 90)} viewKey="first" />);
    await waitFor(() => expect(views).toHaveLength(1));
    views[0].position = {yaw: rad(120), pitch: .2}; views[0].zoom = 72;
    view.rerender(<PanoramaViewer capture={shot('other', 180)} viewKey="other" />);
    await waitFor(() => expect(views).toHaveLength(2));
    expect(views[1].options.defaultYaw).toBeCloseTo(rad(180));
    expect(views[1].options.defaultPitch).toBe(0);
    expect(views[1].options.defaultZoomLvl).toBe(0);
  });
  it('retains the aligned perspective through a date with no capture', async () => {
    const view = render(<PanoramaViewer capture={shot('first', 350)} viewKey="anchor" />);
    await waitFor(() => expect(views).toHaveLength(1));
    views[0].position = {yaw: rad(15), pitch: .1};
    view.rerender(<PanoramaViewer capture={undefined} viewKey="anchor" />);
    view.rerender(<PanoramaViewer capture={shot('later', 170)} viewKey="anchor" />);
    await waitFor(() => expect(views).toHaveLength(2));
    expect(views[1].options.defaultYaw).toBeCloseTo(rad(195));
  });
});
