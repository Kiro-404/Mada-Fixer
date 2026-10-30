import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

// Share of changed pixels between two full-page screenshots (1 = different size). Fixes must not change the look.
export function diffRatio(a: Buffer, b: Buffer): number {
  const A = PNG.sync.read(a), B = PNG.sync.read(b);
  if (A.width !== B.width || A.height !== B.height) return 1;
  return pixelmatch(A.data, B.data, undefined, A.width, A.height, { threshold: 0.1 }) / (A.width * A.height);
}
