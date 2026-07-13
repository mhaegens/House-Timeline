import type { Capture, Location } from './types';

export type VisibleLocation = Location & { capture: Capture };

export function captureDates(captures: Capture[]) {
  return [...new Set(captures.map((capture) => capture.capturedAt))].sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime(),
  );
}

export function locationsAtDate(
  locations: Location[],
  captures: Capture[],
  floorId: string,
  selectedDate: string | undefined,
): VisibleLocation[] {
  if (!selectedDate) return [];
  const cutoff = new Date(selectedDate).getTime();

  return locations
    .filter((location) => location.floorId === floorId)
    .flatMap((location) => {
      const latest = captures
        .filter(
          (capture) =>
            capture.locationId === location.id && new Date(capture.capturedAt).getTime() <= cutoff,
        )
        .sort(
          (a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime(),
        )[0];
      return latest ? [{ ...location, capture: latest }] : [];
    });
}
