# Security

## Secrets

Mada Fixer reads credentials from `.env`, which is gitignored. Never commit a `.env` file, a real model key, or a report that contains private page content you are not allowed to publish.

If a key is exposed, revoke it at the provider first, then rotate it locally.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting (Security → Report a vulnerability) instead of a public issue. Include the affected version/commit, a minimal reproduction, and the impact.

Please do not test against sites you do not own. Mada Fixer is built to inspect pages the operator is authorized to test; using it against third-party sites is outside the scope of this project.
