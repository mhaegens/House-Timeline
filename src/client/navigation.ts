import type { Location } from './types';
import type { VisibleLocation } from './timeline';

/** Calendar-day coordinates keep gaps between visits proportional, including across DST. */
export function dayPosition(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year, month - 1, date) / 86_400_000;
}

export function nearestDay(days: string[], position: number): string | undefined {
  return days.reduce<string | undefined>((best, day) =>
    !best || Math.abs(dayPosition(day) - position) < Math.abs(dayPosition(best) - position) ? day : best,
  undefined);
}

/** Keep the original camera position as the anchor so scrubbing cannot drift around the house. */
export function nearestPoint(points: VisibleLocation[], anchor?: Location | null): VisibleLocation | undefined {
  if (!anchor) return points[0];
  const sameFloor = points.filter((point) => point.floorId === anchor.floorId);
  const exact = sameFloor.find((point) => point.id === anchor.id);
  if (exact) return exact;
  const distance = (point: Location) => (point.x - anchor.x) ** 2 + (point.y - anchor.y) ** 2;
  return sameFloor.reduce<VisibleLocation | undefined>((best, point) =>
    !best || distance(point) < distance(best) || (distance(point) === distance(best) && point.id < best.id) ? point : best,
  undefined);
}
