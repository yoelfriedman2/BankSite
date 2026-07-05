/**
 * Pure trip-planning math for the road trip planner: no network calls, no
 * Google/Maps API — drive times are estimated from great-circle distance so
 * the whole feature works with zero external dependencies or billing risk.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_MI = 3958.8;

export function haversineMiles(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Roads are never a straight line, so scale the great-circle distance up and
// assume a modest average speed (mixed local roads between small-town branches).
const ROAD_WINDING_FACTOR = 1.3;
const AVG_SPEED_MPH = 35;

/** Rough drive time in minutes. A planning estimate, not a routed ETA. */
export function estimateDriveMinutes(a: LatLng, b: LatLng): number {
  const miles = haversineMiles(a, b) * ROAD_WINDING_FACTOR;
  return (miles / AVG_SPEED_MPH) * 60;
}

function routeMinutes(points: LatLng[]): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) total += estimateDriveMinutes(points[i], points[i + 1]);
  return total;
}

/** Standard 2-opt local search: repeatedly un-crosses the route until no swap helps. */
function twoOpt<T extends LatLng>(start: T, initialStops: T[]): T[] {
  let full = [start, ...initialStops];
  const n = full.length;
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = full[i - 1];
        const b = full[i];
        const c = full[j];
        const d = full[j + 1];
        const oldCost = estimateDriveMinutes(a, b) + (d ? estimateDriveMinutes(c, d) : 0);
        const newCost = estimateDriveMinutes(a, c) + (d ? estimateDriveMinutes(b, d) : 0);
        if (newCost < oldCost - 0.01) {
          const reversed = full.slice(i, j + 1).reverse();
          full = [...full.slice(0, i), ...reversed, ...full.slice(j + 1)];
          improved = true;
        }
      }
    }
  }
  return full.slice(1);
}

/** Orders stops starting from `start`: nearest-neighbor, then 2-opt cleanup.
 *  Good enough for the small stop counts (a day's worth of banks) this feature deals with. */
export function orderStops<T extends LatLng>(start: T, stops: T[]): T[] {
  if (stops.length <= 1) return [...stops];
  const remaining = [...stops];
  const ordered: T[] = [];
  let current: LatLng = start;
  while (remaining.length) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineMiles(current, remaining[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const [next] = remaining.splice(bestIdx, 1);
    ordered.push(next);
    current = next;
  }
  return twoOpt(start, ordered);
}

export interface Insertion {
  /** Index in `route` to insert before (route.length = append at the end). */
  insertAt: number;
  addedMinutes: number;
}

/** Cheapest place to insert `candidate` into an already-ordered `route`
 *  (anchored at `start`) — the marginal drive-time cost of adding one stop. */
export function cheapestInsertion<T extends LatLng>(
  start: LatLng,
  route: T[],
  candidate: LatLng,
): Insertion {
  const full: LatLng[] = [start, ...route];
  let best: Insertion = { insertAt: route.length, addedMinutes: Infinity };
  for (let i = 0; i < full.length; i++) {
    const a = full[i];
    const b: LatLng | undefined = full[i + 1];
    const removed = b ? estimateDriveMinutes(a, b) : 0;
    const added = estimateDriveMinutes(a, candidate) + (b ? estimateDriveMinutes(candidate, b) : 0);
    const delta = added - removed;
    if (delta < best.addedMinutes) best = { insertAt: i, addedMinutes: delta };
  }
  return best;
}

function fmtClock(minutesSinceMidnight: number): string {
  const m = Math.round(minutesSinceMidnight) % (24 * 60);
  const h24 = Math.floor(m / 60);
  const min = m % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(min).padStart(2, "0")} ${ampm}`;
}

export interface ItineraryStop {
  id: string;
  name: string;
  driveMinutesFromPrev: number;
  arrive: string;
  depart: string;
}

/** Walks the ordered stop list from a start time, allotting `minutesPerStop`
 *  at each — the timed itinerary shown to the user. */
export function buildItinerary(
  start: LatLng,
  stops: (LatLng & { id: string; name: string })[],
  startTimeMinutes: number,
  minutesPerStop: number,
): { stops: ItineraryStop[]; endMinutes: number; totalDriveMinutes: number } {
  let clock = startTimeMinutes;
  let prev: LatLng = start;
  let totalDriveMinutes = 0;
  const result: ItineraryStop[] = [];
  for (const s of stops) {
    const drive = estimateDriveMinutes(prev, s);
    totalDriveMinutes += drive;
    clock += drive;
    const arrive = fmtClock(clock);
    clock += minutesPerStop;
    result.push({ id: s.id, name: s.name, driveMinutesFromPrev: Math.round(drive), arrive, depart: fmtClock(clock) });
    prev = s;
  }
  return { stops: result, endMinutes: clock, totalDriveMinutes };
}

const MAX_STOPS_PER_LINK = 10; // origin + destination + waypoints, kept conservative

/** Builds one or more Google Maps turn-by-turn links (no API key — a plain
 *  deep link) covering the full stop sequence, split into "legs" if there
 *  are more stops than a single link comfortably supports. */
export function buildGoogleMapsLinks(points: LatLng[]): string[] {
  if (points.length < 2) return [];
  const links: string[] = [];
  for (let i = 0; i < points.length - 1; i += MAX_STOPS_PER_LINK - 1) {
    const chunk = points.slice(i, i + MAX_STOPS_PER_LINK);
    if (chunk.length < 2) break;
    const origin = chunk[0];
    const destination = chunk[chunk.length - 1];
    const waypoints = chunk.slice(1, -1);
    const params = new URLSearchParams({
      api: "1",
      origin: `${origin.lat},${origin.lng}`,
      destination: `${destination.lat},${destination.lng}`,
      travelmode: "driving",
    });
    if (waypoints.length) params.set("waypoints", waypoints.map((w) => `${w.lat},${w.lng}`).join("|"));
    links.push(`https://www.google.com/maps/dir/?${params.toString()}`);
  }
  return links;
}

export { routeMinutes };
