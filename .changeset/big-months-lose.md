---
"@webiny/data-transfer": patch
---

Fix `writeEnv` to support plain `KEY=value` format in `.env.example` — older scaffolded projects no longer crash during the wizard. Both `{{TOKEN}}` placeholders and plain env lines are handled; falls back to the built-in template when no `.env.example` exists.
