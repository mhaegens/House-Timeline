import { describe, expect, it } from 'vitest';
import { dayPosition, nearestDay, nearestPoint } from './navigation';
import type { VisibleLocation } from './timeline';

const point = (id: string, x: number, y: number, floorId: 'ground' | 'first' = 'ground'): VisibleLocation => ({
  id, x, y, floorId, label: id,
  capture: { id, locationId: id, capturedAt: '2026-10-01T12:00:00', title: id, description: '', panoramaPath: null, originalFilename: null, initialYaw: 0, tags: [] },
});

describe('camera timeline navigation', () => {
  it('snaps gaps to the nearest recorded date, with earlier dates winning ties', () => {
    const days = ['2026-09-01', '2026-09-03', '2026-10-01'];
    expect(nearestDay(days, dayPosition('2026-09-02'))).toBe('2026-09-01');
    expect(nearestDay(days, dayPosition('2026-09-25'))).toBe('2026-10-01');
    expect(nearestDay([], 0)).toBeUndefined();
  });
  it('spaces calendar days evenly through daylight saving changes', () => {
    expect(dayPosition('2026-10-26') - dayPosition('2026-10-24')).toBe(2);
  });
  it('keeps the chosen point when that point has a capture on the new date', () => {
    const anchor = point('original', .4, .5);
    expect(nearestPoint([point('neighbor', .4, .5), anchor], anchor)?.id).toBe('original');
  });
  it('chooses the spatially closest available point on the same floor', () => {
    expect(nearestPoint([point('far', .9, .9), point('near', .41, .5), point('upstairs', .4, .5, 'first')], point('anchor', .4, .5))?.id).toBe('near');
  });
  it('does not drift when scrubbing through dates and back', () => {
    const anchor = point('anchor', .4, .5);
    expect(nearestPoint([point('middle', .5, .5)], anchor)?.id).toBe('middle');
    expect(nearestPoint([point('left', .35, .5), point('right', .52, .5)], anchor)?.id).toBe('left');
  });
  it('handles an empty floor without opening a capture from another floor', () => {
    expect(nearestPoint([], point('anchor', .4, .5))).toBeUndefined();
    expect(nearestPoint([point('upstairs', .4, .5, 'first')], point('anchor', .4, .5))).toBeUndefined();
  });
});
