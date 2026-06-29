# Pipeline runtime semantics

- **Merge groups**: pipelines sharing the same scanner run together, in registration order.
- **First-match-wins**: within a merge group, the first pipeline whose filter(s) pass claims the record. Register more-specific filters before catch-alls.
- **Unmatched records**: if no pipeline accepts a record, it's dropped. The runner emits a `warn` per unmatched record and an `info`-level shard summary: `"unmatched 14 (pb.page.l=4, pb.page=4, T#root#FM#f1:L#v1=2)"`. When TYPE is absent or empty, the key is `PK:SK` instead of a type name. Each worker also writes `segment-N-unmatched.log` to `.transfer/<runId>/`. To transfer every record, add a zero-filter catch-all pipeline last.
- **Hooks**: before-hooks fire once per merge group before any shard; after-hooks fire once after all shards succeed. After-hooks are skipped on shard failure. Each hook receives `{ runId, mergeGroupId }`.
- **Parallelism**: `pipeline.segments` controls the number of parallel scanner segments (shards). Each shard runs in a separate child process.
- **Re-running specific shards**: pass `--segments=1,3` to re-drive only those indices. Workers still receive `--total` from `pipeline.segments`, so each shard scans the exact same slice as a full run. Use after a partial failure to avoid re-scanning the whole table.
