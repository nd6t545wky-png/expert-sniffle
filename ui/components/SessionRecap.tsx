import { useCallback, useEffect, useRef, useState } from "react";
import { IsoDate } from "../../src/domain/state";
import { PitchingOsApi } from "../../src/domain/api";
import { SessionRecap as Recap } from "../../src/domain/sessionRecap";
import { drawRecapCard, RECAP_CARD } from "../state/recapCard";
import { Alert } from "./Page";
import { formatIsoDate } from "../state/formatDate";

/**
 * The session recap — a photo with the day's work on it, for sharing.
 *
 * The on-screen card is HTML so it themes and reflows like everything else;
 * the *exported* card is drawn separately onto a canvas at a fixed 1080×1350,
 * because a screenshot of a responsive card is whatever size the phone
 * happened to be. Both read the same recap object, so the picture that leaves
 * the app cannot claim something the screen did not.
 *
 * The photo lives in private R2 under the athlete's own key. Nothing here
 * publishes anything: "Save image" writes a file to the device, and where it
 * goes after that is the athlete's choice.
 */

export interface SessionRecapProps {
  date: IsoDate;
  recap: Recap;
  api: PitchingOsApi;
  hasSyncKey: boolean;
  caption: string;
  onCaption: (caption: string) => void;
}

const ACCEPTED = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 20_000_000;

export function SessionRecap({
  date,
  recap,
  api,
  hasSyncKey,
  caption,
  onCaption,
}: SessionRecapProps) {
  const [photoUrl, setPhotoUrl] = useState<string>("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const objectUrl = useRef<string>("");

  const show = useCallback((blob: Blob | null) => {
    // Object URLs are a leak if they are not revoked; the previous one is
    // released before the next is created.
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = blob ? URL.createObjectURL(blob) : "";
    setPhotoUrl(objectUrl.current);
  }, []);

  useEffect(() => {
    if (!hasSyncKey) return;
    let cancelled = false;
    api
      .sessionPhoto(date)
      .then((blob) => {
        if (!cancelled) show(blob);
      })
      .catch(() => {
        /* A missing photo is the normal case, not an error worth showing. */
      });
    return () => {
      cancelled = true;
    };
  }, [api, date, hasSyncKey, show]);

  // Release the last object URL when the card goes away.
  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    []
  );

  async function handleFile(file: File) {
    setError("");
    if (file.size > MAX_BYTES) {
      setError("That photo is over 20 MB. Try a smaller one.");
      return;
    }
    setBusy("Saving photo…");
    try {
      await api.uploadSessionPhoto(date, file);
      show(file);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save that photo.");
    } finally {
      setBusy("");
    }
  }

  async function handleRemove() {
    setError("");
    setBusy("Removing…");
    try {
      await api.deleteSessionPhoto(date);
      show(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove that photo.");
    } finally {
      setBusy("");
    }
  }

  async function handleExport() {
    setError("");
    setBusy("Building image…");
    try {
      const blob = await drawRecapCard({ recap, caption, photoUrl });
      if (!blob) throw new Error("Could not build the image.");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `pitching-os-${date}.png`;
      link.click();
      // The href is revoked on the next tick so the download has taken it.
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not build the image.");
    } finally {
      setBusy("");
    }
  }

  if (!recap.hasContent) {
    return (
      <article className="card card-pad">
        <div className="card-head">
          <div>
            <h3>Session recap</h3>
            <p>A shareable card of the day’s work, with a photo.</p>
          </div>
        </div>
        <p className="fineprint">
          Nothing is logged for {formatIsoDate(date)} yet. Complete some of the plan, or file a
          check-out, and the card will fill in with what you actually did.
        </p>
      </article>
    );
  }

  return (
    <article className="card card-pad recap">
      <div className="card-head">
        <div>
          <h3>Session recap</h3>
          <p>A shareable card of the day’s work, with a photo.</p>
        </div>
      </div>

      <div className="recap-card" data-recap-preview>
        {photoUrl ? (
          <img className="recap-photo" src={photoUrl} alt="" />
        ) : (
          <div className="recap-photo recap-photo-empty" aria-hidden="true" />
        )}
        <div className="recap-overlay">
          <p className="recap-eyebrow">
            {formatIsoDate(date)}
            {recap.effort ? ` · ${recap.effort}` : ""}
          </p>
          <h4 className="recap-title">{recap.title}</h4>
          {recap.focus && <p className="recap-focus">{recap.focus}</p>}

          <ul className="recap-stats">
            {recap.stats.map((stat) => (
              <li key={stat.label}>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
                {stat.detail && <small>{stat.detail}</small>}
              </li>
            ))}
          </ul>

          {recap.highlights.length > 0 && (
            <ul className="recap-highlights">
              {recap.highlights.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}

          {caption && <p className="recap-caption">{caption}</p>}
        </div>
      </div>

      <div className="field full recap-field">
        <label htmlFor="recapCaption">Caption</label>
        <input
          id="recapCaption"
          type="text"
          maxLength={120}
          placeholder="How did it feel?"
          value={caption}
          onChange={(event) => onCaption(event.target.value)}
        />
        <small>Appears on the card. {120 - caption.length} characters left.</small>
      </div>

      <input
        ref={fileInput}
        className="visually-hidden"
        type="file"
        accept={ACCEPTED}
        aria-label="Session photo"
        disabled={!hasSyncKey || Boolean(busy)}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
          event.target.value = "";
        }}
      />

      <div className="form-actions recap-actions">
        <button
          className="btn btn-outline"
          type="button"
          disabled={!hasSyncKey || Boolean(busy)}
          onClick={() => fileInput.current?.click()}
        >
          {photoUrl ? "Change photo" : "Add photo"}
        </button>
        {photoUrl && (
          <button
            className="btn btn-outline"
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void handleRemove()}
          >
            Remove photo
          </button>
        )}
        <button className="btn btn-dark" type="button" disabled={Boolean(busy)} onClick={() => void handleExport()}>
          Save image
        </button>
      </div>

      {busy && <p className="fineprint">{busy}</p>}

      {!hasSyncKey && (
        <p className="fineprint">
          <strong>Cloud autosave required</strong> to attach a photo — it is stored privately against
          your recovery key. You can still save the card without one.
        </p>
      )}

      {error && (
        <Alert tone="warn" role="alert">
          {error}
        </Alert>
      )}

      <p className="fineprint">
        Saving writes a {RECAP_CARD.width}×{RECAP_CARD.height} image to your device. Nothing is
        posted anywhere — where it goes next is up to you.
      </p>
    </article>
  );
}
