/**
 * The exported recap card, drawn on a canvas.
 *
 * Deliberately not a screenshot of the on-screen card. A screenshot is
 * whatever size the phone happened to be, in whatever theme was active, with
 * whatever the browser felt like doing to the fonts. This draws a fixed
 * 1080×1920 so the file is identical on every device.
 *
 * Laid out like the reference: the photo full-bleed and largely unobscured,
 * the numbers set over its upper half in two columns — a small label above a
 * large value. Type is sized for a phone screen at arm's length, which is the
 * only place this image is ever read.
 *
 * It reads the same `SessionRecap` the on-screen card reads, so the image that
 * leaves the app cannot claim something the screen did not show.
 */

import { SessionRecap } from "../../src/domain/sessionRecap";
import { formatIsoDate } from "./formatDate";

/**
 * 9:16 — the story format the reference card uses, and what Instagram,
 * TikTok and WhatsApp all expect. A 4:5 card gets letterboxed by all three.
 */
export const RECAP_CARD = { width: 1080, height: 1920 } as const;

const INK = "#ffffff";
const MUTED = "rgba(255,255,255,.72)";
/** The PB row. Gold reads as an award and is legible on a dark photo. */
const PB_GOLD = "#ffd166";
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

/**
 * Trims a line to fit, ending with an ellipsis rather than mid-phrase.
 *
 * Plain wrapping left lines reading "… · 90–120 ft ·" — a dangling separator
 * that looks like a rendering fault rather than a shortened line.
 */
function ellipsize(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (context.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && context.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut.replace(/[\s·—-]+$/, "")}…`;
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

  // A light top-down wash only. The reference leaves the photo almost
  // untouched, so legibility rests mainly on the text shadow below — a heavy
  // scrim would hide the thing the athlete photographed.
  const scrim = context.createLinearGradient(0, 0, 0, height);
  scrim.addColorStop(0, "rgba(8,8,10,.52)");
  scrim.addColorStop(0.45, "rgba(8,8,10,.30)");
  scrim.addColorStop(0.72, "rgba(8,8,10,.34)");
  scrim.addColorStop(1, "rgba(8,8,10,.72)");
  context.fillStyle = scrim;
  context.fillRect(0, 0, width, height);

  // Every line carries its own shadow, so the card stays readable over a
  // bright sky without darkening the photo into mud.
  context.shadowColor = "rgba(0,0,0,.8)";
  context.shadowBlur = 22;
  context.shadowOffsetY = 2;

  const family =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  context.textBaseline = "alphabetic";

  // --- Header ---------------------------------------------------------------
  let y = 150;

  context.fillStyle = MUTED;
  context.font = `600 34px ${family}`;
  const eyebrow = recap.effort
    ? `${formatIsoDate(recap.date)} · ${recap.effort}`
    : formatIsoDate(recap.date);
  context.fillText(eyebrow.toUpperCase(), PAD, y);

  y += 84;
  context.fillStyle = INK;
  context.font = `700 82px ${family}`;
  for (const line of wrap(context, recap.title, width - PAD * 2, 2)) {
    context.fillText(line, PAD, y);
    y += 92;
  }

  if (recap.focus) {
    context.fillStyle = MUTED;
    context.font = `400 36px ${family}`;
    const [line] = wrap(context, recap.focus, width - PAD * 2, 1);
    context.fillText(line ?? recap.focus, PAD, y);
    y += 56;
  }

  // A personal best is the reason to post at all — it gets its own row.
  if (recap.pb) {
    y += 22;
    context.fillStyle = PB_GOLD;
    context.font = `700 36px ${family}`;
    context.fillText(`★  NEW PB · ${recap.pb.label.toUpperCase()} ${recap.pb.value}`, PAD, y);
    y += 40;
  }

  // --- Stats, two columns ---------------------------------------------------
  y += 74;
  const columnWidth = (width - PAD * 2) / 2;

  recap.stats.forEach((stat, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = PAD + column * columnWidth;
    const top = y + row * 148;

    context.fillStyle = MUTED;
    context.font = `500 32px ${family}`;
    context.fillText(stat.label, x, top);

    context.fillStyle = INK;
    context.font = `700 76px ${family}`;
    context.fillText(stat.value, x, top + 76);
  });

  // --- Footer: the named work, then the caption -----------------------------
  let footer = height - PAD - 20;

  if (caption) {
    context.font = `400 38px ${family}`;
    context.fillStyle = INK;
    const lines = wrap(context, caption, width - PAD * 2, 2);
    for (const line of [...lines].reverse()) {
      context.fillText(line, PAD, footer);
      footer -= 50;
    }
    footer -= 24;
  }

  if (recap.highlights.length > 0) {
    context.font = `400 32px ${family}`;
    for (const line of [...recap.highlights].slice(0, 3).reverse()) {
      context.fillStyle = MUTED;
      context.fillText(ellipsize(context, line, width - PAD * 2 - 36), PAD + 36, footer);
      // A small square marker instead of a bullet glyph, which renders
      // differently on every platform.
      context.fillStyle = "rgba(255,255,255,.5)";
      context.fillRect(PAD, footer - 12, 13, 13);
      footer -= 50;
    }
  }

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}
