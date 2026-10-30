import { launch, newPage } from "../src/browser.js";
import { scan } from "../src/verify/scan.js";
import { structureOps } from "../src/fix/structure.js";
import { applyFix } from "../src/fix/fix.js";
import { countUnnamed } from "../src/verify/transcript.js";
import { fixColor, ratio } from "../src/fix/contrast.js";
import { parseBoxes } from "../src/see/sam.js";
import { asObject, confidence, labelMatchesVisible, text } from "../src/validate.js";
import { prBody } from "../src/pr.js";
import { normalizeText } from "../src/util.js";
import type { Fix } from "../src/types.js";

// Detector tests on tiny pages (real browser, no model API). Run: npm run units
const browser = await launch();
const page = await newPage(browser);
const load = async (html: string) => { await page.setContent(html); await page.evaluate("window.__name = (f) => f"); };
const ids = async (html: string) => { await load(html); return (await scan(page)).map((i) => i.id); };
const AR = "هذا نص عربي طويل بما يكفي لاختبار الكشف عن الاتجاه";
const results: [string, boolean][] = [];
const t = (n: string, ok: boolean) => results.push([n, ok]);

t("Arabic page without dir is flagged", (await ids(`<body style="direction:ltr"><p>${AR}</p></body>`)).includes("arabic-dir"));
t("Arabic page with rtl is not flagged", !(await ids(`<body style="direction:rtl"><p>${AR}</p></body>`)).includes("arabic-dir"));
t("outline:none buttons are flagged", (await ids(`<style>button{outline:none}</style><button>أ</button><button>ب</button>`)).includes("focus-invisible"));
t("default focus ring passes", !(await ids(`<button>أ</button><button>ب</button>`)).includes("focus-invisible"));
t("clickable div is flagged", (await ids(`<div onclick="1" style="cursor:pointer">x</div>`)).includes("custom-control"));
t("clickable div with role+tabindex+keydown passes", !(await ids(`<div onclick="1" role="button" tabindex="0" onkeydown="1" style="cursor:pointer">x</div>`)).includes("custom-control"));
t("click inside a real button is ignored", !(await ids(`<button><span onclick="1" style="cursor:pointer">x</span></button>`)).includes("custom-control"));
const main = async (html: string) => { await load(html); return (await structureOps(page, [{ id: "landmark-one-main", impact: null, selector: "html", html: "" }])).some((o) => o.attr === "role"); };
t("wrapper div becomes main", await main(`<div id="a"><p>${AR} ${AR}</p><p>x</p></div>`));
t("content inside a layout wrapper with nav becomes main", await main(`<div id="a"><nav>قائمة</nav><div id="c"><p>${AR} ${AR}</p></div><footer>ذيل</footer></div>`));
t("split content next to nav is left to a human", !(await main(`<div id="a"><nav>قائمة</nav><p>${AR}</p><p>${AR}</p></div>`)));
t("contrast fix passes 4.5:1", ratio([0x74, 0x74, 0x74], [255, 255, 255]) >= 4.5 && /^#[0-9a-f]{6}$/.test(fixColor("#bbbbbb", "#ffffff", 4.5) ?? ""));
t("contrast fix works on dark backgrounds", (() => { const c = fixColor("#444444", "#222222", 4.5)!; const n = parseInt(c.slice(1), 16); return ratio([n >> 16, (n >> 8) & 255, n & 255], [0x22, 0x22, 0x22]) >= 4.5; })());

t("nameless image inside a named link is decoration", countUnnamed('- link "السلة":\n  - /url: /cart\n  - img') === 0);
t("nameless image inside a nameless link counts", countUnnamed('- link:\n  - /url: /cart\n  - img') === 2);
t("emoji-only button counts", countUnnamed('- button "🔍"') === 1);

// Model output is untrusted JSON.
t("confidence clamps and rejects non-numbers", confidence(2) === 1 && confidence(-4) === 0 && confidence("high") === null && confidence(NaN) === null);
t("text rejects non-strings and normalises whitespace", text(42) === null && text("  a\n b  ") === "a b" && text("") === null);
t("asObject ignores arrays", Object.keys(asObject([1])).length === 0 && asObject({ a: 1 }).a === 1);
t("visible label must be contained in the accessible name", labelMatchesVisible("السلة", "السلة") && labelMatchesVisible("السلة", "سلة") && !labelMatchesVisible("السلة", "بحث"));
t("Arabic normalisation removes diacritics", normalizeText("السَّلَة") === "السلة" && normalizeText("  السلة ") === "السلة");
t("SAM boxes parse floats and reject degenerate boxes", (() => {
  const b = parseBoxes("<|box;x1=1.5;y1=2;x2=30;y2=40;w=100;h=200;c=0.9|> <|box;x1=0;y1=0;x2=0;y2=0;w=10;h=10|>");
  return b.length === 1 && b[0].x1 === 1.5 && b[0].c === 0.9;
})());
t("contrast fix accepts #rgb and rgb()", /^#[0-9a-f]{6}$/.test(fixColor("#bbb", "#fff", 4.5) ?? "") && /^#[0-9a-f]{6}$/.test(fixColor("rgb(187, 187, 187)", "rgba(255,255,255,1)", 4.5) ?? ""));
t("contrast fix rejects bad colors and targets", fixColor("#zzz", "#fff", 4.5) === null && fixColor("#bbb", "#fff", NaN) === null);

// Applying a fix must be idempotent and must never write "undefined".
await load("<html><head><title>t</title></head><body><button>×</button></body></html>");
t("applyFix refuses a non-string value", (await applyFix(page, { selector: "button", attr: "aria-label", value: undefined as unknown as string })) === null && (await page.locator("button[aria-label]").count()) === 0);
t("applyFix rejects an empty title", (await applyFix(page, { selector: "head", attr: "title", op: "title", value: "   " })) === null);
const css = { selector: "head", attr: "css", op: "css" as const, value: "button:focus-visible{outline:3px solid #000}" };
t("applyFix inserts a stylesheet once", !!(await applyFix(page, css)) && (await applyFix(page, css)) === "(already present)" && (await page.locator("style[data-mada-css]").count()) === 1);
const skip = { selector: "body", attr: "html", op: "html" as const, value: '<a class="mada-skip" data-mada-added href="#m">تخطي</a>' };
t("applyFix inserts markup once", !!(await applyFix(page, skip)) && (await applyFix(page, skip)) === "(already present)" && (await page.locator("[data-mada-added]").count()) === 1);

// A generated main landmark must not collide with an existing id, and an existing main/skip link is respected.
const noMain = async (html: string) => { await load(html); return structureOps(page, [{ id: "landmark-one-main", impact: null, selector: "html", html: "" }]); };
t("main landmark id avoids collisions", (await noMain(`<body><div id="main-content"></div><div><p>${AR} ${AR}</p></div></body>`)).find((o) => o.attr === "role")?.extra?.[0]?.[1] === "main-content-2");
t("existing main landmark is left alone", (await noMain(`<main><p>${AR} ${AR}</p></main>`)).length === 0);
t("existing skip link prevents a duplicate", !(await noMain(`<body><a href="#c">تخطي إلى المحتوى الرئيسي</a><div><p>${AR} ${AR}</p></div></body>`)).some((o) => o.op === "html"));

const badFix: Fix = { issueId: "button-name", selector: "button", attr: "aria-label", value: "a|b\nc`d", confidence: NaN, status: "applied" };
const body = prBody({
  url: "https://example.com", targetedBefore: 1, targetedAfter: 0, unnamedBefore: 1, unnamedAfter: 0, layoutShift: 0,
  fixes: [badFix], needsHuman: [], patch: { diffFile: "fixes.diff", files: [], unmapped: [{ id: "f9", fix: "x|y", reason: "r\nz" }] },
});
t("PR body escapes table cells and never prints NaN", body.includes("a\\|b c'd") && body.includes("| 0% |") && body.includes("x\\|y") && body.includes("f9"));
await browser.close();
for (const [n, ok] of results) console.log(ok ? "PASS" : "FAIL", n);
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
