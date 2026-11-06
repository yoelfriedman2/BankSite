import { describe, it, expect } from "vitest";
import {
  shouldUseInPageCamera,
  fitWithin,
  cameraFileName,
  cameraErrorMessage,
  MAX_PHOTO_EDGE,
} from "./camera";

const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

describe("shouldUseInPageCamera", () => {
  it("uses the in-page camera on Android when getUserMedia exists", () => {
    expect(shouldUseInPageCamera({ userAgent: ANDROID_UA, hasGetUserMedia: true })).toBe(true);
  });
  it("falls back to the native input on Android without getUserMedia", () => {
    expect(shouldUseInPageCamera({ userAgent: ANDROID_UA, hasGetUserMedia: false })).toBe(false);
  });
  it("keeps the native camera input on iPhone", () => {
    expect(shouldUseInPageCamera({ userAgent: IPHONE_UA, hasGetUserMedia: true })).toBe(false);
  });
  it("keeps desktop behavior unchanged", () => {
    expect(shouldUseInPageCamera({ userAgent: DESKTOP_UA, hasGetUserMedia: true })).toBe(false);
  });
});

describe("fitWithin", () => {
  it("never scales up", () => {
    expect(fitWithin(1280, 720)).toEqual({ width: 1280, height: 720 });
  });
  it("caps the longest side, keeping the aspect ratio (portrait)", () => {
    const r = fitWithin(3024, 4032);
    expect(r.height).toBe(MAX_PHOTO_EDGE);
    expect(r.width).toBe(1920);
  });
  it("caps the longest side (landscape)", () => {
    expect(fitWithin(4000, 2000, 2000)).toEqual({ width: 2000, height: 1000 });
  });
  it("returns zero for a video with no frame yet", () => {
    expect(fitWithin(0, 0)).toEqual({ width: 0, height: 0 });
  });
});

describe("cameraFileName", () => {
  it("builds a dated .jpg name", () => {
    expect(cameraFileName(new Date(2026, 10, 6, 14, 3, 5))).toBe("photo-2026-11-06-140305.jpg");
  });
});

describe("cameraErrorMessage", () => {
  it("explains a blocked permission", () => {
    expect(cameraErrorMessage({ name: "NotAllowedError" })).toMatch(/blocked/);
  });
  it("explains a missing camera", () => {
    expect(cameraErrorMessage({ name: "NotFoundError" })).toMatch(/No camera/);
  });
  it("has a generic fallback", () => {
    expect(cameraErrorMessage(new Error("x"))).toBe("Couldn't open the camera.");
  });
});
