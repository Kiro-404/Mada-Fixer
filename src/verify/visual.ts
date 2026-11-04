import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

// Share of changed pixels between two full-page screenshots. A page that only grows taller is compared on the
// shared area instead of reported as 100% different, so the number still reflects how much of the page actually moved.
export function diffRatio(a: Buffer, b: Buffer): number {
  const A = PNG.sync.read(a), B = PNG.sync.read(b);
  const w = Math.min(A.width, B.width), h = Math.min(A.height, B.height);
  if (!w || !h) return 1;
  const slice = (P: { width: number; height: number; data: Buffer }) => {
    if (P.width === w && P.height === h) return P.data;
    const out = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) P.data.copy(out, y * w * 4, y * P.width * 4, y * P.width * 4 + w * 4);
    return out;
  };
  return pixelmatch(slice(A), slice(B), undefined, w, h, { threshold: 0.1 }) / (w * h);
}
