import { useRef, useState } from "react";
import { AppState } from "../../src/domain/state";
import {
  ImportResult,
  exportAppState,
  importAppState,
  serializeExport,
} from "../../src/domain/importExport";
import { Alert, Card, CardHead } from "./Page";

/**
 * Take your data with you.
 *
 * `importExport` has been written and tested for months and nothing in the app
 * called it, so there was no way to get data out at all. Everything lives in
 * this browser's storage plus one row behind a 64-character recovery key —
 * lose both and the whole training history is gone, with nothing anywhere
 * having said so.
 *
 * Two rules the UI holds to:
 *
 *   - **Export is a plain file the athlete owns.** JSON, readable, with the
 *     schema version in it, downloaded to the device. Not a proprietary blob
 *     and not something that has to come back through this app to be useful.
 *   - **Import is all-or-nothing, and it says what it will do first.** The
 *     file is validated and summarised, and nothing is written until the
 *     replacement is confirmed — because import replaces everything, and a
 *     half-applied import is worse than a refused one.
 */

export interface DataBackupProps {
  state: AppState | null;
  onReplace: (state: AppState) => void;
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function records(count: number): string {
  return `${count} ${count === 1 ? "record" : "records"}`;
}

export function DataBackup({ state, onReplace }: DataBackupProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [note, setNote] = useState("");

  const summary = state ? exportAppState(state) : null;

  function download() {
    if (!state) return;
    const blob = new Blob([serializeExport(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pitching-os-backup-${stamp()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Released on the next tick — revoking synchronously can cancel the
    // download in some browsers before it has read the blob.
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setNote(`Saved ${records(summary?.recordCount ?? 0)} to your device.`);
  }

  async function chooseFile(file: File) {
    setNote("");
    setFileName(file.name);
    setPending(importAppState(await file.text()));
  }

  function confirmImport() {
    if (!pending?.ok || !pending.state) return;
    onReplace(pending.state);
    setNote(`Replaced everything on this device with ${records(pending.recordCount ?? 0)} from ${fileName}.`);
    setPending(null);
    setFileName("");
  }

  return (
    <Card>
      <CardHead
        title="Back up your data"
        detail="A file you keep, readable without this app"
      />

      <Alert tone="warn">
        <strong>Your recovery key is the only way back in</strong>
        Everything lives in this browser and in one cloud record behind that
        key. Lose the key and this device and the whole history goes with them —
        a backup file is the only thing that survives both.
      </Alert>

      <div className="backup-actions">
        <button className="btn btn-dark" type="button" onClick={download} disabled={!state}>
          Download a backup
        </button>
        <input
          ref={fileInput}
          className="visually-hidden"
          type="file"
          accept="application/json,.json"
          aria-label="Backup file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void chooseFile(file);
            event.target.value = "";
          }}
        />
        <button className="btn btn-outline" type="button" onClick={() => fileInput.current?.click()}>
          Restore from a file
        </button>
      </div>

      {summary && (
        <p className="fineprint">
          {records(summary.recordCount)}, schema version {summary.schemaVersion}. The file is plain
          JSON — you can open it, read it, and keep it anywhere.
        </p>
      )}

      {note && <Alert role="status">{note}</Alert>}

      {pending && !pending.ok && (
        <Alert tone="danger" role="alert">
          <strong>{fileName} was not imported</strong>
          {pending.errors.map((issue) => (
            <span key={`${issue.path}-${issue.message}`} className="backup-issue">
              {issue.path ? `${issue.path}: ` : ""}
              {issue.message}
            </span>
          ))}
        </Alert>
      )}

      {pending?.ok && (
        // Nothing is written until this is confirmed. Import replaces
        // everything, so it gets a second step rather than a single tap.
        <Alert tone="warn" role="alert">
          <strong>Replace everything on this device?</strong>
          {fileName} holds {records(pending.recordCount ?? 0)}. Importing it discards what is on this
          device now — check-ins, sessions, pitches, meals and all — and puts this file in its
          place. It cannot be undone.
          {pending.warnings.length > 0 && (
            <span className="backup-issue">
              {pending.warnings.length} note{pending.warnings.length === 1 ? "" : "s"}:{" "}
              {pending.warnings.map((issue) => issue.message).join("; ")}
            </span>
          )}
          <span className="backup-actions">
            <button className="btn btn-dark" type="button" onClick={confirmImport}>
              Replace everything
            </button>
            <button
              className="btn btn-outline"
              type="button"
              onClick={() => {
                setPending(null);
                setFileName("");
              }}
            >
              Cancel
            </button>
          </span>
        </Alert>
      )}
    </Card>
  );
}
