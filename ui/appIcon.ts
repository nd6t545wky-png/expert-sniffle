/**
 * The app icon: a baseball on a rounded square.
 *
 * Nobody's team owns it by default — a black square, a white ball and the
 * ball's own red stitching. Once the app knows the athlete's team and has
 * that team's colours, the icon on their phone is drawn in them instead: the
 * team's colour behind the ball, its second colour in the stitching.
 */

export interface IconColours {
  background: string;
  ball: string;
  seam: string;
}

export const NEUTRAL_ICON: IconColours = { background: "#141416", ball: "#f7f7f5", seam: "#d0342c" };

type Point = [number, number];

/** Points along a cubic curve, with the direction of travel at each. */
function along(p: [Point, Point, Point, Point], steps: number): { at: Point; dir: Point }[] {
  const [a, b, c, d] = p;
  const out: { at: Point; dir: Point }[] = [];
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    const at: Point = [
      u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
      u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1],
    ];
    const dx = 3 * u * u * (b[0] - a[0]) + 6 * u * t * (c[0] - b[0]) + 3 * t * t * (d[0] - c[0]);
    const dy = 3 * u * u * (b[1] - a[1]) + 6 * u * t * (c[1] - b[1]) + 3 * t * t * (d[1] - c[1]);
    const length = Math.hypot(dx, dy) || 1;
    out.push({ at, dir: [dx / length, dy / length] });
  }
  return out;
}

/** A seam and its stitches: short ticks across it, leaning the same way, like the real thing. */
function seam(curve: [Point, Point, Point, Point], outward: 1 | -1): string {
  const [a, b, c, d] = curve;
  const line = `M${a[0]} ${a[1]} C${b[0]} ${b[1]} ${c[0]} ${c[1]} ${d[0]} ${d[1]}`;
  const ticks = along(curve, 11)
    .map(({ at, dir }) => {
      // Normal to the seam, pointing away from the centre of the ball.
      const normal: Point = [-dir[1] * outward, dir[0] * outward];
      // Each stitch crosses the seam at a slant, all leaning the same way.
      const lean = 0.6;
      const v: Point = [normal[0] + dir[0] * lean, normal[1] + dir[1] * lean];
      const size = Math.hypot(v[0], v[1]);
      const half = 4.2;
      const from: Point = [at[0] - (v[0] / size) * half, at[1] - (v[1] / size) * half];
      const to: Point = [at[0] + (v[0] / size) * half, at[1] + (v[1] / size) * half];
      return `M${from[0].toFixed(1)} ${from[1].toFixed(1)} L${to[0].toFixed(1)} ${to[1].toFixed(1)}`;
    })
    .join(" ");
  return `<path d="${line}" stroke-width="2.5"/><path d="${ticks}" stroke-width="2.6"/>`;
}

/** The icon as an SVG document, on a 128 × 128 canvas. */
export function iconSvg({ background, ball, seam: stitch }: IconColours, rounded = true): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">`,
    `<defs><clipPath id="ball"><circle cx="64" cy="64" r="42"/></clipPath></defs>`,
    `<rect width="128" height="128"${rounded ? ' rx="28"' : ""} fill="${background}"/>`,
    `<circle cx="64" cy="64" r="42" fill="${ball}"/>`,
    `<g clip-path="url(#ball)" fill="none" stroke="${stitch}" stroke-linecap="round">`,
    seam([[40, 28], [56, 46], [56, 82], [40, 100]], -1),
    seam([[88, 28], [72, 46], [72, 82], [88, 100]], 1),
    `</g>`,
    `</svg>`,
  ].join("");
}

/**
 * The icon as a PNG data URL, drawn in the browser. iOS reads the home-screen
 * icon as a PNG from `apple-touch-icon` when the app is added; SVG is ignored.
 * iOS rounds the corners itself, so the square is drawn without them.
 */
export async function iconPng(colours: IconColours, size = 180): Promise<string> {
  const svg = new Blob([iconSvg(colours, false)], { type: "image/svg+xml" });
  const url = URL.createObjectURL(svg);
  try {
    const image = new Image();
    image.width = size;
    image.height = size;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("icon did not draw"));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    canvas.getContext("2d")?.drawImage(image, 0, 0, size, size);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Point the page's home-screen icon (and the tab icon) at `href`. */
export function setTouchIcon(href: string): void {
  for (const rel of ["apple-touch-icon", "icon"]) {
    let link = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
    if (!link) {
      link = document.createElement("link");
      link.rel = rel;
      document.head.appendChild(link);
    }
    link.href = href;
    if (rel === "icon") link.type = "image/png";
  }
}
