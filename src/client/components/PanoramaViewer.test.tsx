// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { Capture } from '../types';
import { PanoramaViewer } from './PanoramaViewer';

type Options = { position: { yaw: number; pitch: number }; zoom: number; transition: false | { rotation: boolean; speed: number; effect: string } };
const { views } = vi.hoisted(() => ({ views: [] as Array<{
  options: Record<string, number>; position: {yaw: number; pitch: number}; zoom: number;
  state: {ready: boolean}; destroy: ReturnType<typeof vi.fn>;
  setPanorama: ReturnType<typeof vi.fn>;
}> }));
vi.mock('@photo-sphere-viewer/core', () => ({ Viewer: class {
  options: Record<string, number>;
  position: {yaw: number; pitch: number};
  zoom: number;
  state = {ready: false};
  destroy = vi.fn();
  setPanorama = vi.fn(async (_path: string, options: Options) => {
    this.position = options.position; this.zoom = options.zoom; this.state.ready = true; return true;
  });
  constructor(options: Record<string, number>) {
    this.options = options; this.position = {yaw: options.defaultYaw, pitch: options.defaultPitch};
    this.zoom = options.defaultZoomLvl; views.push(this);
  }
  getPosition() { return this.position; }
  getZoomLevel() { return this.zoom; }
} }));
afterEach(() => { cleanup(); views.length = 0; vi.unstubAllGlobals(); });
const rad = (degrees: number) => degrees * Math.PI / 180;
const shot = (id: string, initialYaw: number): Capture => ({ id, locationId: id, title: id, description: '', capturedAt: '2026-10-01T12:00:00', panoramaPath: `/${id}.jpg`, originalFilename: null, tags: [], initialYaw });
const ready = async () => { await waitFor(() => expect(views[0]?.setPanorama).toHaveBeenCalledTimes(1)); await waitFor(() => expect(views[0].state.ready).toBe(true)); };

describe('aligned panorama fades', () => {
  it('fades in the same viewer, keeping relative direction and pitch and opening fully zoomed out', async () => {
    const status = vi.fn();
    const view = render(<PanoramaViewer capture={shot('first', 90)} viewKey="anchor" onStatus={status} />);
    await ready();
    views[0].position = { yaw: rad(120), pitch: .15 }; views[0].zoom = 72;
    view.rerender(<PanoramaViewer capture={shot('nearby', 270)} viewKey="anchor" onStatus={status} />);
    await waitFor(() => expect(views[0].setPanorama).toHaveBeenCalledTimes(2));
    const options = views[0].setPanorama.mock.calls[1][1] as Options;
    expect(views).toHaveLength(1);
    expect(views[0].destroy).not.toHaveBeenCalled();
    expect(options.position.yaw).toBeCloseTo(rad(300));
    expect(options.position.pitch).toBeCloseTo(.15);
    expect(options.zoom).toBe(0);
    expect(options.transition).toEqual({rotation: false, effect: 'fade', speed: 900});
    await waitFor(() => expect(status).toHaveBeenLastCalledWith('ready', 'nearby'));
  });
  it('resets an explicitly chosen point to its own saved direction', async () => {
    const view = render(<PanoramaViewer capture={shot('first', 90)} viewKey="first" />);
    await ready(); views[0].position = {yaw: rad(120), pitch: .2}; views[0].zoom = 72;
    view.rerender(<PanoramaViewer capture={shot('other', 180)} viewKey="other" />);
    await waitFor(() => expect(views).toHaveLength(2));
    await waitFor(() => expect(views[1].setPanorama).toHaveBeenCalledOnce());
    expect(views[0].destroy).toHaveBeenCalledOnce();
    expect(views[1].options.defaultYaw).toBeCloseTo(rad(180));
    expect(views[1].options.defaultPitch).toBe(0);
    expect(views[1].options.defaultZoomLvl).toBe(0);
  });
  it('retains relative heading through a date without a photo', async () => {
    const view = render(<PanoramaViewer capture={shot('first', 350)} viewKey="anchor" />);
    await ready(); views[0].position = {yaw: rad(15), pitch: .1};
    view.rerender(<PanoramaViewer capture={undefined} viewKey="anchor" />);
    view.rerender(<PanoramaViewer capture={shot('later', 170)} viewKey="anchor" />);
    await waitFor(() => expect(views).toHaveLength(2));
    expect(views[1].options.defaultYaw).toBeCloseTo(rad(195));
  });
  it('does not report stale or failed loads as ready', async () => {
    const status = vi.fn();
    const view = render(<PanoramaViewer capture={shot('first', 0)} viewKey="anchor" onStatus={status} />);
    await ready();
    let finish: (value: boolean) => void = () => {};
    views[0].setPanorama.mockImplementationOnce(() => new Promise<boolean>(resolve => { finish = resolve; }));
    view.rerender(<PanoramaViewer capture={shot('slow', 0)} viewKey="anchor" onStatus={status} />);
    await waitFor(() => expect(views[0].setPanorama).toHaveBeenCalledTimes(2));
    views[0].setPanorama.mockRejectedValueOnce(new Error('Unavailable'));
    view.rerender(<PanoramaViewer capture={shot('failed', 0)} viewKey="anchor" onStatus={status} />);
    await waitFor(() => expect(status).toHaveBeenLastCalledWith('error', 'failed'));
    finish(true);
    await Promise.resolve();
    expect(status).not.toHaveBeenCalledWith('ready', 'slow');
    expect(status).not.toHaveBeenCalledWith('ready', 'failed');
  });
  it('respects reduced motion when changing photographs', async () => {
    vi.stubGlobal('matchMedia', () => ({matches: true}));
    const view = render(<PanoramaViewer capture={shot('first', 0)} viewKey="anchor" />);
    await ready();
    view.rerender(<PanoramaViewer capture={shot('next', 90)} viewKey="anchor" />);
    await waitFor(() => expect(views[0].setPanorama).toHaveBeenCalledTimes(2));
    expect(views[0].setPanorama.mock.calls[1][1].transition).toBe(false);
  });
});
