# Mada-Fixer
An AI tool that examines the website you’ve designed, makes visual repairs, and generates a detailed report on design flaws—as well as visual or functional issues—that you might not even be aware of.
# Mada Fixer (مدى)
Agent that finds accessibility issues on Arabic sites, fixes them with Meta models, and proves the improvement with numbers.

**Built during the Meta Global AI Developer Hackathon (Indie track). All code in this repo was written during the event; there is no pre-existing code.**

## Models (all via Meta Model API)
- **SAM 3.1**: sees the rendered page like a user; finds icons/buttons/images that have no accessible name in the DOM (things axe-core cannot flag).
- **Muse Spark 1.3**: Arabic alt text / aria-labels with confidence, plus a second critic pass that checks each proposal against the element's pixels.
- **Muse Wonder**: maps verified fixes back to real source files (exact-string edits, one repair round) and the tool emits a unified diff.

## What it fixes (whole site, not just text)
| Layer | Problem | Fix |
|---|---|---|
| Names | images, buttons, links, icon-only/emoji buttons, iframes, ARIA widgets without a name | Spark writes Arabic text, critic pass checks it against the pixels |
| Vision | icons/images with no name that axe cannot see | SAM 3.1 finds them on up to 3 screens, then named like above |
| Keyboard | clickable `div`/`span` (real click listeners found over CDP) | `role`, `tabindex=0`, Enter/Space handler |
| Focus | focus ring removed with `outline:none` (found by pressing Tab) | one `:focus-visible` rule |
| Page | missing `<title>`, `lang`, zoom blocked by `user-scalable=no` | AI title, `lang="ar"`, viewport rewritten |
| Navigation | no `main` landmark, no skip link | `role="main"` on the content block + skip link |
| Color | low contrast (incl. Arabic text that axe skips) | color moved toward black/white by the smallest step that passes |
| Direction | Arabic page without `dir="rtl"` | suggested, always sent to human review (it flips layout) |
Anything else axe reports (captions, heading order, tables...) is listed under "needs human work" in the report and in the PR description.

## Beautify mode (visible redesign + Arabic copy)
Opt-in with `--beautify`, the UI checkbox, or `BEAUTIFY=1`. After the accessibility fixes it applies one accessible theme (colors, spacing, type scale, card/hero/button styling) and rewrites visible headings, prices and CTAs with Spark. Copy is rejected unless it keeps every number, adds no claims, and passes the confidence threshold; the report labels the resulting pixel/layout changes as intentional (`beautifyApplied`, `textChanged`).

```
npm run fix -- file://$PWD/demo/index.html --beautify
npm run serve                 # then http://localhost:3000
npm run demo:video            # records the web UI -> out/video/mada-fixer-demo.mp4
```

## Loop
1. **See**: Playwright DOM + screenshots, SAM 3.1 discovery, CDP event listeners, Tab-key focus probe.
2. **Understand**: Spark proposes, critic refines; final confidence = min(generator, critic). Below `MIN_CONFIDENCE` goes to human review instead of being applied.
3. **Fix**: applied to the live page with a before/after diff. With `--repo`, Wonder writes the same fixes into a copy of the source and produces `out/fixes.diff`.
4. **Verify** (on the real patched source in repo mode): axe-core + our own scans, screen-reader transcript, layout-shift check (no element may move) and pixel diff.

## Run
```
npm i && npx playwright install chromium
cp .env.example .env   # paste MODEL_API_KEY into .env (loaded automatically)
npm run check          # live check of Spark, Wonder, SAM
npm run units          # detector tests (real browser, no API)
npm run smoke          # offline end-to-end test
npm run fix -- file://$PWD/demo/index.html
npm run fix -- file:///path/to/site/index.html --repo /path/to/site   # also writes out/fixes.diff
npm run eval           # all sites in eval/sites.csv -> eval/results.csv
```
`npm run smoke` runs the whole loop offline (real browser + axe-core, mocked model API in `test/mock-meta.ts`) and checks that targeted issues drop to 0 with no visual change.

Apply the patch to your own repo with `git apply out/fixes.diff` on a branch.

## Finding: axe-core misses contrast on Arabic text
In axe-core 4.14.0 (Chromium, tested here) `text.isIconLigature` returns `true` for joined Arabic script, so `color-contrast` silently skips Arabic text while still checking Latin text on the same page. Mada Fixer adds its own contrast scan for elements whose own text is Arabic (`src/verify/axe.ts`) and fixes failures by moving the text color toward black or white until WCAG 1.4.3 passes. Please verify on your own browser/fonts before quoting this.

## Measuring quality
`npm run eval` then `npm run quality` writes a reproducible random sample of 50 generated texts to `eval/quality-sample.csv`. Rate each one (`human_ok` = 1 or 0), then `npm run score` prints accuracy overall and per confidence bucket, so you can show whether higher confidence really means more correct.

## Open-weights route
Set `USE_OPEN=1`, `OPEN_API_BASE`, `OPEN_API_KEY` (and `OPEN_MODEL`, default `meta-models/muse-spark-open-1026`) to run first drafts on an open-weights Muse model served by a partner. The critic and SAM keep using the Meta Model API. `npm run test:open` checks the routing offline.

## Running on real sites
Only test sites you may test, and never open PRs on sites you do not own. `npm run eval` skips sites whose `robots.txt` disallows `*` entirely, waits `EVAL_DELAY_MS` (default 2000) between real sites, gives each site `SITE_TIMEOUT_MS` (default 240000) and always closes the browser, even after an error. Slow third-party resources never block a run (a partly loaded page is still checked). Set `USER_AGENT` to identify the tool. Problems inside iframes or shadow roots are tested frame by frame and listed as `nested:<rule>` for a human, because they cannot be patched from the main page.

## Cost control
Every model response is cached in `.cache/`, `MAX_MODEL_CALLS` (default 400) stops runaway loops, and each run prints a rough cost estimate (override prices with `PRICE_IN`, `PRICE_OUT`, `PRICE_SAM`). SAM scans up to `SAM_SCREENS` (default 3) screens per page.

## Status / limits
Repo mode handles static HTML (JSX/Vue templates are sent to Wonder but only verified when they render statically). Not automated: captions/transcripts, heading structure, complex tables, and click handlers attached to a parent (event delegation).
