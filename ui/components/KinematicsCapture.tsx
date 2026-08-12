import { useEffect, useMemo, useRef, useState } from "react";
import { IsoDate } from "../../src/domain/state";
import { CHECKPOINTS } from "../../src/domain/mechanicsDrills";
import { MechanicsVideo } from "../../src/domain/api";
import {
  Capture,
  KinematicView,
  LANDMARKS,
  Point,
  VIEW_LABELS,
  captureProgress,
  intervalMs,
  kinematicFindings,
  leadLegBlock,
  measurementHistory,
  readFrame,
} from "../../src/domain/kinematics";
import { Alert, EmptyState } from "./Page";
import { ConfirmButton } from "./ConfirmButton";

/**
 * Measured kinematics: scrub to a checkpoint, tap the body points, read the
 * angles.
 *
 * The mechanics screen rates six qualities one to five. This produces degrees
 * and milliseconds from the athlete's own video, by hand — which is slower
 * than a pose model and has the advantage that every number can be traced back
 * to a tap. A figure that looks wrong is a tap in the wrong place, not a model
 * that cannot be argued with.
 *
 * The video box is given the video's own aspect ratio so the frame fills it
 * exactly. That is not cosmetic: a letterboxed video would put the taps in a
 * different coordinate space from the picture, and every angle would be
 * measured against black bars.
 */

export interface KinematicsCaptureProps {
  date: IsoDate;
  captures: Capture[];
  onSave: (capture: Capture) => void;
  onRemove: (id: string) => void;
  /** Uploaded videos, when the athlete is signed in to the cloud. */
  videos?: MechanicsVideo[];
}

const FRAME_STEP = 1 / 30;

function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function fresh(date: IsoDate, view: KinematicView): Capture {
  return { id: newId(), date, view, aspect: 16 / 9, times: {}, frames: {} };
}

export function KinematicsCapture({
  date,
  captures,
  onSave,
  onRemove,
  videos,
}: KinematicsCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [draft, setDraft] = useState<Capture>(() => fresh(date, "side"));
  const [checkpoint, setCheckpoint] = useState(CHECKPOINTS[0].key);

  // A local file becomes an object URL, which has to be released or the blob
  // stays in memory for the life of the page.
  useEffect(() => {
    return () => {
      if (source.startsWith("blob:")) URL.revokeObjectURL(source);
    };
  }, [source]);

  const marks = LANDMARKS[draft.view];
  const frame = draft.frames[checkpoint] ?? {};
  const next = marks.find((mark) => !frame[mark.id]) ?? null;
  const readings = readFrame(draft, checkpoint);
  const block = leadLegBlock(draft);
  const findings = kinematicFindings(readings, block);
  const progress = captureProgress(
    draft,
    CHECKPOINTS.map((point) => point.key)
  );

  const strikeToRelease = intervalMs(draft, "footStrike", "release");
  const liftToStrike = intervalMs(draft, "maxLegLift", "footStrike");

  const history = useMemo(
    () =>
      readings
        .filter((reading) => reading.value !== null)
        .map((reading) => ({
          reading,
          points: measurementHistory(captures, reading.measurement.id, checkpoint),
        })),
    [captures, readings, checkpoint]
  );

  function openFile(file: File) {
    if (source.startsWith("blob:")) URL.revokeObjectURL(source);
    setSource(URL.createObjectURL(file));
    setSourceName(file.name);
    setDraft((current) => ({ ...current, videoId: undefined }));
  }

  function openLibrary(video: MechanicsVideo) {
    if (source.startsWith("blob:")) URL.revokeObjectURL(source);
    setSource(video.playbackUrl);
    setSourceName(video.fileName || "Uploaded video");
    setDraft((current) => ({ ...current, videoId: video.id }));
  }

  /** Record the video's current time as this checkpoint's frame. */
  function markFrame() {
    const video = videoRef.current;
    if (!video) return;
    setDraft((current) => ({
      ...current,
      // The aspect ratio has to come off the video itself. Assuming 16:9 would
      // put a phone's portrait footage 17° out on every angle.
      aspect: video.videoWidth > 0 ? video.videoWidth / video.videoHeight : current.aspect,
      times: { ...current.times, [checkpoint]: Math.round(video.currentTime * 1000) / 1000 },
    }));
  }

  function step(by: number) {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    const next = Math.max(0, video.currentTime + by);
    video.currentTime = next;
    setTime(next);
  }

  function place(event: React.MouseEvent<HTMLDivElement>) {
    if (!next) return;
    const box = event.currentTarget.getBoundingClientRect();
    const point: Point = {
      x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
    };
    setDraft((current) => ({
      ...current,
      frames: {
        ...current.frames,
        [checkpoint]: { ...(current.frames[checkpoint] ?? {}), [next.id]: point },
      },
    }));
  }

  function undo() {
    const placed = marks.filter((mark) => frame[mark.id]);
    const last = placed[placed.length - 1];
    if (!last) return;
    setDraft((current) => {
      const copy = { ...(current.frames[checkpoint] ?? {}) };
      delete copy[last.id];
      return { ...current, frames: { ...current.frames, [checkpoint]: copy } };
    });
  }

  function changeView(view: KinematicView) {
    // Points are placed against a view's own landmark list, so keeping them
    // across a change would leave a front-view hip labelled as a side-view one.
    setDraft((current) => ({ ...current, view, frames: {} }));
  }

  return (
    <article className="card card-pad">
      <div className="card-head">
        <div>
          <h3>Measure your delivery</h3>
          <p>Scrub to a moment, tap the body points, and read the angles off your own video.</p>
        </div>
      </div>

      <Alert>
        <strong>What this is, and is not</strong>
        One camera sees a flat picture of a three-dimensional movement, so these angles are
        projections — accurate enough to track against yourself session to session, and rougher
        than a laboratory figure. Reference ranges come from lab motion capture on other pitchers.
        Your own history is the number that means the most here.
      </Alert>

      <div className="kin-sources">
        <input
          ref={fileInput}
          className="visually-hidden"
          type="file"
          accept="video/*"
          aria-label="Delivery video"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) openFile(file);
            event.target.value = "";
          }}
        />
        <button className="btn btn-dark" type="button" onClick={() => fileInput.current?.click()}>
          Open a video
        </button>
        {(videos ?? []).slice(0, 4).map((video) => (
          <button
            key={video.id}
            className="btn btn-outline btn-small"
            type="button"
            onClick={() => openLibrary(video)}
          >
            {video.fileName || video.capturedOn || "Uploaded"}
          </button>
        ))}
      </div>

      {!source ? (
        <EmptyState
          title="No video open"
          detail="Open a video from your phone, or one you have already uploaded, to start measuring."
        />
      ) : (
        <>
          <div className="kin-views" role="group" aria-label="Camera view">
            {(Object.keys(VIEW_LABELS) as KinematicView[]).map((view) => (
              <button
                key={view}
                type="button"
                className={`btn btn-outline btn-small${draft.view === view ? " is-active" : ""}`}
                aria-pressed={draft.view === view}
                onClick={() => changeView(view)}
              >
                {VIEW_LABELS[view]}
              </button>
            ))}
          </div>

          <div className="kin-stage" style={{ aspectRatio: String(draft.aspect) }}>
            {/* No native controls. They sit *inside* the element, so an overlay
                that cleared them would be shorter than the frame — and every
                tap would normalise against a height the picture does not have,
                putting every angle out by a few degrees with nothing on screen
                to show it. The transport below is outside the stage instead. */}
            <video
              ref={videoRef}
              className="kin-video"
              src={source}
              playsInline
              preload="metadata"
              onLoadedMetadata={(event) => {
                const video = event.currentTarget;
                setDuration(Number.isFinite(video.duration) ? video.duration : 0);
                if (video.videoWidth > 0) {
                  setDraft((current) => ({
                    ...current,
                    aspect: video.videoWidth / video.videoHeight,
                  }));
                }
              }}
              onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
            />
            {/* The tap surface covers the video exactly, which is why the stage
                carries the video's own aspect ratio — a letterboxed frame would
                put the taps against the black bars. */}
            <div
              className={`kin-overlay${next ? " is-placing" : ""}`}
              onClick={place}
              role="presentation"
            >
              {marks.map((mark, index) => {
                const point = frame[mark.id];
                if (!point) return null;
                return (
                  <span
                    key={mark.id}
                    className="kin-point"
                    style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
                  >
                    <b>{index + 1}</b>
                  </span>
                );
              })}
            </div>
          </div>

          <div className="kin-transport">
            <button
              className="btn btn-outline btn-small"
              type="button"
              onClick={() => {
                const video = videoRef.current;
                if (!video) return;
                if (video.paused) void video.play();
                else video.pause();
              }}
            >
              {playing ? "Pause" : "Play"}
            </button>
            <input
              type="range"
              aria-label="Video position"
              min={0}
              max={duration || 0}
              step={FRAME_STEP}
              value={Math.min(time, duration || 0)}
              onChange={(event) => {
                const video = videoRef.current;
                if (!video) return;
                video.pause();
                video.currentTime = Number(event.target.value);
                setTime(Number(event.target.value));
              }}
            />
            <span className="kin-time">
              {time.toFixed(2)}s / {duration.toFixed(2)}s
            </span>
          </div>

          <div className="kin-controls">
            <button className="btn btn-outline btn-small" type="button" onClick={() => step(-FRAME_STEP)}>
              ← frame
            </button>
            <button className="btn btn-outline btn-small" type="button" onClick={() => step(FRAME_STEP)}>
              frame →
            </button>
            <button className="btn btn-dark btn-small" type="button" onClick={markFrame}>
              Mark this frame
            </button>
            <button
              className="btn btn-outline btn-small"
              type="button"
              onClick={undo}
              disabled={marks.every((mark) => !frame[mark.id])}
            >
              Undo point
            </button>
          </div>

          <div className="kin-checkpoints" role="group" aria-label="Delivery checkpoint">
            {CHECKPOINTS.map((point) => {
              const done = Object.keys(draft.frames[point.key] ?? {}).length;
              return (
                <button
                  key={point.key}
                  type="button"
                  className={`kin-checkpoint${checkpoint === point.key ? " is-active" : ""}`}
                  aria-pressed={checkpoint === point.key}
                  onClick={() => setCheckpoint(point.key)}
                >
                  <strong>{point.label}</strong>
                  <small>
                    {done}/{marks.length} points
                    {draft.times[point.key] !== undefined
                      ? ` · ${draft.times[point.key]!.toFixed(2)}s`
                      : " · frame not marked"}
                  </small>
                </button>
              );
            })}
          </div>

          <p className="kin-prompt" role="status">
            {next ? (
              <>
                <strong>Tap your {next.label.toLowerCase()}.</strong> {next.hint}
              </>
            ) : (
              <>
                <strong>All points placed for this moment.</strong> Move to another checkpoint, or
                save.
              </>
            )}
          </p>

          <ul className="kin-readings">
            {readings.map((reading) => (
              <li key={reading.measurement.id} className={reading.value === null ? "is-pending" : ""}>
                <div className="kin-reading-head">
                  <strong>{reading.measurement.label}</strong>
                  <span>
                    {reading.value === null
                      ? `${reading.missing.length} point${reading.missing.length === 1 ? "" : "s"} to place`
                      : `${reading.value}${reading.measurement.unit}`}
                  </span>
                </div>
                <p className="kin-why">
                  {reading.measurement.why}
                  {reading.measurement.band && (
                    <>
                      {" "}
                      <em>
                        {reading.measurement.band.low}–{reading.measurement.band.high}
                        {reading.measurement.unit} {reading.measurement.band.source}.
                      </em>
                    </>
                  )}
                </p>
                {history.find((row) => row.reading.measurement.id === reading.measurement.id)
                  ?.points.length ? (
                  <p className="kin-history">
                    Your last{" "}
                    {
                      history.find((row) => row.reading.measurement.id === reading.measurement.id)!
                        .points.length
                    }{" "}
                    measurements at this moment:{" "}
                    {history
                      .find((row) => row.reading.measurement.id === reading.measurement.id)!
                      .points.map((point) => `${point.value}${reading.measurement.unit}`)
                      .join(", ")}
                    .
                  </p>
                ) : null}
              </li>
            ))}
          </ul>

          {(strikeToRelease !== null || liftToStrike !== null || block !== null) && (
            <ul className="kin-derived">
              {liftToStrike !== null && (
                <li>
                  <strong>{liftToStrike} ms</strong> from max leg lift to foot strike
                </li>
              )}
              {strikeToRelease !== null && (
                <li>
                  <strong>{strikeToRelease} ms</strong> from foot strike to release
                </li>
              )}
              {block !== null && (
                <li>
                  <strong>
                    {block > 0 ? "+" : ""}
                    {block}°
                  </strong>{" "}
                  lead knee, foot strike to release
                </li>
              )}
            </ul>
          )}

          {findings.map((finding) => (
            <Alert key={finding.text} tone={finding.severity === "watch" ? "warn" : "info"}>
              {finding.text}
            </Alert>
          ))}

          <p className="fineprint">
            Timing is only as fine as the video. Most phones record 30 or 60 frames a second, which
            is a step of 33 or 17 milliseconds — a figure inside that is the frame rate, not a
            change. {progress.done} of {progress.total} checkpoints{" "}
            {progress.done === 1 ? "has" : "have"} every point placed.
          </p>

          <div className="form-actions">
            <button
              className="btn btn-dark"
              type="button"
              disabled={progress.done === 0}
              onClick={() => {
                onSave(draft);
                setDraft(fresh(date, draft.view));
              }}
            >
              Save this measurement
            </button>
          </div>
        </>
      )}

      {captures.length > 0 && (
        <details className="trend-table">
          <summary>Saved measurements ({captures.length})</summary>
          <ul className="kin-saved">
            {[...captures].reverse().map((capture) => (
              <li key={capture.id}>
                <span>
                  {capture.date} · {VIEW_LABELS[capture.view]} ·{" "}
                  {captureProgress(capture, CHECKPOINTS.map((point) => point.key)).done} checkpoints
                </span>
                <ConfirmButton
                  label="Remove"
                  describe={`the measurement from ${capture.date}`}
                  onConfirm={() => onRemove(capture.id)}
                />
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="fineprint">
        {sourceName ? `Measuring ${sourceName}. ` : ""}The video itself is never uploaded by this
        tool — only the points you place and the angles they produce are saved.
      </p>
    </article>
  );
}
