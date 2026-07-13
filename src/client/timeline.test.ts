import { describe, expect, it } from 'vitest';
import { captureDates, locationsAtDate } from './timeline';
import type { Capture, Location } from './types';

const locations: Location[] = [
  { id: 'a', floorId: 'ground', x: 0.2, y: 0.3, label: 'Kitchen' },
  { id: 'b', floorId: 'first', x: 0.6, y: 0.4, label: 'Landing' },
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

const captures = [
  capture('old', 'a', '2026-01-10T10:00:00.000Z'),
  capture('new', 'a', '2026-02-10T10:00:00.000Z'),
  capture('upstairs', 'b', '2026-01-20T10:00:00.000Z'),
];

describe('construction timeline', () => {
  it('sorts unique capture dates', () => {
    expect(captureDates([captures[1], captures[0], captures[0]])).toEqual([
      '2026-01-10T10:00:00.000Z',
      '2026-02-10T10:00:00.000Z',
    ]);
  });

  it('shows the latest capture at each location on or before the selected date', () => {
    expect(locationsAtDate(locations, captures, 'ground', '2026-01-31T10:00:00.000Z')[0]?.capture.id).toBe('old');
    expect(locationsAtDate(locations, captures, 'ground', '2026-03-01T10:00:00.000Z')[0]?.capture.id).toBe('new');
  });

  it('does not show future captures or captures on another floor', () => {
    expect(locationsAtDate(locations, captures, 'ground', '2026-01-01T10:00:00.000Z')).toHaveLength(0);
    expect(locationsAtDate(locations, captures, 'basement', '2026-03-01T10:00:00.000Z')).toHaveLength(0);
  });
});
