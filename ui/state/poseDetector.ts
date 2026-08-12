import type { Frame, KinematicView } from "../../src/domain/kinematics";
import { Handedness, PoseResult, poseToFrame } from "../../src/domain/poseMapping";
import type { PoseSample } from "../../src/domain/poseSequence";

/**
 * Loading the pose model, on demand and never before.
 *
 * The model and its WebAssembly runtime are about 17 MB. Bundling them into
 * the app would make every first load pay for a feature most sessions never
 * touch, so both are fetched the first time the athlete asks for them and
 * cached by the service worker afterwards — which also means the second and
 * later uses work with no signal.
 *
 * Everything here is failure-tolerant on purpose. Automatic placement is an
 * assist on top of a tool that already works by hand: if the runtime will not
 * load, the athlete taps the points exactly as before and is told why, rather
 * than being left with a button that does nothing.
 */

let loading: Promise<PoseRunner> | null = null;

interface PoseRunner {
  detect(video: HTMLVideoElement, timestampMs: number): { landmarks: unknown[][] } | null;
}

async function load(): Promise<PoseRunner> {
  // Imported dynamically so the library never enters the main bundle.
  const vision = await import("@mediapipe/tasks-vision");
  const fileset = await vision.FilesetResolver.forVisionTasks("/pose");
  const landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: "/pose/pose_landmarker_lite.task" },
    runningMode: "VIDEO",
    numPoses: 1,
  });
  return {
    detect: (video, timestampMs) =>
      landmarker.detectForVideo(video, timestampMs) as { landmarks: unknown[][] } | null,
  };
}

/** True once the model is in memory, so the UI can stop saying "downloading". */
export function poseReady(): boolean {
  return loading !== null;
}

export class PoseUnavailable extends Error {}

/** Frames a clip is sampled at. Fine enough to catch release, cheap enough to run. */
export const SAMPLE_FPS = 30;

/**
 * Walk the whole clip, collecting a pose per sampled frame.
 *
 * Seeking and waiting per frame is slower than decoding in a stream, and it is
 * the only approach that works the same way in every browser — `requestVideoFrameCallback`
 * is still not universal. A delivery is a second or two, so the cost is bounded.
 */
export async function samplePoses(
  video: HTMLVideoElement,
  onProgress?: (fraction: number) => void
): Promise<PoseSample[]> {
  const runner = await runnerFor();
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  if (duration <= 0) return [];

  const wasPlaying = !video.paused;
  video.pause();
  const startedAt = video.currentTime;

  const step = 1 / SAMPLE_FPS;
  const samples: PoseSample[] = [];

  for (let t = 0; t < duration; t += step) {
    await seek(video, t);
    const result = runner.detect(video, Math.round(t * 1000));
    const landmarks = result?.landmarks?.[0];
    if (Array.isArray(landmarks) && landmarks.length) {
      samples.push({ timeSeconds: t, landmarks: landmarks as never });
    }
    onProgress?.(Math.min(1, t / duration));
  }

  await seek(video, startedAt);
  if (wasPlaying) void video.play();
  return samples;
}

function seek(video: HTMLVideoElement, to: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      resolve();
    };
    video.addEventListener("seeked", done);
    video.currentTime = to;
    // A seek to a time the browser is already at fires nothing.
    if (Math.abs(video.currentTime - to) < 0.001) done();
  });
}

async function runnerFor(): Promise<PoseRunner> {
  try {
    loading = loading ?? load();
    return await loading;
  } catch (cause) {
    loading = null;
    throw new PoseUnavailable(
      cause instanceof Error && /wasm|WebAssembly/i.test(cause.message)
        ? "This browser would not start the pose model. Tap the points yourself — everything else works the same."
        : "The pose model could not be downloaded. Check your connection, or tap the points yourself."
    );
  }
}

/**
 * Find this app's landmarks in the video's current frame.
 *
 * Returns the frame with the model's points merged under any the athlete has
 * already placed, plus the ids it could not find.
 */
export async function detectFrame(
  video: HTMLVideoElement,
  view: KinematicView,
  hand: Handedness,
  existing: Frame
): Promise<PoseResult> {
  const runner = await runnerFor();

  const result = runner.detect(video, Math.round(video.currentTime * 1000));
  const landmarks = result?.landmarks?.[0];
  if (!Array.isArray(landmarks) || landmarks.length === 0) {
    // An empty `unplaced` here would be read downstream as "found everything",
    // so a frame with no body in it reported total success while placing
    // nothing. Hand back the full list of what was wanted instead.
    return poseToFrame([], view, hand, existing);
  }
  return poseToFrame(landmarks as never, view, hand, existing);
}
