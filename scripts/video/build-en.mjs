import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { renderSlides, WORK } from "./slides-en.mjs";

const ROOT = resolve(".");
const OUT = resolve("out/video/mada-fixer-explainer-en.mp4");
const VOICE = process.env.VOICE ?? "en-US-BrianNeural";
const RATE = process.env.RATE ?? "+4%";
const FPS = 25;

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", ...opts });
  if (r.status !== 0) throw new Error(`${cmd} failed (${r.status}):\n${(r.stderr || "").slice(-3000)}`);
  return r.stdout || "";
};
const ff = (args) => run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]);
const duration = (file) =>
  Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]).trim());

const SEGMENTS = [
  { id: "s1", slide: "title", tail: 1.5, min: 13, text:
    "For millions of Arabic speakers, a screen reader is the only way online. Most Arabic sites are still unusable with one. Mada Fixer changes that." },
  { id: "s2", slide: "problem", tail: 1.4, min: 15, text:
    "This demo store has real problems: images with no description, emoji buttons with no name, controls that only respond to a mouse, and low-contrast Arabic text. A screen reader just says: image, image, button, button." },
  { id: "s3", slide: "idea", tail: 1.4, min: 17, text:
    "Mada Fixer is not another audit tool. It is an agent that changes the page: it sees the screen like a user, understands what is missing, fixes it, and proves the fix, with Meta models SAM 3.1, Muse Spark and Muse Wonder." },
  { id: "s4", slide: "pipeline", tail: 1.4, min: 22, text:
    "Four stages. See: a real browser, axe-core, keyboard checks and Arabic-specific contrast. Understand: Muse Spark writes the Arabic names, while a critic compares each proposal to the pixels and sends low confidence to human review. Fix: every change is applied to the live page, with a diff. Verify: we re-scan issues, screen-reader output and layout movement." },
  { id: "d1", demo: "d1", tail: 1.6, min: 26, text:
    "Let's watch it work. We open the interface, point it at the demo store, enable Beautify, and start the run. The agent scans the live page, proposes fixes, applies them, and immediately re-audits. Look at the result: 24 targeted WCAG issues down to zero, 8 unnamed elements down to zero, 36 fixes applied. These before-and-after captures come from the same run." },
  { id: "s5", slide: "beautify", tail: 1.2, min: 9, text:
    "Beautify is opt-in and auditable: an accessible theme and clearer Arabic copy, with every number preserved." },
  { id: "d2", demo: "d2", tail: 1.6, min: 21, text:
    "Here is the rebuilt page, live in the browser. A high-contrast theme, readable Arabic type, visible keyboard focus, and nine copy rewrites, all marked as intentional, not hidden. Prices, discounts and product names stay exactly the same, and screen-reader output now gives real Arabic labels instead of button, button, image." },
  { id: "s6", slide: "proof", tail: 1.2, min: 13, text:
    "Every change is measured. The report shows issues before and after, screen-reader output, pixel change and element movement, and anything that needs human judgment is listed, not guessed." },
  { id: "d3", demo: "d3", tail: 1.6, min: 17, text:
    "This is the report. Each rewrite is validated, with its confidence score. The audit table keeps the remaining structure issues visible for a human. And in repo mode, Muse Wonder returns a small, reviewable diff against the source." },
  { id: "s7", slide: "close", tail: 2.4, min: 12, text:
    "Mada Fixer: real Arabic accessibility, from audit to fix to proof, with Meta models. Open source, and built entirely during the hackathon." },
];

const segFile = (id) => join(WORK, `seg-${id}`);
const framesFor = (d) => Math.round(d * FPS);
const dims = ["-r", String(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", "-an"];

async function prepareDemo() {
  const demo = "out/video/mada-fixer-demo.mp4";
  const speed = join(WORK, "overlay-speed.png");
  const inset = "scale=1280:656,setsar=1,pad=1280:720:0:0:color=black,drawbox=x=0:y=656:w=1280:h=1:color=0x1f2937@1:t=fill";

  ff(["-i", demo, "-i", speed, "-filter_complex",
    "[0:v]trim=start=0.5:end=7.4,setpts=(PTS-STARTPTS)/0.9,fps=25[a];" +
    "[0:v]trim=start=7.4:end=23,setpts=(PTS-STARTPTS)/5,fps=25[b];" +
    "[0:v]trim=start=23:end=33,setpts=(PTS-STARTPTS)/0.85,fps=25[c];" +
    "[a][b][c]concat=n=3:v=1:a=0[base];" +
    `[base]${inset}[p];[p][1:v]overlay=0:0:enable='between(t,7.9,10.5)'[out]`,
    "-map", "[out]", ...dims, join(WORK, "demo-d1.mp4")]);

  ff(["-i", demo, "-filter_complex",
    `[0:v]trim=start=31.5:end=42.5,setpts=(PTS-STARTPTS)/0.6,fps=25[base];[base]${inset}[out]`,
    "-map", "[out]", ...dims, join(WORK, "demo-d2.mp4")]);

  ff(["-i", demo, "-filter_complex",
    `[0:v]trim=start=39.5:end=47.5,setpts=(PTS-STARTPTS)/0.55,fps=25[base];[base]${inset}[out]`,
    "-map", "[out]", ...dims, join(WORK, "demo-d3.mp4")]);
}

function slideVideo(slide, d, out) {
  const frames = framesFor(d);
  ff(["-loop", "1", "-i", join(WORK, `slide-${slide}.png`), "-frames:v", String(frames),
    "-vf", "zoompan=z='min(1+0.0002*on,1.02)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1280x720:fps=25,format=yuv420p",
    ...dims, out]);
}

function demoVideo(src, d, out) {
  const frames = framesFor(d);
  ff(["-i", src, "-vf",
    `tpad=stop_mode=clone:stop_duration=${d},trim=duration=${d},setpts=PTS-STARTPTS,fps=25,format=yuv420p`,
    "-frames:v", String(frames), ...dims, out]);
}

async function concatVideos(files, out) {
  const list = join(WORK, `list-${Date.now()}.txt`);
  await writeFile(list, files.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n"));
  ff(["-f", "concat", "-safe", "0", "-i", list, "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", "-r", String(FPS), "-an", out]);
}

async function buildRaw(seg, d) {
  const raw = join(WORK, `raw-${seg.id}.mp4`);
  if (seg.demo) {
    demoVideo(join(WORK, `demo-${seg.demo}.mp4`), d, raw);
    return raw;
  }
  slideVideo(seg.slide, d, raw);
  return raw;
}

async function finish(seg, d) {
  const raw = await buildRaw(seg, d);
  const out = segFile(seg.id) + ".mp4";
  const frames = framesFor(d);
  ff(["-i", raw, "-vf", `fade=t=in:st=0:d=0.3,fade=t=out:st=${(d - 0.3).toFixed(3)}:d=0.3,format=yuv420p`,
    "-frames:v", String(frames), ...dims, out]);
  return out;
}

const toSec = (s) => {
  const m = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(s.trim());
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000 : 0;
};
const stamp = (t) => {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), r = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(r).padStart(3, "0")}`;
};
function parseSrt(text) {
  const out = [];
  for (const block of text.replace(/\r/g, "").split(/\n\n+/)) {
    const lines = block.split("\n").filter(Boolean);
    const ti = lines.findIndex((l) => l.includes("-->"));
    if (ti < 0) continue;
    const [a, b] = lines[ti].split("-->").map((x) => x.trim());
    out.push({ start: toSec(a), end: toSec(b), text: lines.slice(ti + 1).join(" ") });
  }
  return out;
}

const MAX_CUE = 90;
function splitText(text) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= MAX_CUE) return [t];

  const out = [];
  let line = "";
  const push = (piece) => {
    if (!line) line = piece;
    else if ((line + " " + piece).length <= MAX_CUE) line += " " + piece;
    else {
      out.push(line);
      line = piece;
    }
  };
  for (const clause of t.split(/(?<=[,;])\s+/)) {
    if (clause.length <= MAX_CUE) push(clause);
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

async function main() {
  const ttsOnly = Boolean(process.env.TTS_ONLY);
  if (ttsOnly) {
    await mkdir(WORK, { recursive: true });
  } else {
    await rm(WORK, { recursive: true, force: true });
    await mkdir(WORK, { recursive: true });
    await renderSlides();
    await prepareDemo();
    run("node", ["scripts/video/music.mjs"], { env: { ...process.env, VIDEO_MUSIC_OUT: "out/video/work-en/music.wav" } });
  }

  const d = {};
  for (const seg of SEGMENTS) {
    const mp3 = join(WORK, `${seg.id}.mp3`);
    const srt = join(WORK, `${seg.id}.srt`);
    run("python", ["-m", "edge_tts", "--voice", VOICE, "--rate", RATE, "--text", seg.text, "--write-media", mp3, "--write-subtitles", srt]);
    const narr = duration(mp3);
    d[seg.id] = Math.max(narr + seg.tail, seg.min ?? 0);
    console.log(`${seg.id}: narration ${narr.toFixed(2)}s -> segment ${d[seg.id].toFixed(2)}s`);
  }
  if (process.env.TTS_ONLY) {
    console.log(`planned total ${Object.values(d).reduce((a, b) => a + b, 0).toFixed(2)}s`);
    return;
  }
  let total = Object.values(d).reduce((a, b) => a + b, 0);
  if (total < 180) {
    let need = 180 - total;
    const order = SEGMENTS.filter((s) => s.slide).map((s) => s.id);
    while (need > 0.05) {
      for (const id of order) {
        const add = Math.min(2, need);
        d[id] += add;
        need -= add;
        if (need <= 0.05) break;
      }
    }
    total = 180;
    console.log("distributed holds across slides");
  }
  console.log(`planned total ${total.toFixed(2)}s`);

  const videoParts = [];
  let t = 0;
  const cues = [];
  for (const seg of SEGMENTS) {
    const D = d[seg.id];
    const out = await finish(seg, D);
    videoParts.push(out);

    const wav = join(WORK, `${seg.id}.wav`);
    ff(["-i", join(WORK, `${seg.id}.mp3`), "-af", `adelay=400|400,apad=pad_dur=${D},atrim=0:${D},aresample=48000`,
      "-ac", "2", "-ar", "48000", wav]);

    if (seg.demo) {
      const srtText = await readFile(join(WORK, `${seg.id}.srt`), "utf8");
      for (const c of parseSrt(srtText)) {
        const ws = t + 0.4 + c.start;
        const we = Math.min(t + D - 0.08, t + 0.4 + c.end);
        const parts = splitText(c.text);
        const sum = parts.reduce((n, p) => n + p.length, 0);
        let cs = ws;
        parts.forEach((p, i) => {
          const span = i === parts.length - 1 ? we - cs : Math.max(0.7, ((we - ws) * p.length) / sum);
          const ce = Math.min(we, cs + span);
          if (ce - cs > 0.25) cues.push({ start: cs, end: ce, text: p });
          cs = ce;
        });
      }
    }
    t += D;
  }

  const list = join(WORK, "video-list.txt");
  await writeFile(list, videoParts.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n"));
  ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", join(WORK, "video.mp4")]);

  const alist = join(WORK, "audio-list.txt");
  await writeFile(alist, SEGMENTS.map((s) => `file '${join(WORK, `${s.id}.wav`).replace(/\\/g, "/")}'`).join("\n"));
  ff(["-f", "concat", "-safe", "0", "-i", alist, "-c", "copy", join(WORK, "voice.wav")]);

  ff(["-i", join(WORK, "voice.wav"), "-i", join(WORK, "music.wav"), "-filter_complex",
    "[1:a]volume=0.22[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=0,loudnorm=I=-16:LRA=11:TP=-1.5[a]",
    "-map", "[a]", "-ar", "48000", "-ac", "2", join(WORK, "mix.wav")]);

  const srt = cues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}`).join("\n\n") + "\n";
  await writeFile(join(WORK, "subs.srt"), srt);

  const cs = (x) => {
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
  await writeFile(join(WORK, "subs-final.ass"), ass);

  ff(["-i", join(WORK, "video.mp4"), "-i", join(WORK, "mix.wav"),
    "-vf", `ass=out/video/work-en/subs-final.ass,tpad=stop_mode=clone:stop_duration=0.6`,
    "-af", "apad=pad_dur=0.6",
    "-t", (total + 0.2).toFixed(2),
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", OUT]);

  const final = duration(OUT);
  console.log(`\nvideo: ${OUT}`);
  console.log(`duration: ${final.toFixed(2)}s`);
  console.log(`cues: ${cues.length}`);
  if (final < 179.9) throw new Error(`video is ${final.toFixed(1)}s, needs at least 180s`);
}

await main();
