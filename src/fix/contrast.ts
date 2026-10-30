// WCAG 1.4.3 contrast fix: keep the text color's hue and move it toward black or white by the smallest step that passes.
type RGB = [number, number, number];
const parse = (c: string): RGB | null => {
  const s = c.trim();
  const hex6 = /^#?([0-9a-f]{6})$/i.exec(s);
  if (hex6) { const n = parseInt(hex6[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const hex3 = /^#([0-9a-f]{3})$/i.exec(s);
  if (hex3) return [...hex3[1]].map((h) => parseInt(h + h, 16)) as RGB;
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(s);
  if (rgb) return [Math.round(+rgb[1]), Math.round(+rgb[2]), Math.round(+rgb[3])] as RGB;
  return null;
};
const lin = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]: RGB) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export const ratio = (a: RGB, b: RGB) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const hex = (c: RGB) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");

export function fixColor(fg: string, bg: string, target: number): string | null {
  const f = parse(fg), b = parse(bg);
  if (!f || !b || !Number.isFinite(target)) return null;
  let best: { t: number; c: RGB } | null = null;
  for (const end of [[0, 0, 0], [255, 255, 255]] as RGB[]) {
    for (let t = 0; t <= 1.0001; t += 0.02) {
      const c = f.map((v, i) => Math.round(v + (end[i] - v) * t)) as RGB;
      if (ratio(c, b) >= target + 0.05) { if (!best || t < best.t) best = { t, c }; break; }
    }
  }
  return best ? hex(best.c) : null;
}
