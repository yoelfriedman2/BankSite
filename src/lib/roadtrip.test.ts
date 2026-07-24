import { describe, it, expect } from "vitest";
import { haversineMiles, parseGoogleMapsLink, nearestWithinTolerance, type LatLng } from "./roadtrip";

describe("haversineMiles", () => {
  it("is 0 for the same point", () => {
    const p: LatLng = { lat: 40.7128, lng: -74.006 };
    expect(haversineMiles(p, p)).toBeCloseTo(0, 6);
  });

  it("matches a known real-world distance (NYC to Philadelphia, ~80mi great-circle)", () => {
    const nyc: LatLng = { lat: 40.7128, lng: -74.006 };
    const philly: LatLng = { lat: 39.9526, lng: -75.1652 };
    const dist = haversineMiles(nyc, philly);
    expect(dist).toBeGreaterThan(75);
    expect(dist).toBeLessThan(90);
  });

  it("is symmetric", () => {
    const a: LatLng = { lat: 40.7128, lng: -74.006 };
    const b: LatLng = { lat: 34.0522, lng: -118.2437 };
    expect(haversineMiles(a, b)).toBeCloseTo(haversineMiles(b, a), 6);
  });
});

describe("parseGoogleMapsLink", () => {
  it("parses the ?api=1 deep-link format with origin/waypoints/destination", () => {
    const url =
      "https://www.google.com/maps/dir/?api=1&origin=40.1,-74.1&waypoints=40.2,-74.2|40.3,-74.3&destination=40.4,-74.4";
    const result = parseGoogleMapsLink(url);
    expect(result.points).toEqual([
      { lat: 40.1, lng: -74.1 },
      { lat: 40.2, lng: -74.2 },
      { lat: 40.3, lng: -74.3 },
      { lat: 40.4, lng: -74.4 },
    ]);
    expect(result.unmatchedSegments).toEqual([]);
  });

  it("parses the browser /dir/A/B/@lat,lng share-link format", () => {
    const url = "https://www.google.com/maps/dir/40.1,-74.1/40.2,-74.2/@40.15,-74.15,12z";
    const result = parseGoogleMapsLink(url);
    expect(result.points).toEqual([
      { lat: 40.1, lng: -74.1 },
      { lat: 40.2, lng: -74.2 },
    ]);
  });

  it("returns a place-name segment as unmatched instead of guessing", () => {
    const url = "https://www.google.com/maps/dir/Some+Bank+Branch/40.2,-74.2";
    const result = parseGoogleMapsLink(url);
    expect(result.points).toEqual([{ lat: 40.2, lng: -74.2 }]);
    expect(result.unmatchedSegments).toContain("Some Bank Branch");
  });

  it("does not throw on a malformed percent-escape (GAP-04 regression guard)", () => {
    // decodeURIComponent throws a raw URIError on a truncated/malformed
    // percent-escape (confirmed reproducible with this exact input) — this
    // must be caught and reported as an unmatched segment, not crash the import.
    const url = "https://www.google.com/maps/dir/%E0%A4%A/40.2,-74.2";
    expect(() => parseGoogleMapsLink(url)).not.toThrow();
    const result = parseGoogleMapsLink(url);
    expect(result.points).toEqual([{ lat: 40.2, lng: -74.2 }]);
  });

  it("returns empty results for a garbage URL instead of throwing", () => {
    expect(() => parseGoogleMapsLink("not a url at all")).not.toThrow();
    expect(parseGoogleMapsLink("not a url at all")).toEqual({ points: [], unmatchedSegments: [] });
  });

  it("rejects an out-of-range lat/lng as an unmatched segment, not a bogus point", () => {
    const url = "https://www.google.com/maps/dir/999,999/40.2,-74.2";
    const result = parseGoogleMapsLink(url);
    expect(result.points).toEqual([{ lat: 40.2, lng: -74.2 }]);
    expect(result.unmatchedSegments).toContain("999,999");
  });
});

describe("nearestWithinTolerance", () => {
  const candidates: (LatLng & { id: string })[] = [
    { id: "a", lat: 40.0, lng: -74.0 },
    { id: "b", lat: 41.0, lng: -75.0 },
  ];

  it("returns the nearest candidate within tolerance", () => {
    const match = nearestWithinTolerance({ lat: 40.001, lng: -74.001 }, candidates, 1);
    expect(match?.id).toBe("a");
  });

  it("returns null when nothing is within tolerance", () => {
    const match = nearestWithinTolerance({ lat: 10, lng: 10 }, candidates, 0.3);
    expect(match).toBeNull();
  });
});
