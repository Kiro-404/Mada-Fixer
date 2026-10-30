# Meta Global AI Developer Hackathon — submission checklist

Event window: **Oct 27 – Nov 4, 2026**. Submission deadline: **Wed Nov 4, 9:00 PM ET**. Judging: Nov 5–8; closing ceremony Nov 9. Confirm current times on the [event page](https://cerebralvalley.ai/e/meta-ai-developer-hackathon).

This file maps every hackathon rule to what is in the repository and what still has to be done by a human. It is written for the Indie Developer track; adjust the track field if the team enters as a startup.

## Rule-by-rule

| Rule | Status | Evidence / action |
|---|---|---|
| **One public repository** | ⚠️ ACTION | Push this repo to a **public** GitHub repository. Do not initialize it as private and flip it later without checking the submission link. |
| **Open source** | ✅ | [MIT LICENSE](../LICENSE); dependencies are MIT/Apache-2.0 (Playwright, axe-core, diff, pngjs, pixelmatch). |
| **New work only, built Oct 27 – Nov 4** | ✅ | The repository is created during the building period; the first commit and `git log --date=iso` are the record. Do not import code from another project. |
| **Clearly identify what was built during the Hackathon** | ✅ | README + demo video show the pipeline end to end; there is no pre-existing product around it. State this in the submission description. |
| **Must use Meta models** | ✅ | Muse Spark 1.3 (understand + critic), Muse Wonder 1.0 (source patch), SAM 3.1 (visual discovery) through the Meta Model API. `npm run check` verifies all three. `report.json` prints calls/cost per run. |
| **Demo video, 3 minutes max** | ⚠️ ACTION | Record with [DEMO_SCRIPT.md](DEMO_SCRIPT.md), upload (e.g. unlisted YouTube), check the link in an incognito window. Show only features built here. |
| **One submission per team, one representative** | ⚠️ ACTION | The representative submits on the CV platform and lists every teammate (max 4). |
| **Team size ≤ 4** | ⚠️ CHECK | Solo is allowed. If the team grows, keep it at 4 or fewer. |
| **Legal / ethical / platform policies** | ✅ | Accessibility tooling; read-only page loads; no credentials, no personal data, no scraping at scale; `robots.txt` respected by the evaluation harness; PRs only on repos you own. |
| **Rights to code/data/assets** | ✅ | All source and the two demo fixtures are original; third-party libraries are declared in `package.json` with their licenses. No copied site content is committed. |
| **No banned project categories** | ✅ | Not medical advice, not a basic RAG app, not a generic image analyzer/education chatbot, not a job screener, not a nutrition/personality/sports coach, no political or war content. See "Why this project is allowed" below. |
| **Claim the $150 Meta credits by Nov 4, 9 PM ET** | ⚠️ ACTION | Each participant claims individually through the form in the participant guide; a payment method is required; check the Billing page. |
| **Repositories accessible to judges** | ⚠️ ACTION | Public repo, working `README`, no `.env`, no `out/`, no `.cache/` committed. |

Legend: ✅ in the repo · ⚠️ needs the participant.

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
