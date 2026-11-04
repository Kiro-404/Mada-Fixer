# Contributing

Thanks for taking a look at Mada Fixer. This is a hackathon project, but the code is meant to be readable and testable.

## Setup

```bash
npm ci
npx playwright install chromium
cp .env.example .env
```

You can work offline: `npm run units` and `npm run smoke` use a local mock model server and need no API key.

## Before you open a pull request

```bash
npm run typecheck
npm run units
npm run smoke
```

CI runs the same three commands.

## Conventions

- TypeScript ESM with NodeNext resolution — import local files with a `.js` extension.
- No secrets in code, tests, fixtures, or commit messages. Keys belong in `.env`, which is gitignored.
- Keep fixes grounded in evidence: every automated change should be re-checked by the verify stage, and anything uncertain belongs in the human-review list rather than being applied.
- Do not weaken the guardrails: never auto-apply `dir="rtl"`, never change prices or product names, never silently drop an issue.
- Only run the tool against sites you are allowed to test.

## Reporting bugs

Open an issue with the page type (static HTML, SPA, RTL/LTR), the command you ran, and the relevant part of `out/report.json`. Do not attach `.env` or real credentials.
