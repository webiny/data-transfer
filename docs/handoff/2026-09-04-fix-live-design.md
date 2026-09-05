# Session Handoff — 2026-09-04 — Fix Live Field Design & Plans

## What was done

- **Diagnosed the `live` bug.** Some migrated CMS entries were not marked live. Root cause confirmed in code: `addLiveField` reads `published.version` from the root of the record returned by `ctx.querySourceRecord(PK, "P")`. In the OS preset that source row is the v5 Elasticsearch companion table, where `version` sits inside the gzipped `data` blob, so the read yields `undefined` and the target document ends up with `live: {}`. Hits `L` docs of entries whose latest revision is a draft on top of an older published revision. DDB preset unaffected.
- **Verified v6 `live` semantics** in `webiny-js-next`: v6 maintains `live: { version }` on `L`, `P`, and the published `REV#` only. Other `REV#` records carry best-effort copies that v6 itself leaves stale. The reconciler enforces exactly that invariant and never writes other `REV#` records.
- **Designed and approved** `docs/superpowers/specs/2026-09-04-fix-live-field-and-command-menu-design.md`: transformer fix, a `fix-live` reconciler command (DDB + OS tables, dry run gate, JSONL report, `UpdateItem`-only writes conditioned on `_md`), and a clack-based CLI command menu with `Prompts`/`UI` abstractions and a `Command` registry. Spec was subagent-reviewed (26 findings) and revised.
- **Wrote two implementation plans:** `docs/superpowers/plans/2026-09-04-fix-live-reconciler.md` (11 tasks) and `docs/superpowers/plans/2026-09-04-cli-command-menu.md` (10 tasks). Reconciled the seam between them: the CLI plan's contract table now names the reconciler plan's real exports (`DdbLiveFieldRunner` / `OsLiveFieldRunner`, `LiveFieldRunner.Target`, `FixLiveState` with `read` / `recordDryRun` / `recordLiveRun`).
- **Shared project MCP config:** `.mcp.json` (stdlib + codegraph) is now tracked; removed from `.gitignore`.
- **Dependencies updated** (`package.json`, `yarn.lock`).
- 4 commits. 722 tests in 110 files pass. Nothing from the spec is implemented yet.

## Key decisions

- **Scope of reconciliation:** `L`, `P`, published `REV#` only. Fill missing, clear stale (no `P`), correct wrong version. Any contradiction (e.g. `L` marked published with no `P`, `L` at published version but not marked published, `REV#` missing or version mismatch) is a skip with a reason, never a write.
- **Reads:** scan `L` rows per segment (server-side `SK = L` filter), then `queryAll(PK)` per entry for an authoritative group. No reliance on scan ordering. Chosen over group-by-PK streaming after review found a data-loss hole.
- **Writes:** `UpdateItem` on `data.live` (DDB) or `data` (OS, recompressed blob), conditioned on `_md` unchanged. Never a whole-record put: the document client has `convertEmptyValues: true`, so a put round-trip would corrupt empty strings. `ConditionalCheckFailedException` → `changed-during-run` skip, not retried.
- **v6 guard** on the DDB table (CMS entry `L` row has `data` object at root; v5 is flat). OS table cannot be independently verified, so the OS runner only runs after the DDB guard passed for the same system.
- **Dry run gate:** live run refused without a prior dry run for that project + system (state under `.transfer/state/fix-live/<project>__<system>.json`). Live run recomputes; count difference is a soft warning.
- **Console shows counts only.** Per-record detail goes to `.transfer/<runId>/fix-live-report.jsonl`.
- **CLI:** `yarn transfer` with no args opens a clack menu over a `Command` registry. Yargs stays for flags. `yarn transfer --config --preset` and `yarn transfer <folder>` must keep working. Exit 130 on cancel. New CLI code lives under `src/commands/` (a `src/cli/` dir would collide with the `src/cli.ts` bin entry). Prompt patterns from `~/private/prijevodi-online-2010/src/cli`, command shape from `~/private/dependency-upgrader/src/cli`.
- **Transformer fix preferred form:** `OsProcessor.querySourceRecord` returns the decompressed row so every OS-lane transformer sees the DDB shape; `addLiveField` adds a positive-integer guard and `cached !== undefined`.

## Current state

- Branch: `bruno/feat/fix-target-system-live-property`
- Tests: 722 passed (110 files)
- Typecheck: passing
- Unpushed commits: 4 (branch not on origin)

## What might come next

1. Execute `docs/superpowers/plans/2026-09-04-fix-live-reconciler.md` task by task. Task 1 (transformer fix + patch changeset) can ship on its own.
2. Then execute `docs/superpowers/plans/2026-09-04-cli-command-menu.md`. Its Task 8 Step 1 applies the contract-table substitutions before writing the command.
3. Open questions from the spec: confirm v6's DynamoDB stream handler treats a `data`-only change on the OS companion table as an index update; decide whether `fix-live` should report stale `live` on non-published `REV#` as diagnostics.
4. Follow-up after the menu lands: migrate `init` / `initProject` from inquirer to `Prompts` and drop the inquirer dependency.
5. Process note: subagent plan-writing was expensive this session (two agents, ~250k tokens each, partly because of a stop/resume cycle). Prefer writing plans in the main session from the spec, or give agents a hard read budget.
