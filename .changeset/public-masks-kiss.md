---
"@webiny/data-transfer": patch
---

Fix `.env` population for older scaffolded projects: `writeEnv` now supports plain `KEY=value` `.env.example` files by uncommenting commented-out known keys and appending missing ones. Config template auto-enables OpenSearch when the env vars are set — no manual uncommenting needed.
