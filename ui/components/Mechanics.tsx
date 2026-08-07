import { useCallback, useEffect, useRef, useState } from "react";
import { IsoDate } from "../../src/domain/state";
import { MechanicsAnalysis, MechanicsAngle, MechanicsVideo, PitchingOsApi } from "../../src/domain/api";
import { Alert, Card, EmptyState, Field, PageHead } from "./Page";

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

export function Mechanics({ api, date, hasSyncKey }: MechanicsProps) {
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

  if (!hasSyncKey) {
    return (
      <>
        <PageHead eyebrow="Biomechanics" title="Movement screening." />
        <Alert>Turn on cloud autosave to store pitching video.</Alert>
      </>
    );
  }

  return (
    <>
      <PageHead
        eyebrow="Biomechanics"
        title="Movement screening."
        intro="A qualitative screen from phone video — not a laboratory assessment."
      />

      <Card className="biomechanics-command-card">
        <div className="form-grid capture-essentials">
          <Field id="angle" label="Camera angle">
            <select id="angle" value={angle} onChange={(event) => setAngle(event.target.value as MechanicsAngle)}>
              {ANGLES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>

          <Field id="video" label="Pitching video" hint={busy === "upload" ? "Uploading…" : "MP4, MOV or WebM"}>
            <input
              id="video"
              ref={videoInput}
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              aria-label="Pitching video"
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
            <input
              id="sheet"
              ref={sheetInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Contact sheet"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) analyze(file);
              }}
            />
          </Field>
        </div>
      </Card>

      {analysis && <AnalysisResult analysis={analysis} />}

      {videos.length === 0 ? (
        <EmptyState title="No videos uploaded yet" detail="Uploads appear here with a playback link." />
      ) : (
        <ul className="task-list">
          {videos.map((video) => (
            <li key={video.id} className="card task">
              <div>
                <strong>{video.fileName}</strong>
                <span>
                  {" "}
                  {video.angle || "unspecified"} · {video.capturedOn || "undated"}
                </span>
              </div>
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
            </li>
          ))}
        </ul>
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
  const ratings: [string, number | null][] = [
    ["Sequence", analysis.sequenceRating],
    ["Lower half", analysis.lowerHalfRating],
    ["Trunk", analysis.trunkRating],
    ["Arm timing", analysis.armTimingRating],
    ["Release", analysis.releaseRating],
    ["Deceleration", analysis.decelerationRating],
  ];

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

      {analysis.analyzable && (
        <dl className="grid metrics">
          {ratings
            .filter(([, value]) => value !== null)
            .map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}/5</dd>
              </div>
            ))}
        </dl>
      )}

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
