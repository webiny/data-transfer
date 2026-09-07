---
"@webiny/data-transfer": patch
---

Fix `addLiveField` in the OS lane and add `fix-live` reconciler command. `OsProcessor.querySourceRecord` now returns decompressed rows, so the published revision's `version` is readable — entries with a draft on top of a published revision correctly get `live: { version }` instead of `live: {}`. Add the `fix-live` command to reconcile already-migrated systems: scans DynamoDB and OpenSearch companion tables, reports changes in JSONL, writes only via conditional `UpdateItem`. Add a command menu (`yarn transfer` with no args), `@clack/prompts`-backed `Prompts`/`UI` abstraction, and `Command` registry. Remove `@inquirer/prompts` — all prompts now go through the abstraction. Update dependencies.
