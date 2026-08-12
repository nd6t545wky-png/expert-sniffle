import { useCallback, useEffect, useRef, useState } from "react";
import { IsoDate } from "../../src/domain/state";
import { MechanicsAnalysis, MechanicsAngle, MechanicsVideo, PitchingOsApi } from "../../src/domain/api";
import { Alert, Card, CardHead, EmptyState, Field, PageHead } from "./Page";
import { MechanicsRoutine } from "./MechanicsRoutine";
import { KinematicsCapture } from "./KinematicsCapture";
import { ANGLE_COVERAGE, CHECKPOINTS } from "../../src/domain/mechanicsDrills";
import { Capture } from "../../src/domain/kinematics";

/**
 * Pitching video library and AI movement screening.
 *
 * The screening result is deliberately presented with its own limitations
 * attached — it is a qualitative phone-video screen, not lab biomechanics,
 * and the server's guardrails around that are surfaced rather than hidden.
 */

export interface MechanicsProps {
  api: PitchingOsApi;
  date: IsoDate;
  hasSyncKey: boolean;
  /** Hand-digitised kinematics — see `src/domain/kinematics`. */
  captures?: Capture[];
  onSaveCapture?: (capture: Capture) => void;
  onRemoveCapture?: (id: string) => void;
}

const ANGLES: [MechanicsAngle, string][] = [
  ["open_side", "Open side"],
  ["rear", "Rear"],
  ["dual", "Dual view"],
];

function newMediaId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function Mechanics({
  api,
  date,
  hasSyncKey,
  captures,
  onSaveCapture,
  onRemoveCapture,
}: MechanicsProps) {
  const [videos, setVideos] = useState<MechanicsVideo[]>([]);
  const [angle, setAngle] = useState<MechanicsAngle>("open_side");
  const [analysis, setAnalysis] = useState<MechanicsAnalysis | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const videoInput = useRef<HTMLInputElement>(null);
  const sheetInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!hasSyncKey) return;
    try {
      setVideos((await api.listMechanicsVideos()).videos);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [api, hasSyncKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function upload(file: File) {
    setBusy("upload");
    setError("");
    try {
      await api.uploadMechanicsVideo(newMediaId(), file, {
        fileName: file.name,
        angle,
        capturedOn: date,
      });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy("");
    }
  }

  async function analyze(file: File) {
    setBusy("analyze");
    setError("");
    setAnalysis(null);
    try {
      const result = await api.analyzeMechanics(file, { angle, capturedOn: date });
      setAnalysis(result.analysis);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Biomechanics"
        title="Movement screening."
        intro="A qualitative screen from phone video — not a laboratory assessment."
      />

      {/* The capture card stays on the page with its controls disabled rather
          than being replaced by a lone sentence — a page reduced to one line
          reads as broken, not as a prerequisite. */}
      {!hasSyncKey && (
        <Alert tone="warn">
          <strong>Cloud autosave required.</strong> Pitching video is stored in your encrypted
          workspace, so turn on autosave from Athlete before capturing.
        </Alert>
      )}

      {/* What a good capture looks like, before it is taken rather than after
          it fails. The four frames are the structure the Mustard app reads a
          delivery at, and they are what this screen is judged against too. */}
      <Card>
        <CardHead title="What the screen reads" detail="Four frames of the delivery" />
        <div className="mini-list">
          {CHECKPOINTS.map((point, index) => (
            <div className="mini-row" key={point.key}>
              <span className="mini-icon">{index + 1}</span>
              <div>
                <strong>{point.label}</strong>
                <p>{point.look}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="fineprint">
          One camera cannot see all of it. A single angle rates only what it can see and leaves the
          rest unrated — shoot both the open side and the rear before changing anything.
        </p>
      </Card>

      <Card className="biomechanics-command-card">
        {/* `.capture-essentials` is an icon list — a 28px column then content.
            A `.field` label dropped into that column wraps one word per line,
            which is what it was doing. A form belongs in `.form-grid`. */}
        <CardHead title="Capture" detail="Screen a delivery" />
        <div className="form-grid">
          <Field id="angle" label="Camera angle" hint={ANGLE_COVERAGE[angle]?.note}>
            <select id="angle" value={angle} onChange={(event) => setAngle(event.target.value as MechanicsAngle)}>
              {ANGLES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>

          <Field id="video" label="Pitching video" hint={busy === "upload" ? "Uploading…" : "MP4, MOV or WebM"}>
            {/* A label standing in for the unstylable native file button, as
                the prototype does for its photo picker. */}
            <label className={`btn btn-outline ${hasSyncKey ? "" : "disabled"}`.trim()} htmlFor="video">
              {busy === "upload" ? "Uploading…" : "Choose video"}
            </label>
            <input
              id="video"
              hidden
              ref={videoInput}
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              aria-label="Pitching video"
              disabled={!hasSyncKey}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) upload(file);
              }}
            />
          </Field>

          <Field
            id="sheet"
            label="Contact sheet"
            hint={busy === "analyze" ? "Analysing…" : "Eight time-ordered panels from one delivery"}
            full
          >
            <label className={`btn btn-outline ${hasSyncKey ? "" : "disabled"}`.trim()} htmlFor="sheet">
              {busy === "analyze" ? "Analysing…" : "Choose contact sheet"}
            </label>
            <input
              id="sheet"
              hidden
              ref={sheetInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Contact sheet"
              disabled={!hasSyncKey}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) analyze(file);
              }}
            />
          </Field>
        </div>
      </Card>

      {analysis && <AnalysisResult analysis={analysis} />}

      {/* The screen is only useful if it leads to work. */}
      <MechanicsRoutine analysis={analysis} />

      {/* The screen rates six qualities one to five; this measures the
          delivery in degrees and milliseconds. They answer different
          questions, so both are here. */}
      {onSaveCapture && onRemoveCapture && (
        <KinematicsCapture
          date={date}
          captures={captures ?? []}
          onSave={onSaveCapture}
          onRemove={onRemoveCapture}
          videos={videos}
        />
      )}

      {videos.length === 0 ? (
        <EmptyState title="No videos uploaded yet" detail="Uploads appear here with a playback link." />
      ) : (
        <Card>
          <CardHead title="Uploaded video" detail={`${videos.length} file${videos.length === 1 ? "" : "s"}`} />
          <ul className="task-list">
            {videos.map((video) => (
              <li key={video.id} className="task">
                {/* Three children, because `.task` is a three-column grid:
                    marker, text, actions. Two children put the text in the
                    28px marker column and squeeze it to one word per line. */}
                <span className="task-marker" aria-hidden="true" />
                <div>
                  <div className="task-title">{video.fileName}</div>
                  <div className="task-prescription">
                    {video.angle || "unspecified angle"} · {video.capturedOn || "undated"}
                  </div>
                </div>
                <div className="task-actions">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={async () => {
                      await api.deleteMechanicsVideo(video.id);
                      await refresh();
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}
    </>
  );
}

function AnalysisResult({ analysis }: { analysis: MechanicsAnalysis }) {
  return (
    <div className="alert" role="status">
      <strong>{analysis.sourceLabel}</strong>
      {!analysis.analyzable && (
        <p>
          <strong>Capture not usable.</strong> Nothing has been rated.
          {analysis.captureQuality?.blockers?.length ? ` ${analysis.captureQuality.blockers.join("; ")}` : ""}
        </p>
      )}
      <p>{analysis.summary}</p>
      <p className="fineprint">
        Confidence: {analysis.confidence} — {analysis.confidenceReason}
      </p>

      {/* Ratings are rendered by MechanicsRoutine, which also shows the ones
          this capture could not rate — a bare list of the ratings that exist
          makes a missing metric look like a passing one. */}

      {analysis.limitations?.length > 0 && (
        <>
          <strong>Limitations</strong>
          <ul>
            {analysis.limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
