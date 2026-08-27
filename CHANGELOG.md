# Changelog

All notable changes to the Pritset Node SDK are documented here.

## 0.1.5 - 2026-08-26

- Align the official SDK release version at 0.1.5.
- Add a guarded, opt-in lifecycle test for a dedicated production test user.
- Add a guarded local PowerShell launcher that reads ignored `.env` settings and clears production credentials after the run.
- Give the production lifecycle dedicated HTTP resources and close them after its awaited cleanup.

## 0.1.0 - 2026-08-21

- Add template management and validation clients.
- Add direct and webhook document generation.
- Add stream-first binary responses and typed API errors.
- Pin Pritset SDK contract 1.0.0.
