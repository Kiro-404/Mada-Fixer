import { askJson } from "../models/meta.js";
import type { El } from "../types.js";
import { asObject, confidence, text } from "../validate.js";

const CRITIC = `إنت مراجع إتاحة صارم. شوف صورة العنصر والسياق والنص المقترح. هل النص بيوصف وظيفة العنصر بدقة، بعربي سليم ومختصر، ومن غير تخمين؟ رجّع JSON بس: {"score":0.0,"better":"نص أفضل، أو فاضي لو الحالي كويس"}`;

// Generate -> critique -> refine: a second pass checks the proposal against the pixels and can rewrite it once.
// Final confidence = min(generator, critic), so a doubtful label never gets auto-applied.
export async function critique(e: El, attr: string, value: string, conf: number) {
  let current = value.trim();
  let score = Math.min(1, Math.max(0, Number.isFinite(conf) ? conf : 0));
  let rounds = 0;
  if (!current) return { value: "", confidence: 0, rounds };
  for (let r = 0; r < 2; r++) {
    rounds++;
    const raw = await askJson<Record<string, unknown>>(CRITIC, `العنصر:\n${e.html}\n\nالسياق:\n${e.context}\n\nالسمة: ${attr}\nالنص المقترح: ${current}`, e.shot);
    const c = asObject(raw);
    const s = confidence(c.score);
    if (s === null) return { value: current, confidence: Math.min(score, 0.5), rounds, invalid: true }; // malformed critic => human review, never auto-apply
    score = Math.min(score, s);
    if (s >= 0.7) break;
    const better = text(c.better, 300);
    if (r === 0 && better && better !== current) { current = better; continue; }
    break;
  }
  return { value: current, confidence: Number.isFinite(score) ? score : 0, rounds };
}
