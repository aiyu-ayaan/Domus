// Small color helpers for ambient sync and light patterns.

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export const rgbToHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");

// Linear interpolate across an evenly-spaced list of hex stops; t in [0,1].
export function lerpPalette(stops: string[], t: number): string {
  t = Math.max(0, Math.min(1, t));
  if (stops.length === 1) return stops[0];
  const seg = t * (stops.length - 1);
  const i = Math.min(Math.floor(seg), stops.length - 2);
  const f = seg - i;
  const a = hexToRgb(stops[i]);
  const b = hexToRgb(stops[i + 1]);
  return rgbToHex(
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  );
}

// Full-saturation hue (0..360) to hex — used for rainbow/spectrum cycling.
export function hueToHex(h: number, s = 1, l = 0.5): string {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) [r, g] = [c, x];
  else if (h < 120) [r, g] = [x, c];
  else if (h < 180) [g, b] = [c, x];
  else if (h < 240) [g, b] = [x, c];
  else if (h < 300) [r, b] = [x, c];
  else [r, b] = [c, x];
  return rgbToHex(
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  );
}

// ponytail: runnable self-check — `bun apps/web/lib/color.ts`. Stripped from the browser bundle.
if (import.meta.main) {
  const eq = (a: string, b: string, msg: string) => {
    if (a !== b) throw new Error(`${msg}: ${a} !== ${b}`);
  };
  eq(rgbToHex(255, 0, 0), "#ff0000", "rgbToHex red");
  eq(lerpPalette(["#000000", "#ffffff"], 0.5), "#808080", "lerp midpoint");
  eq(lerpPalette(["#ff0000", "#00ff00"], 0), "#ff0000", "lerp start");
  eq(hueToHex(0), "#ff0000", "hue red");
  eq(hueToHex(120), "#00ff00", "hue green");
  eq(hueToHex(240), "#0000ff", "hue blue");
  console.log("color.ts self-check passed");
}
