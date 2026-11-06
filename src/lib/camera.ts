/** Helpers for the in-page camera (CameraCapture.tsx).
 *
 *  Why an in-page camera at all: the installed Android app (a Trusted Web
 *  Activity) ignores the `capture="environment"` hint on a file input and
 *  shows the file picker instead of opening the camera. Opening the camera
 *  ourselves with getUserMedia works there. iPhones honor `capture` and
 *  open the real camera app, so they keep the native input. */

/** The longest side, in pixels, of a photo taken in-page. Big enough to read
 *  a statement's small print, small enough to upload quickly (≈1–2 MB JPEG). */
export const MAX_PHOTO_EDGE = 2560;

export const JPEG_QUALITY = 0.9;

/** Ask for the rear camera at a high resolution. `ideal` (not `exact`) so a
 *  phone with only a front camera, or a lower-res one, still opens. */
export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 2560 },
    height: { ideal: 1440 },
  },
};

/** Use the in-page camera instead of the native `capture` input?
 *  Only on Android phones/tablets that support getUserMedia. Everything
 *  else (iPhone, desktop) keeps the existing input exactly as before. */
export function shouldUseInPageCamera(env: {
  userAgent: string;
  hasGetUserMedia: boolean;
}): boolean {
  if (!env.hasGetUserMedia) return false;
  return /Android/i.test(env.userAgent);
}

/** Read the current browser's environment for shouldUseInPageCamera. */
export function browserCameraEnv(): { userAgent: string; hasGetUserMedia: boolean } {
  if (typeof navigator === "undefined") return { userAgent: "", hasGetUserMedia: false };
  return {
    userAgent: navigator.userAgent ?? "",
    hasGetUserMedia: typeof navigator.mediaDevices?.getUserMedia === "function",
  };
}

/** Scale (w, h) down so the longest side is at most `max`; never scales up. */
export function fitWithin(w: number, h: number, max: number = MAX_PHOTO_EDGE): { width: number; height: number } {
  if (w <= 0 || h <= 0) return { width: 0, height: 0 };
  const longest = Math.max(w, h);
  if (longest <= max) return { width: Math.round(w), height: Math.round(h) };
  const s = max / longest;
  return { width: Math.round(w * s), height: Math.round(h * s) };
}

/** A phone-camera-like filename, e.g. "photo-2026-11-06-143005.jpg". */
export function cameraFileName(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `photo-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.jpg`;
}

/** Plain-words message for a getUserMedia failure. */
export function cameraErrorMessage(err: unknown): string {
  const name = err && typeof err === "object" && "name" in err ? String((err as { name: unknown }).name) : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera access is blocked. Allow the camera for this app in your phone's settings, or use your camera app instead.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera was found on this device.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "The camera is busy in another app. Close it and try again.";
  }
  return "Couldn't open the camera.";
}
