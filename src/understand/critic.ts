import { askJson } from "../models/meta.js";
import type { El } from "../types.js";

const CRITIC = `إنت مراجع إتاحة صارم. شوف صورة العنصر والسياق والنص المقترح. هل النص بيوصف وظيفة العنصر بدقة، بعربي سليم ومختصر، ومن غير تخمين؟ رجّع JSON بس: {"score":0.0,"better":"نص أفضل، أو فاضي لو الحالي كويس"}`;

// Generate -> critique -> refine: a second pass checks the proposal against the pixels and can rewrite it once.
// Final confidence = min(generator, critic), so a doubtful label never gets auto-applied.
export async function critique(e: El, attr: string, value: string, conf: number) {
  let score = conf, rounds = 0;
  for (let r = 0; r < 2; r++) {
    rounds++;
    const c = await askJson<{ score: number; better: string }>(CRITIC, `العنصر:\n${e.html}\n\nالسياق:\n${e.context}\n\nالسمة: ${attr}\nالنص المقترح: ${value}`, e.shot);
    score = Math.min(conf, c.score);
    if (c.score >= 0.7) break;
    if (r === 0 && c.better) value = c.better; else break;
  }
  return { value, confidence: score, rounds };
}
