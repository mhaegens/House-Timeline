import { describe, expect, it } from 'vitest';
import { timelapseFrames } from './timelapse';
import type { Capture, Location } from './types';

const point = (id: string, x: number, y = .3, floorId: Location['floorId'] = 'ground', label = id): Location => ({ id, x, y, floorId, label });
const photo = (id: string, locationId: string, day: string, extra: Partial<Capture> = {}): Capture => ({
  id, locationId, title: id, description: '', capturedAt: `${day}T12:00:00Z`,
  panoramaPath: `/${id}.jpg`, originalFilename: null, initialYaw: 0, tags: [], ...extra,
});

describe('timelapse photo matching', () => {
  const anchor = point('anchor', .3);
  const close = point('close', .36);
  const far = point('far', .7);
  const upstairs = point('upstairs', .3, .3, 'first');

  it('uses a real photograph on each date, in chronological order', () => {
    const photos = [photo('later', 'anchor', '2026-10-01'), photo('earlier', 'anchor', '2026-09-01')];
    expect(timelapseFrames(photos, [anchor], anchor, photos[0]).map(f => f.capture.id)).toEqual(['earlier', 'later']);
  });

  it('prefers the exact point, then uses only the closest same-floor point within reach', () => {
    const photos = [photo('near', 'close', '2026-09-01'), photo('exact', 'anchor', '2026-09-01'),
      photo('fallback', 'close', '2026-09-02'), photo('remote', 'far', '2026-09-03'), photo('wrong-floor', 'upstairs', '2026-09-04')];
    const frames = timelapseFrames(photos, [anchor, close, far, upstairs], anchor, photos[1]);
    expect(frames.map(f => [f.capture.id, f.nearby])).toEqual([['exact', false], ['fallback', true]]);
  });

  it('never drifts farther away by following the previous fallback', () => {
    const next = point('next', .46);
    const photos = [photo('start', 'anchor', '2026-09-01'), photo('step', 'close', '2026-09-02'), photo('drift', 'next', '2026-09-03')];
    expect(timelapseFrames(photos, [anchor, close, next], anchor, photos[0]).map(f => f.capture.id)).toEqual(['start', 'step']);
  });

  it('can stay strictly at the selected point and skips empty panorama records', () => {
    const photos = [photo('start', 'anchor', '2026-09-01'), photo('step', 'close', '2026-09-02'),
      photo('empty', 'anchor', '2026-09-03', { panoramaPath: null })];
    expect(timelapseFrames(photos, [anchor, close], anchor, photos[0], false).map(f => f.capture.id)).toEqual(['start']);
  });

  it('preserves the selected shot when several photographs share the same date', () => {
    const chosen = photo('chosen', 'anchor', '2026-09-01');
    const later = photo('later', 'anchor', '2026-09-01', { capturedAt: '2026-09-01T16:00:00Z' });
    expect(timelapseFrames([later, chosen], [anchor], anchor, chosen)[0].capture.id).toBe('chosen');
  });

  it('does not mix a roof or scaffold view into an interior timelapse', () => {
    const roof = point('roof', .31, .3, 'ground', 'Dak - achter links');
    const scaffold = point('scaffold', .32, .3, 'ground', 'Steiger');
    const photos = [photo('start', 'anchor', '2026-09-01'), photo('roof', 'roof', '2026-09-02'), photo('scaffold', 'scaffold', '2026-09-03')];
    expect(timelapseFrames(photos, [anchor, roof, scaffold], anchor, photos[0]).map(f => f.capture.id)).toEqual(['start']);
  });

  it('does not substitute an indoor view for an outside point across the wall', () => {
    const outside = point('outside', .04);
    const inside = point('inside', .1);
    const photos = [photo('start', 'outside', '2026-09-01'), photo('inside', 'inside', '2026-09-02')];
    expect(timelapseFrames(photos, [outside, inside], outside, photos[0]).map(f => f.capture.id)).toEqual(['start']);
  });
});
