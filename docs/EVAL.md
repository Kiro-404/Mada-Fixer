# Evaluation methodology

The evaluation answers three questions on real Arabic pages:

1. **Does the agent find and fix the targeted WCAG failures?** — targeted issue count before → after, plus applied / review / failed fixes.
2. **Does a screen reader hear a better page?** — count of images/controls announced without a meaningful name, from Playwright's accessibility tree (`ariaSnapshot`) before → after.
3. **Did the fix change the page?** — elements that moved, and share of pixels changed. Contrast fixes are expected to change pixels; nothing should move.

## What is in `eval/sites.csv`

| Page | Category | Why it is there |
|---|---|---|
| `demo` (`demo/index.html`) | demo | deliberately broken fixture: names, contrast, zoom, main landmark, keyboard, icon buttons |
| `news` (`demo/news.html`) | demo | second fixture with RTL news layout, empty alt, unlabeled search, clickable div |
| `ar.wikipedia.org` (Arabic language article) | reference | large encyclopedia page |
| `hindawi.org` | books | Arabic literature/culture publisher |
| `alukah.net` | culture | Arabic content site |
| `mawdoo3.com` | content | large Arabic knowledge site |
| `nagwa.com/ar` | education | Arabic e-learning platform |
| `almrsal.com` | lifestyle | Arabic lifestyle magazine |
| `argaam.com/ar` | finance | Arabic financial news |

No political, war, medical-advice or personal-data pages are included, matching the hackathon's banned-project list.

Real sites change, localize by geography and sometimes block automation. A site that is skipped is written to `eval/results.csv` with the reason — do not delete that row; report it.

## Procedure

```bash
npm run check                                   # verify the three Meta models first
npm run eval -- --audit --limit 2               # smoke the harness on the two local fixtures
npm run eval                                    # full run (uses API credits)
```

- One page load per site (the URL in `sites.csv`), no crawling, no forms, no logins, no PRs against sites you do not own.
- The harness fetches `robots.txt` first and skips a path that is disallowed for `*` or `MadaFixer` (`--ignore-robots` overrides; do not use it for the submission numbers).
- Requests are spaced by `EVAL_DELAY_MS` (default 2 s). Increase it if a site rate-limits.
- `--limit N` and `--only <site|category>` restrict the run; `--audit` measures without models and without changes.
- Model budgets: `MAX_MODEL_CALLS`, `MAX_INPUT_TOKENS`, `MODEL_TIMEOUT_MS`; every run prints calls, cached calls, SAM images and an estimated cost.

## Output

`eval/results.csv` — one row per site:

| Column | Meaning |
|---|---|
| `wcagBefore/After` | all axe-core + custom-scan issues |
| `targetedBefore/After` | the subset the agent can fix (names, contrast, title, lang, viewport, main landmark, focus, keyboard, direction) |
| `applied/review/failed` | fixes applied on the page / sent to human review / could not be applied |
| `samFound` | issues discovered by SAM 3.1 that axe did not report |
| `unnamedBefore/After` | screen-reader nameless elements |
| `visualDiff` | share of changed pixels (0–1) |
| `layoutShift` | elements whose position/size changed by more than 1 px |
| `calls`, `costUsd` | model calls and estimated cost for this site |
| `warnings` | runtime warnings (navigation, source-patch mapping, etc.) |
| `error` | failure or skip reason |

Per-site artifacts: `out/eval/<n>/report.html` (screenshots, screen-reader transcript, every fix with confidence, source-patch summary), `report.json`, `fixes.diff` in repo mode.

## Snapshot: read-only audit, no models (2026-10-30)

Command: `npx tsx eval/run-eval.ts --audit --only reference,books,culture,content --limit 4`. This only *measures*; nothing was changed on these sites and no model was called. It shows the size of the problem, not the agent's improvement:

| Site | WCAG issues | Targeted subset | Nameless elements |
|---|---|---|---|
| Arabic Wikipedia article | 340 | 252 | 142 |
| hindawi.org | 23 | 11 | 0 |
| mawdoo3.com | 40 | 10 | 1 |
| alukah.net | not measured | — | navigation timeout (45 s) |

The Wikipedia page also exceeded the full-page and viewport screenshot timeouts, so that report marks the pixel comparison as unavailable. Counts vary with the page variant and fonts; rerun on the day you submit.

## Reporting honestly

When you quote results in the demo video or submission:

- state the date, commit hash, OS, Chromium version, model ids and the exact command;
- report the **sum across all attempted sites**, including skips and failures, not only the best pages;
- say that names/alt text are model-generated and reviewed by the confidence gate, not by a human linguist;
- do not turn a page that already had few issues into a percentage improvement; give raw counts;
- keep `eval/results.csv` with the run (it is git-ignored by default because it is a generated artifact and may contain site-specific data; attach it to the submission or paste the summary).

## Known confounders

- Dynamic sites may show a consent banner or A/B variant; the audit sees that variant only.
- Arabic contrast detection depends on fonts/ligatures; see [ARABIC-CONTRAST.md](ARABIC-CONTRAST.md).
- `networkidle` is capped (`IDLE_TIMEOUT_MS`); long-polling sites are measured after a bounded settle, not after they "finish".
- A page behind a login, a CAPTCHA or geo-blocking cannot be measured; it is recorded as an error.
- `dir="rtl"` suggestions are review-only and do not count as applied fixes.
- On an extremely long page a full-page screenshot can time out; the harness retries with the viewport and then a placeholder. The report marks the pixel comparison as unavailable instead of claiming 0%.
- Sites that fail or are blocked by `robots.txt` are written to `eval/results.csv` with the reason. The category summary counts only measured sites and prints a separate `not measured` line; never present a failed site as a zero-issue site.

## Cost

Each element costs roughly two Spark calls (generate + critic) and one SAM request per concept per screen; repo mode adds one Wonder call per patch round. Check `MAX_MODEL_CALLS` and the printed estimate before a full run, and prefer `--limit` while preparing the demo.
