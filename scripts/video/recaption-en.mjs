import { spawnSync } from "node:child_process";
import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = resolve(".");
const WORK = resolve("out/video/work-en");
const OUT = resolve("out/video/mada-fixer-explainer-en.mp4");
const TMP = resolve("out/video/mada-fixer-explainer-en.tmp.mp4");
const MAX = 90;

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${cmd} failed:\n${(r.stderr || "").slice(-3000)}`);
  return r.stdout || "";
};

const toSec = (s) => {
  const m = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(s.trim());
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000 : 0;
};
const stamp = (t) => {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), r = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(r).padStart(3, "0")}`;
};

function splitText(text) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= MAX) return [t];

  const out = [];
  let line = "";
  const push = (piece) => {
    if (!line) line = piece;
    else if ((line + " " + piece).length <= MAX) line += " " + piece;
    else {
      out.push(line);
      line = piece;
    }
  };
  for (const clause of t.split(/(?<=[,;])\s+/)) {
    if (clause.length <= MAX) push(clause);
    else for (const w of clause.split(" ")) push(w);
  }
  if (line) out.push(line);
  while (out.length > 1) {
    const last = out[out.length - 1];
    const prev = out[out.length - 2];
    if (last.length >= 18 || (prev + " " + last).length > 90) break;
    out[out.length - 2] = prev + " " + last;
    out.pop();
  }
  return out;
}

const src = await readFile(resolve(WORK, "subs.srt"), "utf8");
const cues = [];
for (const block of src.replace(/\r/g, "").split(/\n\n+/)) {
  const lines = block.split("\n").filter(Boolean);
  const ti = lines.findIndex((l) => l.includes("-->"));
  if (ti < 0) continue;
  const [a, b] = lines[ti].split("-->").map((x) => x.trim());
  const start = toSec(a), end = toSec(b);
  const text = lines.slice(ti + 1).join(" ").replace(/\s+/g, " ").trim();
  const parts = splitText(text);
  const total = parts.reduce((n, p) => n + p.length, 0);
  let t = start;
  parts.forEach((p, i) => {
    const span = i === parts.length - 1 ? end - t : Math.max(0.7, ((end - start) * p.length) / total);
    const cueEnd = Math.min(end, t + span);
    if (cueEnd - t > 0.25) cues.push({ start: t, end: cueEnd, text: p });
    t = cueEnd;
  });
}
if (!cues.length) throw new Error("no cues produced");

const srt = cues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}`).join("\n\n") + "\n";
await writeFile(resolve(WORK, "subs-final.srt"), srt);

const cs = (t) => {
  const x = Math.max(0, t);
  const h = Math.floor(x / 3600), m = Math.floor((x % 3600) / 60), s = Math.floor(x % 60), c = Math.round((x % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
};
const ass = [
  "[Script Info]",
  "ScriptType: v4.00+",
  "PlayResX: 1280",
  "PlayResY: 720",
  "WrapStyle: 2",
  "ScaledBorderAndShadow: yes",
  "",
  "[V4+ Styles]",
  "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
  "Style: Cap,Segoe UI,30,&H00FFFFFF,&H00FFFFFF,&H60000000,&H00000000,-1,0,0,0,100,100,0,0,1,1.4,0,2,20,20,12,1",
  "",
  "[Events]",
  "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ...cues.map((c) => `Dialogue: 0,${cs(c.start)},${cs(c.end)},Cap,,0,0,0,,${c.text}`),
].join("\n") + "\n";
await writeFile(resolve(WORK, "subs-final.ass"), ass);
console.log(`cues: ${cues.length}`);

run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error",
  "-i", resolve(WORK, "video.mp4"), "-i", resolve(WORK, "mix.wav"),
  "-vf", `ass=out/video/work-en/subs-final.ass,tpad=stop_mode=clone:stop_duration=0.6`,
  "-af", "apad=pad_dur=0.6",
  "-t", "180.2",
  "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", TMP]);
await rename(TMP, OUT);
console.log(OUT);
