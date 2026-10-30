import { normalizeText } from "./util.js";

// Model output is untrusted JSON: never let a missing/typed-wrong field reach the DOM or the source patch.
export function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function text(v: unknown, max = 300): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
}

export function confidence(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(1, Math.max(0, n));
}

// If an element already exposes visible text, an accessible name that does not contain it breaks WCAG 2.5.3.
export function labelMatchesVisible(visible: string | undefined, label: string): boolean {
  const v = normalizeText(visible ?? "");
  if (!v || !/\p{L}/u.test(v)) return true;
  const l = normalizeText(label);
  return l === v || l.includes(v) || v.includes(l);
}
