// Quick test: call Groq directly to debug what's being returned
import "../src/env.js";

const key = process.env.FALLBACK_API_KEY ?? "";
const base = process.env.FALLBACK_API_BASE ?? "https://api.groq.com/openai/v1";

console.log("key:", key.slice(0, 12) + "...\n");

// List available models first
const mR = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
const mJ = await mR.json() as any;
const available: string[] = mJ.data?.map((m: any) => m.id) ?? [];
console.log("Available models:\n" + available.join("\n"));

// Pick best available Llama model
const preferred = ["llama-3.3-70b-versatile","llama3-70b-8192","llama3-groq-70b-8192-tool-use-preview","llama-3.1-70b-versatile","mixtral-8x7b-32768"];
const model = preferred.find(m => available.includes(m)) ?? available[0];
console.log("\n→ Using model:", model, "\n");

// Test 1: with response_format json_object (Arabic system prompt)
const r = await fetch(`${base}/chat/completions`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
  body: JSON.stringify({
    model,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: 'أنت خبير إتاحة. رجّع JSON بس: {"label":"...","confidence":0.0}' },
      { role: "user", content: [{ type: "text", text: 'العنصر:\n<img src="x">\n\nالسياق:\nسلة التسوق' }] },
    ],
  }),
});

console.log("HTTP status:", r.status);
const j = await r.json() as any;

if (!r.ok) {
  console.error("ERROR from Groq:", JSON.stringify(j, null, 2));
  process.exit(1);
}

const txt: string = j.choices?.[0]?.message?.content ?? "";
console.log("Raw response:", txt);
console.log("Usage:", j.usage);

try {
  const parsed = JSON.parse(txt);
  console.log("\n✅ Valid JSON:", parsed);
} catch {
  console.log("\n❌ Not valid JSON — trying regex extract...");
  const m = txt.match(/\{[\s\S]*\}/);
  if (m) console.log("Extracted:", JSON.parse(m[0]));
  else console.log("No JSON block found");
}
