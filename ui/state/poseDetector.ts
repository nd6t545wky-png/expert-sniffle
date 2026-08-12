import type { Frame, KinematicView } from "../../src/domain/kinematics";
import { Handedness, PoseResult, poseToFrame } from "../../src/domain/poseMapping";

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
  let runner: PoseRunner;
  try {
    loading = loading ?? load();
    runner = await loading;
  } catch (cause) {
    // A failed load must not poison every later attempt.
    loading = null;
    throw new PoseUnavailable(
      cause instanceof Error && /wasm|WebAssembly/i.test(cause.message)
        ? "This browser would not start the pose model. Tap the points yourself — everything else works the same."
        : "The pose model could not be downloaded. Check your connection, or tap the points yourself."
    );
  }

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
