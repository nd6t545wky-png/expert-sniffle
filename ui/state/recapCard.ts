/**
 * The exported recap card, drawn on a canvas.
 *
 * Deliberately not a screenshot of the on-screen card. A screenshot is
 * whatever size the phone happened to be, in whatever theme was active, with
 * whatever the browser felt like doing to the fonts. This draws a fixed
 * 1080×1350 — Instagram's portrait size, and a sane crop everywhere else — so
 * the file is the same on every device.
 *
 * It reads the same `SessionRecap` the on-screen card reads, so the image that
 * leaves the app cannot claim something the screen did not show.
 */

import { SessionRecap } from "../../src/domain/sessionRecap";
import { formatIsoDate } from "./formatDate";

export const RECAP_CARD = { width: 1080, height: 1350 } as const;

const INK = "#ffffff";
const MUTED = "rgba(255,255,255,.72)";
const PAD = 72;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

/**
 * Cover-fit: fill the frame, crop the overflow, never distort.
 *
 * Letterboxing a training photo looks broken, and stretching it to fit is
 * worse — it changes what the athlete looks like.
 */
function drawCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number
) {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

/** Wraps text to a width, returning the lines actually drawn. */
function wrap(context: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

export interface RecapCardInput {
  recap: SessionRecap;
  caption: string;
  photoUrl: string;
}

export async function drawRecapCard({ recap, caption, photoUrl }: RecapCardInput): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = RECAP_CARD.width;
  canvas.height = RECAP_CARD.height;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const { width, height } = RECAP_CARD;

  // Background: the photo, or a plain dark card when there is none. The card
  // must be worth saving without a photo — most sessions will not have one.
  const image = await loadImage(photoUrl);
  if (image) {
    drawCover(context, image, width, height);
  } else {
    context.fillStyle = "#101014";
    context.fillRect(0, 0, width, height);
  }

  // A bottom-weighted scrim so white text clears any photo underneath it.
  // Without this the card is unreadable over a bright sky exactly as often as
  // it is readable, which is to say it is not a card.
  // Stops mirror `.recap-overlay` in ui/app.css. Measured over a white frame:
  // a gentler ramp left the title and date unreadable, so the fade starts high
  // and reaches near-opaque before the tallest possible text block begins.
  const scrim = context.createLinearGradient(0, height * 0.08, 0, height);
  scrim.addColorStop(0, "rgba(8,8,10,0)");
  scrim.addColorStop(0.24, "rgba(8,8,10,.58)");
  scrim.addColorStop(0.54, "rgba(8,8,10,.90)");
  scrim.addColorStop(1, "rgba(8,8,10,.96)");
  context.fillStyle = scrim;
  context.fillRect(0, 0, width, height);

  // How strong the scrim is where a given line sits depends on how much was
  // logged, so every line also carries its own shadow. Matches the
  // `text-shadow` on `.recap-overlay`.
  context.shadowColor = "rgba(0,0,0,.75)";
  context.shadowBlur = 18;
  context.shadowOffsetY = 2;

  const family =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  context.textBaseline = "alphabetic";

  let y = height - PAD;

  // Caption sits at the very bottom, then everything stacks upward from it.
  if (caption) {
    context.font = `400 34px ${family}`;
    context.fillStyle = MUTED;
    const lines = wrap(context, caption, width - PAD * 2, 2);
    for (const line of [...lines].reverse()) {
      context.fillText(line, PAD, y);
      y -= 44;
    }
    y -= 18;
  }

  // Highlights: the work worth naming, one per line.
  if (recap.highlights.length > 0) {
    context.font = `400 30px ${family}`;
    for (const line of [...recap.highlights].reverse()) {
      context.fillStyle = MUTED;
      const [text] = wrap(context, line, width - PAD * 2 - 34, 1);
      context.fillText(text ?? line, PAD + 34, y);
      // A small square marker instead of a bullet glyph, which renders
      // differently on every platform.
      context.fillStyle = "rgba(255,255,255,.45)";
      context.fillRect(PAD, y - 11, 12, 12);
      y -= 46;
    }
    y -= 22;
  }

  // Stats row: the numbers, evenly spaced across the card.
  //
  // The block is three stacked lines — value, label, detail — and it is laid
  // out from its *bottom* upward. Drawing the label and detail below a single
  // baseline instead put them straight through the highlights, because the
  // highlights had already claimed that space on the way up.
  if (recap.stats.length > 0) {
    const columns = Math.min(recap.stats.length, 4);
    const shown = recap.stats.slice(0, columns);
    const columnWidth = (width - PAD * 2) / columns;

    const hasDetail = shown.some((stat) => stat.detail);
    const detailY = y;
    const labelY = hasDetail ? detailY - 34 : detailY;
    const valueY = labelY - 40;

    shown.forEach((stat, index) => {
      const x = PAD + columnWidth * index;
      context.fillStyle = INK;
      context.font = `700 66px ${family}`;
      context.fillText(stat.value, x, valueY);

      context.fillStyle = MUTED;
      context.font = `600 26px ${family}`;
      context.fillText(stat.label.toUpperCase(), x, labelY);

      if (stat.detail) {
        context.fillStyle = "rgba(255,255,255,.55)";
        context.font = `400 24px ${family}`;
        context.fillText(stat.detail, x, detailY);
      }
    });

    // Clear the cap height of the 66px value row, plus a gap.
    y = valueY - 70;
  }

  // Title and date, above the numbers.
  if (recap.focus) {
    context.fillStyle = MUTED;
    context.font = `400 32px ${family}`;
    const [line] = wrap(context, recap.focus, width - PAD * 2, 1);
    context.fillText(line ?? recap.focus, PAD, y);
    y -= 54;
  }

  context.fillStyle = INK;
  context.font = `700 70px ${family}`;
  const titleLines = wrap(context, recap.title, width - PAD * 2, 2);
  for (const line of [...titleLines].reverse()) {
    context.fillText(line, PAD, y);
    y -= 78;
  }

  context.fillStyle = MUTED;
  context.font = `600 28px ${family}`;
  const eyebrow = recap.effort
    ? `${formatIsoDate(recap.date)} · ${recap.effort}`
    : formatIsoDate(recap.date);
  context.fillText(eyebrow.toUpperCase(), PAD, y - 6);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}
