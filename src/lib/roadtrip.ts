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

/** One bank and its candidate branch coordinates, for the branch optimizer. */
export interface OptimizerBank<B extends LatLng & { id: string }> {
  id: string;
  branches: B[];
}

/**
 * Jointly choose ONE branch per bank so the whole route is as short as possible.
 *
 * Picking each bank's nearest-to-the-anchor branch in isolation is greedy and
 * misses the case the user actually cares about: "I want 3 banks, give me the
 * locations closest to each other so I drive the least." This does coordinate
 * descent — order the stops with the current branch picks, then re-pick each
 * bank's branch for its real neighbours in that order, and repeat until nothing
 * moves. Distances stand in for drive time (monotonic here), which keeps it a
 * pure, dependency-free computation. Stop counts are a day's worth of banks, so
 * a handful of passes is plenty and cheap.
 *
 * `start` is the fixed first point (the anchor bank's chosen branch, or home).
 * `locked[bankId] = branchId` pins a bank to a specific branch (a manual
 * override the user set), and `returnTo` — when the trip ends back at a fixed
 * place (home / a hotel) — lets the last stop's branch account for that final
 * drive too. Returns `{ bankId: branchId }` for every bank that has branches.
 */
export function chooseBranchesForRoute<B extends LatLng & { id: string }>(
  start: LatLng,
  banks: OptimizerBank<B>[],
  opts: { returnTo?: LatLng | null; locked?: Record<string, string>; maxPasses?: number } = {},
): Record<string, string> {
  const locked = opts.locked ?? {};
  const returnTo = opts.returnTo ?? null;
  const maxPasses = opts.maxPasses ?? 4;

  const nearestTo = (ref: LatLng, brs: B[]): B =>
    brs.reduce((best, b) => (haversineMiles(ref, b) < haversineMiles(ref, best) ? b : best));

  // Seed each bank with its locked branch (if any) or the branch nearest `start`.
  const chosen: Record<string, B> = {};
  for (const bank of banks) {
    if (bank.branches.length === 0) continue;
    const lockedBranch = locked[bank.id] ? bank.branches.find((b) => b.id === locked[bank.id]) : undefined;
    chosen[bank.id] = lockedBranch ?? nearestTo(start, bank.branches);
  }

  for (let pass = 0; pass < maxPasses; pass++) {
    const chosenPoints = banks
      .filter((b) => chosen[b.id])
      .map((b) => ({ ...chosen[b.id], bankId: b.id }));
    // orderStops only reads lat/lng off `start`; cast so it keeps the bankId tag
    // on the returned stops instead of widening the generic to a bare LatLng.
    const ordered = orderStops(start as unknown as (typeof chosenPoints)[number], chosenPoints);
    // seq[0] = start, ordered[i] sits at seq[i+1], optional returnTo closes it.
    const seq: LatLng[] = [start, ...ordered, ...(returnTo ? [returnTo] : [])];

    let changed = false;
    ordered.forEach((o, i) => {
      const bankId = o.bankId;
      if (locked[bankId]) return;
      const bank = banks.find((b) => b.id === bankId);
      if (!bank) return;
      const prev = seq[i];
      const next: LatLng | undefined = seq[i + 2];
      const cost = (br: LatLng) => haversineMiles(prev, br) + (next ? haversineMiles(br, next) : 0);
      let best = chosen[bankId];
      let bestCost = cost(best);
      for (const br of bank.branches) {
        const c = cost(br);
        if (c < bestCost - 1e-9) {
          bestCost = c;
          best = br;
        }
      }
      if (best.id !== chosen[bankId].id) {
        chosen[bankId] = best;
        seq[i + 1] = best; // keep the working sequence consistent within the pass
        changed = true;
      }
    });
    if (!changed) break;
  }

  const result: Record<string, string> = {};
  for (const bank of banks) if (chosen[bank.id]) result[bank.id] = chosen[bank.id].id;
  return result;
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

export interface DayPlan {
  dayIndex: number; // 0-based
  stops: ItineraryStop[];
}

/**
 * Splits an ordered stop sequence into days, each bounded by the same daily
 * start/end time window. A day always gets at least one stop (so a single
 * very long stop can't stall the trip forever) — otherwise a stop that would
 * push the day past its end time rolls into the next day instead. There's no
 * overnight drive charged between days: you're assumed to end a day wherever
 * the last stop left off and simply continue from there the next morning.
 */
export function buildMultiDayItinerary(
  start: LatLng,
  stops: (LatLng & { id: string; name: string })[],
  dailyStartMinutes: number,
  dailyEndMinutes: number,
  minutesPerStop: number,
): { days: DayPlan[]; totalDriveMinutes: number } {
  const days: DayPlan[] = [];
  let dayStops: ItineraryStop[] = [];
  let clock = dailyStartMinutes;
  let prev: LatLng = start;
  let totalDriveMinutes = 0;

  const pushDay = () => {
    if (dayStops.length) days.push({ dayIndex: days.length, stops: dayStops });
    dayStops = [];
  };

  stops.forEach((s, i) => {
    const driveFromPrev = i === 0 ? 0 : estimateDriveMinutes(prev, s);
    const startsNewDay = dayStops.length > 0 && clock + driveFromPrev + minutesPerStop > dailyEndMinutes;
    if (startsNewDay) {
      pushDay();
      clock = dailyStartMinutes;
    }
    // The first stop of any day begins fresh at the daily start time. The drive
    // from home (day 1) or the previous night's lodging (later days) happens
    // off banking-hours and is surfaced separately by the caller, so it isn't
    // charged against the day's window or counted here between-days.
    const drive = i === 0 || startsNewDay ? 0 : driveFromPrev;
    clock += drive;
    totalDriveMinutes += drive;
    const arrive = fmtClock(clock);
    clock += minutesPerStop;
    dayStops.push({ id: s.id, name: s.name, driveMinutesFromPrev: Math.round(drive), arrive, depart: fmtClock(clock) });
    prev = s;
  });
  pushDay();

  return { days, totalDriveMinutes };
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

/** Everything a coordinate lookup found (or didn't) in a pasted Maps link. */
export interface ParsedMapsLink {
  points: LatLng[];
  /** Segments that looked like a stop but weren't a bare "lat,lng" pair (a place name, usually) —
   *  surfaced so the import UI can say "N stops couldn't be auto-matched" rather than pretend
   *  every stop in the original trip was found. */
  unmatchedSegments: string[];
}

const COORD_RE = /^-?\d{1,3}(?:\.\d+)?,-?\d{1,3}(?:\.\d+)?$/;

function coordFromSegment(raw: string): LatLng | null {
  const s = raw.trim();
  if (!COORD_RE.test(s)) return null;
  const [lat, lng] = s.split(",").map(Number);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}

/**
 * Extracts stop coordinates from a Google Maps directions link. Handles two
 * shapes: the `?api=1&origin=...&destination=...&waypoints=a|b` deep-link
 * format (what this app generates, and what most "share" buttons produce),
 * and the browser address-bar `/maps/dir/A/B/C/@lat,lng,zoom` format, where
 * each `/`-separated segment is either a "lat,lng" pair or a place name.
 * Place names can't be resolved to coordinates without a geocoding service,
 * so they come back as `unmatchedSegments` rather than silently dropped.
 */
export function parseGoogleMapsLink(rawUrl: string): ParsedMapsLink {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return { points: [], unmatchedSegments: [] };
  }

  const points: LatLng[] = [];
  const unmatchedSegments: string[] = [];
  const addSegment = (raw: string | null) => {
    if (!raw) return;
    const p = coordFromSegment(raw);
    if (p) points.push(p);
    else unmatchedSegments.push(raw);
  };

  const origin = url.searchParams.get("origin");
  const destination = url.searchParams.get("destination");
  if (origin || destination) {
    addSegment(origin);
    const waypoints = url.searchParams.get("waypoints");
    if (waypoints) for (const w of waypoints.split("|")) addSegment(w);
    addSegment(destination);
    return { points, unmatchedSegments };
  }

  const dirMatch = url.pathname.match(/\/dir\/(.+)/);
  if (dirMatch) {
    for (const seg of dirMatch[1].split("/").filter(Boolean)) {
      if (seg.startsWith("@")) continue; // map view center, not a stop
      addSegment(decodeURIComponent(seg.replace(/\+/g, " ")));
    }
  }

  return { points, unmatchedSegments };
}

/** Nearest candidate to `point`, but only if it's within `toleranceMiles` —
 *  used to reverse-match a coordinate from an imported link back to a real
 *  bank branch. Returns null rather than a wildly-off guess. */
export function nearestWithinTolerance<T extends LatLng>(
  point: LatLng,
  candidates: T[],
  toleranceMiles = 0.3,
): T | null {
  let best: T | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = haversineMiles(point, c);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best && bestDist <= toleranceMiles ? best : null;
}

export { routeMinutes };
