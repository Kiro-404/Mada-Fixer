# Meta Global AI Developer Hackathon — submission checklist

Event window: **Oct 27 – Nov 4, 2026**. Submission deadline: **Wed Nov 4, 9:00 PM ET**. Judging: Nov 5–8; closing ceremony Nov 9. Confirm current times on the [event page](https://cerebralvalley.ai/e/meta-ai-developer-hackathon).

This file maps every hackathon rule to what is in the repository and what still has to be done by a human. It is written for the Indie Developer track; adjust the track field if the team enters as a startup.

## Rule-by-rule

| Rule | Status | Evidence / action |
|---|---|---|
| **One public repository** | ⚠️ ACTION | Push this repo to a **public** GitHub repository. Do not initialize it as private and flip it later without checking the submission link. |
| **Open source** | ✅ | [MIT LICENSE](../LICENSE); dependencies are MIT/Apache-2.0 (Playwright, axe-core, diff, pngjs, pixelmatch). |
| **New work only, built Oct 27 – Nov 4** | ✅ | Created 2026-10-30; first commit `58548a0` at 2026-10-30 21:42 UTC. `git log --date=iso` is the record. Do not import code from another project. |
| **Clearly identify what was built during the Hackathon** | ✅ | README + demo video show the pipeline end to end; there is no pre-existing product around it. State this in the submission description. |
| **Must use Meta models** | ⚠️ ACTION | The code routes every call to Muse Spark 1.3 (understand + critic), Muse Wonder 1.0 (source patch) and SAM 3.1 (visual discovery) through the Meta Model API, but `MODEL_API_KEY` is currently empty. All live runs and the recorded video fell back to Groq and show `[groq]` in the log, so they cannot be submitted as Meta-model evidence. Put a working key in `.env`, run `npm run check`, then re-record. |
| **Demo video, 3 minutes max** | ⚠️ ACTION | Record with [DEMO_SCRIPT.md](DEMO_SCRIPT.md), upload (e.g. unlisted YouTube), check the link in an incognito window. Show only features built here. |
| **One submission per team, one representative** | ⚠️ ACTION | The representative submits on the CV platform and lists every teammate (max 4). |
| **Team size ≤ 4** | ⚠️ CHECK | Solo is allowed. If the team grows, keep it at 4 or fewer. |
| **Legal / ethical / platform policies** | ✅ | Accessibility tooling; read-only page loads; no credentials, no personal data, no scraping at scale; `robots.txt` respected by the evaluation harness; PRs only on repos you own. |
| **Rights to code/data/assets** | ✅ | All source and the two demo fixtures are original; third-party libraries are declared in `package.json` with their licenses. No copied site content is committed. |
| **No banned project categories** | ✅ | Not medical advice, not a basic RAG app, not a generic image analyzer/education chatbot, not a job screener, not a nutrition/personality/sports coach, no political or war content. See "Why this project is allowed" below. |
| **Claim the $150 Meta credits by Nov 4, 9 PM ET** | ⚠️ ACTION | Each participant claims individually through the form in the participant guide; a payment method is required; check the Billing page. |
| **Repositories accessible to judges** | ⚠️ ACTION | Public repo, working `README`, no `.env`, no `out/`, no `.cache/` committed. |

Legend: ✅ in the repo · ⚠️ needs the participant.

## Local verification (2026-10-30)

Run on the machine that built the submission, before the first commit:

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run units` | 31/31 pass |
| `npm run smoke` (real Chromium + axe-core, mock model) | 15/15 pass; targeted 14 → 0, nameless 6 → 0, 0 moved; repo patch applies with `git apply` |
| `npm run robust` | 6/6 pass (strict CSP, hanging page, invalid model JSON) |
| Read-only audit of real sites (`eval/run-eval.ts --audit`) | 3 of 4 completed; one navigation timeout recorded, Wikipedia screenshot fallback recorded, no site changed |
| Secret scan + `git status --ignored` | no key or `.env` in history; only `node_modules/`, `.cache/`, `out/`, `eval/results.csv` ignored |

The smoke numbers use the mock model and must not be quoted as live model quality.

## Why this project is allowed

Mada Fixer is **accessibility engineering**, not one of the banned sample categories:

- It does not give medical, nutritional, mental-health, legal or financial advice.
- It is not a chatbot, a RAG app, an image analyzer, a job screener or a personality/sports analyzer.
- It contains no political or war content; the evaluation sites are reference, books, culture, education, lifestyle and finance pages, and the harness skips any page disallowed by `robots.txt`.
- It changes pages only in a **copy** of a repository the user owns; it never edits a third-party site.

## What the demo must show (and not show)

Show, in this order:

1. the broken Arabic page and what a screen reader says (`link`, `img`, `button` with no names);
2. the agent finding issues, including an icon axe does not flag (SAM 3.1);
3. Spark's Arabic name/alt proposals and the critic + confidence column;
4. a low-confidence fix going to **human review** (no silent AI changes);
5. the source patch (`fixes.diff`) and, optionally, a PR opened on **your** repo;
6. the measured proof on the patched source: targeted issues, nameless elements, 0 layout shift, pixel diff, `reader-after.txt`;
7. `git log --date=iso` showing commits inside the hackathon window.

Do not show a third-party site being modified, a PR against someone else's repo, or numbers from a run you did not do. If you use the offline mock for a segment, say it is the mock.

## Copy-paste submission answers

Replace every `<...>` before submitting. These answers describe the code as it exists in this repo; do not claim a live Meta run until `npm run check` passes with your key.

**Project name:** Mada Fixer (مدى)

**Track:** Indie Developer

**One-liner (≤ 200 chars):**
> An AI agent that audits and fixes Arabic web accessibility end to end, redesigns the page on request, and proves every change with numbers.

**Short description:**
> Most Arabic websites are unreadable to screen-reader users, and existing tools stop at a report. Mada Fixer is an agent that sees the rendered page, understands the accessibility problem, fixes it, and verifies the result. It combines axe-core with keyboard and Arabic-contrast scans, while SAM 3.1 finds unlabeled icons that axe cannot flag. Muse Spark writes Arabic accessible names and alt text, with a second critic pass that checks each proposal against the element's pixels. Low-confidence edits go to a human-review list instead of being applied silently. An opt-in Beautify mode then applies one accessible theme and rewrites Arabic headings, prices and CTAs while preserving every number and claim. In repo mode, Muse Wonder maps the verified fixes back to the real source files and emits a unified diff (and optionally a PR on your own repository). On the demo store page the agent takes 24 targeted WCAG issues and 8 unnamed controls to zero with 36 fixes, then shows a measured 43.74% intentional visual change.

**What we built during the hackathon:**
> The entire project: the audit/fix/verify loop, the Arabic contrast detector, the Beautify engine with number-preserving copy validation, the source patcher, the evaluation harness, the web UI and the demo fixtures. First commit `58548a0` is dated 2026-10-30, inside the event window.

**Meta models used:**
> SAM 3.1 for visual discovery on rendered screenshots; Muse Spark 1.3 for Arabic naming, alt text, page title and the critic pass; Muse Wonder 1.0 for source-code edits. An optional open-weights Muse route (`OPEN_MODEL`, default `meta-models/muse-spark-open-1026`) is supported for first drafts.

**Proof / results:**
> Demo store page: targeted WCAG issues 24 → 0, unnamed screen-reader elements 8 → 0, 36 fixes applied, 10 intentional style/copy changes (an accessible theme plus 9 Arabic copy rewrites), 43.74% intentional pixel change. The report labels intentional layout movement separately from regressions. Low-confidence proposals (for example flipping a page to RTL) are listed for human review, not applied.

**Repo:** `<public GitHub URL>`

**Video (≤ 3 min):** `<public or unlisted video URL>`

**Team:** `<names, max 4>`

**Built during the event:** Yes — Oct 27 – Nov 4, 2026; no pre-existing code.

## Final verification (2026-11-04)

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run smoke` (real Chromium + axe-core, mock model) | 9/9 pass; page mode 24 → 0 targeted, 8 → 0 unnamed, 0 layout shift; repo mode 24 → 2 |
| Demo recording | `out/video/mada-fixer-demo.mp4`, 48.6 s, H.264, 1280×720 |
| Produced explainer (EN) | `out/video/mada-fixer-explainer-en.mp4`, 180.2 s (3:00), H.264/AAC 1280×720, English narration + slides + captions, ~68 s of live product footage |
| Produced explainer (AR) | `out/video/mada-fixer-explainer.mp4`, 180.0 s (3:00), Arabic narration version |
| Live demo run | 24 → 0 targeted, 8 → 0 unnamed, 36 applied fixes, 9 copy rewrites, 43.74% pixel diff |
| Live model route | ⚠️ Groq fallback; Meta key not configured |

The smoke numbers use the mock model and must not be quoted as live model quality. The live demo numbers above also came from the fallback route; the produced explainer uses that same footage. Re-run and re-record after the Meta key is working, then update this table.

## Manual steps before submitting

1. **Secrets**: run a scan before the first push.
   ```bash
   git grep -nE "(MODEL_API_KEY|META_API_KEY|sk-|Bearer )[A-Za-z0-9_-]{16,}" || true
   git status --porcelain
   ```
   `.env`, `.cache/`, `out/` and `eval/results.csv` must not be tracked.
2. **Fresh clone test** (proves the public repo is self-contained):
   ```bash
   git clone <public-url> /tmp/mada-check && cd /tmp/mada-check
   npm ci && npx playwright install chromium
   npm run typecheck && npm run units && npm run smoke && npm run robust
   npm run fix -- --help
   ```
3. **Live model check** with your own key: `npm run check` (Spark, Wonder, SAM).
4. **Real numbers** for the video: run `npm run fix -- <page>` and/or `npm run eval` with your key. Use only those numbers. Keep the generated `eval/results.csv` and `out/*/report.html` locally; attach the CSV if the submission form allows it.
5. **Video**: record ≤ 3 minutes, upload, check the link without being logged in.
6. **Submission form**: public repo URL, video URL, team members, track, short description, and a sentence that the project was built during the hackathon.
7. **Credits**: claim the $150 Meta Model API credits individually (the guide requires a payment method for the pre-authorization), and optionally the Baseten/Modal/Fireworks credits; follow each partner's form.
8. **Community vote** (optional): share the submission link in the hackathon Discord after it is accepted.

## Reproducibility block for the submission description

Fill this in from your final run (do not guess):

```
Commit:            <git rev-parse HEAD>
Date:              <YYYY-MM-DD>
OS / Chromium:     <Windows 11 / Playwright 1.64.1 (Chromium 1248)>
Models:            muse-spark-1.3, muse-wonder-1.0, sam-3.1
Command:           npm run fix -- <url> [--repo <dir>]
Targeted issues:   <X> -> <Y>
Nameless elements: <X> -> <Y>
Layout shift:      <N>
Model calls/cost:  <N> calls, ~$<cost>
```

## Links

- Participant guide / event: <https://cerebralvalley.ai/e/meta-ai-developer-hackathon>
- Submission: <https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit>
- Meta Model API docs: <https://dev.meta.ai/docs/overview>
- Model list: <https://dev.meta.ai/docs/models>
- Meta Model API cookbook: <https://github.com/meta-models/meta-model-cookbook>
- Hackathon Discord: <https://cerebralvalley.ai/e/meta-ai-developer-hackathon/discord>
