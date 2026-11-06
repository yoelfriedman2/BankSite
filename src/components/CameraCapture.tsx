"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Check, Loader2, RotateCcw, X } from "lucide-react";
import { useFocusTrap } from "@/lib/useFocusTrap";
import {
  CAMERA_CONSTRAINTS,
  JPEG_QUALITY,
  cameraErrorMessage,
  cameraFileName,
  fitWithin,
} from "@/lib/camera";

type Phase = "starting" | "live" | "review" | "error";

/** Full-screen in-page camera: live viewfinder, Snap, Retake, Use photo,
 *  Cancel. Used where the native `capture` input doesn't open the camera
 *  (the installed Android app — see src/lib/camera.ts). The photo it hands
 *  back is an ordinary JPEG `File`, fed into the caller's existing upload
 *  handler, so size limits, compression and checks are unchanged.
 *
 *  `onFallback` is offered when the camera can't be opened (no permission,
 *  no camera): the caller clicks its existing `capture` input. It runs from
 *  a button tap so the browser still treats it as a user gesture.
 *
 *  Rendered through a portal with `data-camera-capture`, so a parent
 *  sheet's outside-click handler can tell taps in here aren't "outside". */
export function CameraCapture({
  onCapture,
  onClose,
  onFallback,
}: {
  onCapture: (file: File) => void;
  onClose: () => void;
  onFallback: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [error, setError] = useState<string | null>(null);
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null);
  const dialogRef = useFocusTrap<HTMLDivElement>(() => onClose());

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  // Open the camera once on mount; always release it on unmount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => {});
        }
        setPhase("live");
      } catch (e) {
        if (cancelled) return;
        setError(cameraErrorMessage(e));
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, []);

  // Free the preview image's memory when it's replaced or the modal closes.
  useEffect(() => {
    return () => {
      if (shot) URL.revokeObjectURL(shot.url);
    };
  }, [shot]);

  function snap() {
    const v = videoRef.current;
    if (!v || !v.videoWidth || !v.videoHeight) return;
    const { width, height } = fitWithin(v.videoWidth, v.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, width, height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("Couldn't take the photo. Try again.");
          return;
        }
        setError(null);
        setShot({ blob, url: URL.createObjectURL(blob) });
        setPhase("review");
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  }

  function retake() {
    setShot(null);
    setPhase("live");
  }

  function acceptPhoto() {
    if (!shot) return;
    const file = new File([shot.blob], cameraFileName(new Date()), { type: "image/jpeg" });
    stopStream();
    onCapture(file);
    onClose();
  }

  function cancel() {
    stopStream();
    onClose();
  }

  function fallback() {
    stopStream();
    onFallback();
    onClose();
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={dialogRef}
      data-camera-capture
      role="dialog"
      aria-modal="true"
      aria-label="Take a photo"
      // Portaled, but React still bubbles events up the component tree:
      // keep taps in here from reaching a parent sheet's close handlers.
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="fixed inset-0 z-[80] flex flex-col bg-black text-white"
    >
      <div className="relative min-h-0 flex-1">
        {/* The viewfinder stays mounted during review so Retake is instant. */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`h-full w-full object-contain ${phase === "review" ? "invisible" : ""}`}
        />
        {phase === "review" && shot && (
          <img src={shot.url} alt="Photo preview" className="absolute inset-0 h-full w-full object-contain" />
        )}
        {phase === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-white/80" />
          </div>
        )}
        {phase === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
            <p className="text-sm text-white/90">{error}</p>
            <button
              type="button"
              onClick={fallback}
              className="flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
            >
              <Camera className="h-4 w-4" />
              Use camera app
            </button>
          </div>
        )}
        {phase !== "error" && error && (
          <p className="absolute inset-x-0 top-4 mx-auto w-fit rounded-lg bg-rose-600/90 px-3 py-1.5 text-xs">{error}</p>
        )}
      </div>

      <div
        className="flex items-center justify-between gap-3 bg-black px-6 pt-4"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        {phase === "review" ? (
          <>
            <button
              type="button"
              onClick={retake}
              className="flex items-center gap-1.5 rounded-lg border border-white/40 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
            >
              <RotateCcw className="h-4 w-4" />
              Retake
            </button>
            <button
              type="button"
              onClick={acceptPhoto}
              className="flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
            >
              <Check className="h-4 w-4" />
              Use photo
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={cancel}
              className="flex items-center gap-1.5 rounded-lg border border-white/40 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
            >
              <X className="h-4 w-4" />
              Cancel
            </button>
            <button
              type="button"
              onClick={snap}
              disabled={phase !== "live"}
              aria-label="Snap"
              className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/20 disabled:opacity-40"
            >
              <span className="h-12 w-12 rounded-full bg-white" />
            </button>
            {/* Spacer keeps the Snap button centered. */}
            <span className="w-[88px]" aria-hidden />
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
