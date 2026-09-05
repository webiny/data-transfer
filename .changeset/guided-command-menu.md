---
"@webiny/data-transfer": minor
---

Add a command menu: `yarn transfer` with no arguments now lists available commands (`transfer`, `fix-live`) via `@clack/prompts`; `yarn transfer --config --preset` and `yarn transfer <folder>` behave as before. Add the `fix-live` command that reconciles the `live` field on CMS entries of an already migrated v6 system (DynamoDB table and OpenSearch companion table), with a mandatory dry run, a JSONL change report under `.transfer/<runId>/`, and non-interactive flags (`--project --system --dry-run|--live --yes --table --concurrency`). Prompts now go through `Prompts` / `UI` abstractions; cancelling any prompt exits 130.
