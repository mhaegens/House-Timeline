import { captureDay } from './timeline';
import type { Capture, Location } from './types';

export type TimelapseFrame = {
  day: string;
  capture: Capture;
  location: Location;
  nearby: boolean;
  distance: number;
};

/** Keep roof/stepping-outside views out of an indoor room's sequence. */
function context(capture: Capture, location: Location): string {
  if (capture.tags.includes('dak') || /^dak\b/i.test(location.label)) return 'roof';
  if (/steiger/i.test(location.label)) return 'scaffold';
  return location.x < .07 || location.x > .93 || location.y < .07 || location.y > .93
    ? 'outside' : 'inside';
}

/** One real photograph per visit, always measured from the original point. */
export function timelapseFrames(
  captures: Capture[],
  locations: Location[],
  anchor: Location,
  reference: Capture,
  includeNearby = true,
  radius = .12,
): TimelapseFrame[] {
  const points = new Map(locations.map((location) => [location.id, location]));
  const frames = new Map<string, TimelapseFrame>();
  const anchorContext = context(reference, anchor);
  for (const capture of captures) {
    const location = points.get(capture.locationId);
    if (!capture.panoramaPath || !location || location.floorId !== anchor.floorId) continue;
    const nearby = location.id !== anchor.id;
    const distance = Math.hypot(location.x - anchor.x, location.y - anchor.y);
    if (nearby && (!includeNearby || distance > radius || context(capture, location) !== anchorContext)) continue;
    const day = captureDay(capture.capturedAt);
    const candidate = { day, capture, location, nearby, distance };
    const previous = frames.get(day);
    if (!previous || compareFrames(candidate, previous, reference.id) < 0) frames.set(day, candidate);
  }
  return [...frames.values()].sort((a, b) => a.day.localeCompare(b.day));
}

function compareFrames(a: TimelapseFrame, b: TimelapseFrame, preferredId: string): number {
  // An exact point always wins over a neighbouring point, even on the same spot.
  return Number(a.nearby) - Number(b.nearby)
    || a.distance - b.distance
    || Number(b.capture.id === preferredId) - Number(a.capture.id === preferredId)
    || Date.parse(b.capture.capturedAt) - Date.parse(a.capture.capturedAt)
    || a.capture.id.localeCompare(b.capture.id);
}
