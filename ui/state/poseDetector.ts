import type { Frame, KinematicView } from "../../src/domain/kinematics";
import { Handedness, PoseResult, poseToFrame } from "../../src/domain/poseMapping";
import { CrowdSample, PoseSample, chooseSubject } from "../../src/domain/poseSequence";

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
    numPoses: 4,
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
 * How fast the clip is played while being read.
 *
 * Each frame costs one pose detection, and playback does not wait for it — so
 * on a slow phone the frames that arrive while a detection is running are
 * simply missed. Playing at half speed halves the media time that passes per
 * detection, which doubles the sample density on exactly the devices that
 * need it and costs nothing on a device that was already keeping up. The
 * price is wall-clock: a three-second delivery takes six seconds to read.
 */
const READ_RATE = 0.5;

type FrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: VideoFrameRequestCallback) => number;
};

/**
 * Walk the whole clip, collecting a pose per sampled frame.
 *
 * This plays the clip rather than stepping through it, because stepping does
 * not reliably work. `seeked` fires when the browser has *located* a frame,
 * not when it has decoded and presented one, and there is no event that
 * means "the seek you asked for is now readable" — so reading the video into
 * the pose model after a seek can hand back whatever was there before. On a
 * real bullpen clip that produced 217 identical poses, hip fixed to three
 * decimal places for seven seconds: flat trajectories, nonsense checkpoints,
 * handedness decided by a coin toss. Playing the clip and taking the frames
 * the browser says it has painted gives moving frames every time.
 *
 * Seeking survives as the fallback for browsers without
 * `requestVideoFrameCallback`, where it is the only option available.
 */
export async function samplePoses(
  video: HTMLVideoElement,
  onProgress?: (fraction: number) => void
): Promise<PoseSample[]> {
  const runner = await runnerFor();
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  if (duration <= 0) return [];

  const wasPlaying = !video.paused;
  const startedAt = video.currentTime;
  const rate = video.playbackRate;
  const muted = video.muted;
  video.pause();

  const crowd: CrowdSample[] = [];
  const take = (timeSeconds: number) => {
    const result = runner.detect(video, Math.round(timeSeconds * 1000));
    const people = result?.landmarks;
    if (Array.isArray(people) && people.length) {
      crowd.push({ timeSeconds, people: people as never });
    }
    onProgress?.(Math.min(1, timeSeconds / duration));
  };

  const withFrameCallback = video as FrameCallbackVideo;
  if (typeof withFrameCallback.requestVideoFrameCallback === "function") {
    await readByPlaying(withFrameCallback, duration, take);
  } else {
    for (let t = 0; t < duration; t += 1 / SAMPLE_FPS) {
      await seek(video, t);
      take(t);
    }
  }

  video.pause();
  video.playbackRate = rate;
  video.muted = muted;
  await seek(video, startedAt);
  if (wasPlaying) void video.play();
  // A bullpen clip nearly always has a catcher or team-mate in it. The pitcher
  // is the one who moves.
  return chooseSubject(crowd);
}

/**
 * Play the clip through, reading each frame the browser reports painting.
 *
 * The callback fires once per presented frame and carries the media time of
 * that exact frame, so the timestamps are the real ones rather than a counter
 * that assumes nothing was missed. Frames closer together than the sample
 * rate are skipped: past thirty a second there is nothing left to see.
 */
function readByPlaying(
  video: FrameCallbackVideo,
  duration: number,
  take: (timeSeconds: number) => void
): Promise<void> {
  const request = video.requestVideoFrameCallback;
  if (!request) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener("ended", finish);
      video.removeEventListener("error", finish);
      resolve();
    };

    let last = -Infinity;
    const step: VideoFrameRequestCallback = (_now, metadata) => {
      if (settled) return;
      const t = Number.isFinite(metadata?.mediaTime) ? metadata.mediaTime : video.currentTime;
      if (t - last >= 1 / SAMPLE_FPS - 0.005) {
        last = t;
        take(t);
      }
      if (video.ended) {
        finish();
        return;
      }
      request.call(video, step);
    };

    video.addEventListener("ended", finish);
    video.addEventListener("error", finish);
    // A clip that stalls mid-decode must not leave the athlete waiting forever.
    setTimeout(finish, Math.max(20_000, (duration / READ_RATE) * 1000 * 3));

    video.muted = true;
    video.currentTime = 0;
    video.playbackRate = READ_RATE;
    request.call(video, step);
    const started = video.play();
    if (started && typeof started.catch === "function") started.catch(() => finish());
  });
}

/**
 * Seek, and wait for the new frame to be presented if the browser will say so.
 *
 * Used to restore the playhead after a read, and to step through the clip on
 * browsers that cannot drive the read from playback. A timeout keeps a
 * stalled decode from hanging the run.
 */
function seek(video: HTMLVideoElement, to: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      const withFrameCallback = video as FrameCallbackVideo;
      if (typeof withFrameCallback.requestVideoFrameCallback === "function") {
        withFrameCallback.requestVideoFrameCallback(() => done());
      } else {
        requestAnimationFrame(() => requestAnimationFrame(() => done()));
      }
    };

    video.addEventListener("seeked", onSeeked);
    video.currentTime = to;
    // A decode that never completes must not stall the whole clip.
    setTimeout(done, 500);
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
