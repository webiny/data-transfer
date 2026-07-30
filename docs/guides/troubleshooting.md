# Troubleshooting

## Common issues

### Out of memory on large tables

Each worker buffers write commands between flushes. Reduce `tuning.flushEvery` (default 500) to a smaller value so each flush covers fewer records and peak memory stays manageable.

```typescript
// In .env:
FLUSH_EVERY=100

// Or in config.ts:
tuning: { flushEvery: 100 }
```

### AWS throttling

The SDK uses `retryMode: "adaptive"` which self-tunes. If you still hit limits:

```typescript
tuning: {
    ddb: { maxRetries: 5, initialBackoffMs: 200 },
    s3: { maxRetries: 5, concurrency: 5 }  // lower concurrency for S3-heavy transfers
}
```

### S3 `AccessDenied` on file copies

`CopyObjectCommand` runs with **target credentials**. In cross-account scenarios, the target account must have `s3:GetObject` on the source bucket. Add a bucket policy on the source bucket granting read to the target account. See [Required IAM permissions](config-reference.md#required-iam-permissions).

The pre-flight access check catches this before the transfer starts.

### DynamoDB `AccessDeniedException`

Source credentials need: `Scan`, `Query`, `DescribeTable` on the source table.
Target credentials need: `BatchWriteItem`, `Query`, `DescribeTable` on the target table.

The pre-flight check reports which side failed. For the audit log table, `BatchWriteItem` + `DescribeTable` on the target audit log table is required (or set `target.auditLog` to `null` to skip it).

### OpenSearch indexes not creating

The transfer aborts if index prep exhausts retries. Tune retry settings or fix the underlying mapping error from the logs:

```typescript
tuning: {
    os: { maxRetries: 5, retryScheduleMs: [5000, 10000, 20000, 40000] }
}
```

### Missing env vars

Run the guided wizard — it writes `.env` automatically:

```bash
yarn transfer
```

Or copy `.env.example` manually and fill it in. Config files use `loadEnv(import.meta.url)` to load the `.env` sitting next to them.

### Target records look wrong

`DdbProcessor` and `OsProcessor` auto-put `ctx.record` at chain end. If you also call `ctx.putRecord(ctx.record)` manually, you get a duplicate write. Only call `putRecord` for **additional** records beyond the one being processed.

### Unmatched records

Records that match no pipeline are dropped. Check:
- `segment-N-unmatched.log` in `.transfer/<runId>/`
- Per-record warn lines: `unmatched record — TYPE=... PK=... SK=...`

To transfer everything, add a catch-all pipeline with no filters (registered last).

## Debugging

### Enable snapshot mode

Dumps every record to local JSONL files — see exactly what each transformer did:

```typescript
debug: {
    snapshot: true,
    logFile: true,
    logLevel: "debug"
}
```

Inspect with:

```bash
zcat .transfer/<runId>/snapshot/<pipeline>/segment-0.source.jsonl.gz | jq .
```

### Enable dry run

Run the full pipeline without writing to the target:

```bash
yarn transfer --config=./projects/my-env/config.ts --preset=copy-ddb --dry-run
```

Reads still happen — transformers run, commands are generated — but nothing is written.

### Re-run failed shards

After a partial failure, re-run only the failed segments:

```bash
yarn transfer --config=./projects/my-env/config.ts --preset=copy-ddb --segments=1,3
```

### Read the logs

```bash
cat .transfer/<runId>/logs/*.log | pino-pretty
```

Each worker writes its own log file — no interleaving under parallelism.
