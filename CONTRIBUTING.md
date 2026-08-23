# Contributing

1. Use a supported Node LTS release.
2. Run `npm ci`.
3. Run `npm run verify` before opening a pull request.
4. Add tests for every behavior change.
5. Never commit credentials, generated customer documents, or real customer data.

Public API changes must remain compatible with the pinned contract or update the contract through a separate reviewed release.
