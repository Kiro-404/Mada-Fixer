// Small shared helpers (kept dependency-free).

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const n = Math.max(1, Math.min(items.length, Math.floor(limit) || 1));
  const workers = Array.from({ length: n }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export function envNum(name: string, fallback: number, min = -Infinity, max = Infinity): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Arabic-aware normalisation used for visible-label / accessible-label comparisons (WCAG 2.5.3 style check).
export function normalizeText(s: string): string {
  return s
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "") // Arabic diacritics + tatweel
    .replace(/[\s\u00A0]+/g, " ")
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .trim()
    .toLowerCase();
}
