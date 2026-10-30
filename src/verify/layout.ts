import type { Page } from "playwright";

// Position + size of every element. Proves a fix did not move anything, even when pixels change on purpose (text color).
export function layoutSnapshot(page: Page): Promise<number[][]> {
  return page.evaluate(() => Array.from(document.body.querySelectorAll("*:not([data-mada-added])")).slice(0, 2000).map((el) => {
    const r = el.getBoundingClientRect();
    return [Math.round(r.x + window.scrollX), Math.round(r.y + window.scrollY), Math.round(r.width), Math.round(r.height)];
  }));
}
export function layoutShift(a: number[][], b: number[][]): number {
  if (a.length !== b.length) return Math.max(a.length, b.length);
  return a.filter((r, i) => r.some((v, j) => Math.abs(v - b[i][j]) > 1)).length;
}
