import { describe, expect, it } from 'vitest';
import { captureDay, captureDays, dayToDate, locationsOnDay } from './timeline';
import type { Capture, Location } from './types';

const locations: Location[] = [
  { id: 'a', floorId: 'ground', x: 0.2, y: 0.3, label: 'Kitchen' },
  { id: 'b', floorId: 'first', x: 0.6, y: 0.4, label: 'Landing' },
  { id: 'c', floorId: 'ground', x: 0.8, y: 0.7, label: 'Hallway' },
];

const capture = (id: string, locationId: string, capturedAt: string): Capture => ({
  id,
  locationId,
  capturedAt,
  title: id,
  description: '',
  panoramaPath: null,
  originalFilename: null,
  initialYaw: 0,
  tags: [],
});

// Local timestamps (no timezone suffix) keep the expected day deterministic in any zone.
const captures = [
  capture('old-morning', 'a', '2026-01-10T09:00:00'),
  capture('old-afternoon', 'c', '2026-01-10T15:30:00'),
  capture('new', 'a', '2026-02-10T10:00:00'),
  capture('upstairs', 'b', '2026-01-20T10:00:00'),
];

describe('construction timeline', () => {
  it('derives the local calendar day of a capture', () => {
    expect(captureDay('2026-01-10T09:00:00')).toBe('2026-01-10');
    expect(captureDay('2026-01-10T23:59:00')).toBe('2026-01-10');
  });

  it('round-trips a day key through dayToDate', () => {
    expect(captureDay(dayToDate('2026-01-10').toISOString())).toBe('2026-01-10');
  });

  it('collapses captures from the same day into one timeline stop', () => {
    expect(captureDays(captures)).toEqual(['2026-01-10', '2026-01-20', '2026-02-10']);
  });

  it('shows every capture of the selected day regardless of the hour', () => {
    const visible = locationsOnDay(locations, captures, 'ground', '2026-01-10');
    expect(visible.map((location) => location.capture.id).sort()).toEqual([
      'old-afternoon',
      'old-morning',
    ]);
  });

  it('keeps pins from earlier days visible on later days', () => {
    const visible = locationsOnDay(locations, captures, 'ground', '2026-01-20');
    expect(visible.map((location) => location.capture.id).sort()).toEqual([
      'old-afternoon',
      'old-morning',
    ]);
  });

  it('shows the latest capture at each location on or before the selected day', () => {
    const visible = locationsOnDay(locations, captures, 'ground', '2026-02-10');
    expect(visible.find((location) => location.id === 'a')?.capture.id).toBe('new');
    expect(visible.find((location) => location.id === 'c')?.capture.id).toBe('old-afternoon');
  });

  it('does not show future captures or captures on another floor', () => {
    expect(locationsOnDay(locations, captures, 'ground', '2026-01-01')).toHaveLength(0);
    expect(locationsOnDay(locations, captures, 'basement', '2026-02-10')).toHaveLength(0);
  });
});
