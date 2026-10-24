import type { Capture, Location } from './types';

export type VisibleLocation = Location & { capture: Capture };

/** Local calendar day key (YYYY-MM-DD) for a capture timestamp. */
export function captureDay(value: string): string {
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Local-midnight Date for a YYYY-MM-DD day key, for display formatting. */
export function dayToDate(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date);
}

export function captureDays(captures: Capture[]): string[] {
  return [...new Set(captures.map((capture) => captureDay(capture.capturedAt)))].sort();
}

export function captureOnDay(
  captures: Capture[],
  locationId: string,
  selectedDay: string | undefined,
  preferredId?: string,
): Capture | undefined {
  const matching = captures.filter(
    (capture) => capture.locationId === locationId && captureDay(capture.capturedAt) === selectedDay,
  );
  return matching.find((capture) => capture.id === preferredId)
    ?? matching.sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime())[0];
}

export function locationsOnDay(
  locations: Location[],
  captures: Capture[],
  floorId: string,
  selectedDay: string | undefined,
): VisibleLocation[] {
  if (!selectedDay) return [];

  return locations
    .filter((location) => location.floorId === floorId)
    .flatMap((location) => {
      const latest = captureOnDay(captures, location.id, selectedDay);
      return latest ? [{ ...location, capture: latest }] : [];
    });
}

