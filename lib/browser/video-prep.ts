import { fitWithin } from "@/lib/browser/image-prep";
import { FRAME_MAX_BYTES, FRAME_MAX_EDGE, FRAMES_MAX_TOTAL_BYTES, frameTimestamps, VIDEO_MAX_DURATION_SECONDS } from "@/lib/video-frames";

export const VIDEO_SOURCE_MAX_BYTES = 500 * 1024 * 1024;
const LOAD_TIMEOUT_MS = 15_000;
const SEEK_TIMEOUT_MS = 10_000;
const QUALITIES = [0.8, 0.65, 0.5];

export type ExtractedFrames = { duration: number; timestamps: number[]; frames: Blob[] };

export class VideoDecodeError extends Error {
  constructor() {
    super("browser_cannot_decode_video");
    this.name = "VideoDecodeError";
  }
}

export class VideoTooLongError extends Error {
  constructor() {
    super("video_too_long");
    this.name = "VideoTooLongError";
  }
}

function waitFor(video: HTMLVideoElement, event: "loadeddata" | "seeked", timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener(event, onDone);
      video.removeEventListener("error", onError);
    };
    const onDone = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new VideoDecodeError());
    };
    const timer = window.setTimeout(onError, timeoutMs);
    video.addEventListener(event, onDone, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new VideoDecodeError())), "image/jpeg", quality);
  });
}

async function encodeFrames(canvases: HTMLCanvasElement[]): Promise<Blob[]> {
  for (const quality of QUALITIES) {
    const frames = await Promise.all(canvases.map((canvas) => toJpeg(canvas, quality)));
    const total = frames.reduce((sum, frame) => sum + frame.size, 0);
    if (total <= FRAMES_MAX_TOTAL_BYTES && frames.every((frame) => frame.size <= FRAME_MAX_BYTES)) return frames;
  }
  throw new VideoDecodeError();
}

export async function extractKeyframes(file: Blob, onProgress?: (done: number, total: number) => void): Promise<ExtractedFrames> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await waitFor(video, "loadeddata", LOAD_TIMEOUT_MS);
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0 || video.videoWidth === 0 || video.videoHeight === 0) throw new VideoDecodeError();
    if (duration > VIDEO_MAX_DURATION_SECONDS) throw new VideoTooLongError();

    const timestamps = frameTimestamps(duration);
    const size = fitWithin(video.videoWidth, video.videoHeight, FRAME_MAX_EDGE);
    const canvases: HTMLCanvasElement[] = [];
    for (const [index, timestamp] of timestamps.entries()) {
      const seeked = waitFor(video, "seeked", SEEK_TIMEOUT_MS);
      video.currentTime = timestamp;
      await seeked;
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext("2d");
      if (!context) throw new VideoDecodeError();
      context.drawImage(video, 0, 0, size.width, size.height);
      canvases.push(canvas);
      onProgress?.(index + 1, timestamps.length);
    }
    return { duration, timestamps, frames: await encodeFrames(canvases) };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
