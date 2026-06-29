# Testing

- Tests live in `__tests__/` mirroring `src/` structure.
- **Shared containers**: `__tests__/containers/{ddb,os}.ts` expose `createDdbContainer({ sourceRecords?, modelsDir?, logLevel? })` / `createOsContainer(...)`. Use these — don't hand-roll DI containers in tests.
- **Mock clients**: `__tests__/services/DynamoDbClient/MockDynamoDbClient.ts` + `OpenSearchClient/MockOpenSearchClient.ts` + `S3Client/MockS3Client.ts`.
- **Transformer unit tests** use `__tests__/transformers/fakeContext.ts` → `makeFakeBaseContext<T>(record, overrides?)`. For DDB-specific fields, cast at the test site.
- **PipelineRunner tests** under `__tests__/features/PipelineRunner/` cover register dedup, multi-pipeline merge groups, shard slicing.
- **Pipeline dataflow integration** in `__tests__/features/PipelineRunner/PipelineRunner.integration.test.ts` — Mock-client-based, exercises a zero-transformer passthrough case. Does NOT hit the AWS SDK.
- **Real-SDK integration tests** live under `__tests__/integration/` and run against a local **dynalite** HTTP server. Harness: `__tests__/integration/dynalite.ts` → `startDynalite()` returns `{ endpoint, port, stop() }`. Container: `createDdbIntegrationContainer({ endpoint, sourceTable, targetTable, segments?, useRealS3Client? })` wires the real `DynamoDbClientFeature`; `useRealS3Client: true` adds the real `S3ClientFeature` so tests can intercept via `aws-sdk-client-mock` (GetObject / CopyObject). See:
  - `dynalite.smoke.test.ts` — harness sanity-check.
  - `pipeline.dataTransfer.test.ts` — 4-record end-to-end (no preset).
  - `pipeline.bulkAndRetry.test.ts` — 10k faker records + SDK-middleware throttle injection against `BatchWriteCommand`.
  - `pipeline.realData.test.ts` — byte-exact roundtrip of 314 real v5 records (no preset).
  - `pipeline.preset.test.ts` — **golden-file correctness** of the full `v5-to-v6-ddb` preset over the same 314 records. Target deep-equaled against `__tests__/data/small-one.expected.json`. Regenerate via `UPDATE_EXPECTED=1 yarn test ...` after intentional preset/transformer changes and code-review the diff before committing. Frozen clock (`vi.useFakeTimers({toFake:["Date"]}) + vi.setSystemTime`) keeps `createMetadata`'s timestamps stable.

  Patterns + gotchas (ambient.d.ts naming, region-separation for source/target so `getDocumentClient`'s config-hash cache doesn't collide, `getInternalDocClient` private-field reach, S3 mocking via `aws-sdk-client-mock`, golden-file workflow) documented in memory `project_integration_tests.md`.

- `vitest.config.ts` excludes: **empty** (aside from `**/node_modules/**`). All excluded-legacy-tests from the old refactor were ported during Plan B.

## Verification before commit

```bash
yarn npm audit       # expect no audit suggestions (see .yarnrc.yml for ignored advisories)
yarn format:fix      # oxfmt — must be clean before ts-check
yarn ts-check        # expect 0 errors
yarn test:coverage   # expect all green (use :coverage to keep thresholds enforced)
yarn lint            # expect 0 errors
yarn check:imports   # expect 0 errors
git status           # include ALL modified files
```

All six checks are required. Missing any one of them has broken CI in the past.
