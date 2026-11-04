/**
 * Mada Fixer — Web UI Server
 * Run: npm run serve
 * Opens at http://localhost:3000
 *
 * Features:
 *  - URL input → live SSE progress stream
 *  - Before/after screenshots side-by-side
 *  - Browseable fixed page in an iframe
 *  - Full accessibility report embed
 */
import "./src/env.js";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";

const PORT = Number(process.env.PORT ?? 3000);

// ─── SSE progress hook ──────────────────────────────────────────────────────
let _sseSend: ((line: string) => void) | null = null;
const origErr = console.error.bind(console);
console.error = (...args: unknown[]) => {
  origErr(...args);
  _sseSend?.(args.map(String).join(" "));
};

// ─── MIME types ─────────────────────────────────────────────────────────────
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".png":  "image/png",
  ".json": "application/json",
  ".txt":  "text/plain; charset=utf-8",
  ".diff": "text/plain; charset=utf-8",
};

// ─── Inline UI ───────────────────────────────────────────────────────────────
const UI = /* html */`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mada Fixer</title>
<style>
  :root{--bg:#0d1117;--card:#161b22;--border:#30363d;--accent:#238636;--accent2:#1f6feb;--warn:#d29922;--err:#da3633;--fg:#e6edf3;--muted:#8b949e;--radius:10px;--font:system-ui,'Segoe UI',sans-serif}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:var(--font);background:var(--bg);color:var(--fg);min-height:100vh}
  header{background:linear-gradient(135deg,#0d1117 0%,#161b22 100%);border-bottom:1px solid var(--border);padding:20px 32px;display:flex;align-items:center;gap:14px}
  header svg{width:36px;height:36px;flex-shrink:0}
  header h1{font-size:22px;font-weight:700}header p{color:var(--muted);font-size:13px;margin-top:3px}
  main{max-width:1100px;margin:0 auto;padding:32px 24px}
  .input-row{display:flex;gap:10px;margin-bottom:24px}
  input[type=text]{flex:1;padding:12px 16px;border-radius:var(--radius);border:1px solid var(--border);background:#21262d;color:var(--fg);font-size:15px;outline:none;transition:.2s}
  input[type=text]:focus{border-color:var(--accent2)}
  button{padding:12px 24px;border-radius:var(--radius);border:none;cursor:pointer;font-size:15px;font-weight:600;transition:.2s}
  #runBtn{background:var(--accent);color:#fff}#runBtn:hover{filter:brightness(1.15)}#runBtn:disabled{opacity:.5;cursor:not-allowed}
  #browseBtn{background:var(--accent2);color:#fff;display:none}
  .log-box{background:#010409;border:1px solid var(--border);border-radius:var(--radius);padding:16px;font-family:monospace;font-size:13px;height:220px;overflow-y:auto;margin-bottom:24px;color:#58a6ff}
  .log-box .ok{color:#3fb950}.log-box .err{color:var(--err)}.log-box .muted{color:var(--muted)}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:24px}
  .card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:16px}
  .card small{display:block;color:var(--muted);font-size:12px;margin-bottom:4px}
  .card .val{font-size:26px;font-weight:700}.card .arrow{color:var(--accent);font-size:20px}
  .cols2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
  .cols2 .box{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
  .box-head{padding:10px 14px;border-bottom:1px solid var(--border);font-size:13px;font-weight:600;color:var(--muted)}
  .box img{width:100%;display:block}
  iframe{width:100%;height:600px;border:none;border-radius:0 0 var(--radius) var(--radius)}
  .section{margin-bottom:28px}
  .section h2{font-size:16px;margin-bottom:12px;color:var(--muted);font-weight:600;letter-spacing:.5px;text-transform:uppercase;font-size:12px}
  #results{display:none}
  .badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700}
  .badge.green{background:#238636;color:#fff}.badge.red{background:#da3633;color:#fff}
  .tab-bar{display:flex;gap:2px;margin-bottom:0;border-bottom:1px solid var(--border)}
  .tab{padding:8px 18px;cursor:pointer;font-size:14px;color:var(--muted);border-bottom:2px solid transparent;transition:.2s}
  .tab.active{color:var(--fg);border-color:var(--accent2)}
  .tab-pane{display:none}.tab-pane.active{display:block}
  .report-frame{width:100%;height:700px;border:none;border-radius:0 0 var(--radius) var(--radius);background:#fff}
  .fixed-frame{width:100%;height:600px;border:none;border-radius:0 0 var(--radius) var(--radius)}
  @media(max-width:640px){.cols2{grid-template-columns:1fr}}
</style>
</head>
<body>
<header>
  <svg viewBox="0 0 36 36" fill="none"><circle cx="18" cy="18" r="18" fill="#238636"/><path d="M10 24 Q18 10 26 24" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/><circle cx="18" cy="14" r="2" fill="#fff"/></svg>
  <div><h1>Mada Fixer</h1><p>أداة تصحيح إتاحة المواقع العربية تلقائياً بالذكاء الاصطناعي</p></div>
</header>

<main>
  <div style="display:flex;gap:8px;margin-bottom:14px;align-items:center;flex-wrap:wrap">
    <span style="font-size:13px;color:var(--muted)">جرّب نماذج جاهزة:</span>
    <button type="button" onclick="setPreset('http://localhost:3000/demo/nasa-space.html')" style="padding:6px 14px;font-size:12px;background:#1e293b;color:#38bdf8;border:1px solid #334155;border-radius:20px;cursor:pointer">🪐 موقع رحلات الفضاء والمريخ (NASA Demo)</button>
    <button type="button" onclick="setPreset('http://localhost:3000/demo/index.html')" style="padding:6px 14px;font-size:12px;background:#1e293b;color:#f59e0b;border:1px solid #334155;border-radius:20px;cursor:pointer">🛒 متجر النيل الإلكتروني</button>
  </div>

  <div class="input-row">
    <input type="text" id="urlInput" placeholder="أدخل رابط الموقع — مثال: https://example.com  أو  http://localhost:3000/demo/nasa-space.html" value="http://localhost:3000/demo/nasa-space.html">
    <button id="runBtn" onclick="startFix()">🚀 فحص وتصحيح</button>
    <button id="browseBtn" onclick="showFixed()">🌐 تصفّح النسخة المصلّحة</button>
  </div>

  <label style="display:flex;align-items:center;gap:8px;margin:-10px 0 16px;font-size:13px;color:var(--muted);cursor:pointer">
    <input type="checkbox" id="beautify" checked style="width:16px;height:16px;accent-color:#0ea5e9">
    تحسين الشكل والنصوص (يغيّر تصميم الصفحة وصياغة العناوين بشكل مقصود)
  </label>

  <div class="log-box" id="log"><span class="muted">في انتظار بدء الفحص…</span></div>

  <div id="results">
    <!-- Stats -->
    <div class="section">
      <h2>نتائج التصحيح</h2>
      <div class="cards" id="cards"></div>
      <div id="visualNote" style="background:#161b22;border:1px solid #30363d;border-radius:var(--radius);padding:14px 18px;margin-bottom:20px;font-size:13px;line-height:1.6;color:#8b949e">
        <strong style="color:#e6edf3">🎯 ليه نسبة التغيير البصري صغيرة؟</strong><br>
        تعديلات الإتاحة بتضيف سمات برمجية داخل الـ DOM مخصصة لقارئات الشاشة، وبتغيّر لون النص فقط لو التباين منخفض. لما وضع تحسين الشكل يبقى مفعّل، التغيير البصري هيبقى مقصود وواضح.
      </div>
    </div>

    <!-- Before / After screenshots -->
    <div class="section">
      <h2>لقطات الشاشة قبل وبعد</h2>
      <div class="cols2">
        <div class="box"><div class="box-head">❌ قبل التصحيح</div><img id="imgBefore" alt="لقطة الشاشة قبل التصحيح"></div>
        <div class="box"><div class="box-head">✅ بعد التصحيح</div><img id="imgAfter"  alt="لقطة الشاشة بعد التصحيح"></div>
      </div>
    </div>

    <!-- Tabs: Fixed page / Full report -->
    <div class="section">
      <div class="tab-bar" style="display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;gap:2px">
          <div class="tab active" onclick="switchTab('report')">📄 التقرير الكامل</div>
          <div class="tab" id="fixedTab" onclick="switchTab('fixed')">🌐 الصفحة المصلّحة (معاينة)</div>
        </div>
        <a id="openNewTabBtn" href="/out/page-fixed.html" target="_blank" style="margin-inline-start:auto;text-decoration:none;display:inline-flex;align-items:center;gap:6px;font-size:13px;padding:6px 14px;background:#1f6feb;color:#fff;border-radius:6px;font-weight:600">🔗 فتح الصفحة المصلّحة في نافذة كاملة</a>
      </div>
      <div class="box">
        <div class="tab-pane active" id="pane-report">
          <iframe class="report-frame" id="reportFrame" title="تقرير التصحيح الكامل"></iframe>
        </div>
        <div class="tab-pane" id="pane-fixed">
          <iframe class="fixed-frame" id="fixedFrame" title="الصفحة المصلّحة"></iframe>
        </div>
      </div>
    </div>
  </div>
</main>

<script>
let runId = 0;
const log = document.getElementById('log');
const results = document.getElementById('results');

function appendLog(text, cls='') {
  const line = document.createElement('div');
  if (cls) line.className = cls;
  line.textContent = text;
  if (log.firstChild?.className === 'muted') log.innerHTML = '';
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t,i) => t.classList.toggle('active', ['report','fixed'][i]===name));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id==='pane-'+name));
}

function showFixed() { switchTab('fixed'); }
function setPreset(url) { document.getElementById('urlInput').value = url; }

async function startFix() {
  const url = document.getElementById('urlInput').value.trim();
  if (!url) return;
  const btn = document.getElementById('runBtn');
  btn.disabled = true; btn.textContent = '⏳ جاري الفحص…';
  document.getElementById('browseBtn').style.display = 'none';
  results.style.display = 'none';
  log.innerHTML = '';
  appendLog('🚀 بدء الفحص: ' + url);

  const myRun = ++runId;
  let finished = false; // prevent onerror from firing after error/done event

  const endRun = (ok) => {
    if (finished) return; finished = true;
    es.close(); btn.disabled = false; btn.textContent = '🚀 فحص وتصحيح';
    if (!ok) appendLog('💡 تلميح: تأكد أن الرابط صحيح والموقع يعمل.', 'muted');
  };

  const beautify = document.getElementById('beautify')?.checked ? '1' : '0';
  const es = new EventSource('/fix?url=' + encodeURIComponent(url) + '&beautify=' + beautify);

  es.addEventListener('log', e => {
    if(runId!==myRun) return;
    const d = JSON.parse(e.data);
    appendLog(d, d.includes('✅')?'ok': d.includes('⚠️')||d.includes('skip')||d.includes('Error')?'err':'');
  });
  es.addEventListener('progress', e => { if(runId!==myRun) return; appendLog('⚙️ ' + JSON.parse(e.data)); });
  es.addEventListener('done', e => {
    if(runId!==myRun || finished) return;
    endRun(true);
    appendLog('✅ اكتمل التصحيح!', 'ok');
    showResults(JSON.parse(e.data));
  });
  es.addEventListener('error', e => {
    if(runId!==myRun || finished) return;
    const raw = e.data ? JSON.parse(e.data) : '';
    let msg = raw;
    if (/ERR_CONNECTION_REFUSED|ERR_CONNECTION_TIMED_OUT/.test(raw)) msg = 'الموقع لا يستجيب — تأكد أنه يعمل حالياً.';
    else if (/ERR_NAME_NOT_RESOLVED/.test(raw))  msg = 'الرابط غير موجود — تحقق من الاسم.';
    else if (/ERR_CERT|SSL/.test(raw))           msg = 'خطأ في شهادة HTTPS للموقع.';
    else if (/time budget/.test(raw))            msg = 'استغرق الفحص وقتاً أطول من المسموح.';
    else if (!msg)                               msg = 'خطأ غير معروف.';
    appendLog('❌ ' + msg, 'err');
    endRun(false);
  });
  es.onerror = () => {
    if(runId!==myRun || finished) return;
    if(es.readyState === 2) { appendLog('❌ انقطع الاتصال بالخادم.', 'err'); endRun(false); }
  };
}

function card(label, before, after) {
  const improved = after < before;
  return \`<div class="card"><small>\${label}</small><div class="val">\${before} <span class="arrow">→</span> <span class="\${improved?'ok':'err'}" style="color:\${improved?'#3fb950':'#da3633'}">\${after}</span></div></div>\`;
}
function cardSingle(label, val) {
  return \`<div class="card"><small>\${label}</small><div class="val">\${val}</div></div>\`;
}

function showResults(r) {
  const applied = r.fixes?.filter(f=>f.status==='applied').length ?? 0;
  document.getElementById('cards').innerHTML =
    card('مخالفات WCAG المستهدفة', r.targetedBefore, r.targetedAfter) +
    card('عناصر بدون اسم (قارئ الشاشة)', r.unnamedBefore, r.unnamedAfter) +
    cardSingle('إصلاحات مُطبَّقة', applied) +
    (r.beautify ? cardSingle('تحسينات شكل/نص مقصودة', (r.beautifyApplied ?? 0)) : '') +
    cardSingle(r.beautify ? 'عناصر اتحركت (تغيير مقصود)' : 'تحريك عناصر', r.layoutShift === 0 ? '✅ صفر' : '🎨 '+r.layoutShift) +
    cardSingle('تغيير بصري', (r.visualDiff*100).toFixed(2)+'%');

  const note = document.getElementById('visualNote');
  if (note) note.innerHTML = r.beautify
    ? '<strong style="color:#e6edf3">🎨 وضع تحسين الشكل والنصوص مفعّل</strong><br>التغيير البصري ده <strong>مقصود</strong>: الأداة بتطبّق ثيم تصميم متاح (ألوان وتباعد وخطوط) وبتعيد صياغة العناوين وأزرار الإجراءات بالعربي. الإصلاحات البرمجية للإتاحة شغالة في نفس الوقت، والصفحة المصلّحة تحت فيها النص الجديد والتصميم الجديد.'
    : '<strong style="color:#e6edf3">🎯 ليه نسبة التغيير البصري صغيرة؟</strong><br>تعديلات الإتاحة بتضيف سمات برمجية داخل الـ DOM مخصصة لقارئات الشاشة، وبتغيّر لون النص فقط لو التباين منخفض. فعّل «تحسين الشكل والنصوص» لو عايز تغيير تصميم مرئي مقصود.';

  const t = Date.now();
  document.getElementById('imgBefore').src = '/out/before.png?t='+t;
  document.getElementById('imgAfter').src  = '/out/after.png?t='+t;
  document.getElementById('reportFrame').src = '/out/report.html?t='+t;
  document.getElementById('fixedFrame').src  = '/out/page-fixed.html?t='+t;
  document.getElementById('browseBtn').style.display = 'inline-block';

  results.style.display = 'block';
  results.scrollIntoView({ behavior: 'smooth' });
}
</script>
</body>
</html>`;

// ─── Request handler ─────────────────────────────────────────────────────────
async function handler(req: IncomingMessage, res: ServerResponse) {
  const reqUrl = new URL(req.url ?? "/", `http://localhost`);
  const path = reqUrl.pathname;

  // UI
  if (path === "/" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(UI);
    return;
  }

  // Static files from out/
  if (path.startsWith("/out/") && req.method === "GET") {
    const file = join("out", path.slice(5));
    try {
      const data = await readFile(file);
      const ct = MIME[extname(file)] ?? "application/octet-stream";
      res.writeHead(200, { "Content-Type": ct, "Cache-Control": "no-cache" });
      res.end(data);
    } catch { res.writeHead(404); res.end("Not found"); }
    return;
  }

  // Static files from demo/
  if (path.startsWith("/demo/") && req.method === "GET") {
    const file = join("demo", path.slice(6));
    try {
      const data = await readFile(file);
      const ct = MIME[extname(file)] ?? "text/html; charset=utf-8";
      res.writeHead(200, { "Content-Type": ct, "Cache-Control": "no-cache" });
      res.end(data);
    } catch { res.writeHead(404); res.end("Not found"); }
    return;
  }

  // SSE fix endpoint — GET /fix?url=...
  if (path === "/fix" && req.method === "GET") {
    const targetUrl = reqUrl.searchParams.get("url") ?? "";
    const beautify = reqUrl.searchParams.get("beautify") === "1";
    if (!targetUrl) { res.writeHead(400); res.end("Missing url"); return; }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*",
    });

    const send = (event: string, data: unknown) =>
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    const heartbeat = setInterval(() => res.write(": ping\n\n"), 15000);
    _sseSend = (line) => send("log", line);

    send("log", `🔍 فحص: ${targetUrl}`);

    try {
      // Dynamic import so env is already loaded
      const { run } = await import("./src/orchestrator.js");
      send("progress", "جاري تشغيل المتصفح…");
      const report = await run(targetUrl, "out", undefined, { beautify });
      send("done", report);
    } catch (e: unknown) {
      send("error", String(e));
    } finally {
      clearInterval(heartbeat);
      _sseSend = null;
      res.end();
    }
    return;
  }

  res.writeHead(404); res.end("Not found");
}

// ─── Start ───────────────────────────────────────────────────────────────────
createServer(handler).listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║  🌐  Mada Fixer UI                       ║
║  http://localhost:${PORT}                    ║
╚══════════════════════════════════════════╝
`);
});
