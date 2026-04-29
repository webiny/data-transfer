# Scanner Instance in Pipeline — Design Spec

**Date:** 2026-04-29
**Author:** Bruno Zorić (design), Claude (drafting)

---

## Problem

`Pipeline.scannerToken` stores an `Abstraction<Scanner.Interface<TRecord, TShard>>` — a DI token, not an instance. The runner resolves the scanner from the container at run time via `container.resolve(scannerToken)` in two call sites (`runMergeGroup` and `runSingleShard`). The merge group map is keyed by this token.

This is architecturally inconsistent with how processors were fixed on 2026-04-29: pipelines now carry **resolved processor instances**, and the runner has zero container lookups for the core record-processing loop. Scanners are the remaining exception.

A latent version of the same token-collision bug that bit processors also exists here: `DdbScanner` and `OsScanner` both use `Scanner.createImplementation({...})` and share `Symbol("Core/Scanner")`. `container.resolve(Scanner)` returns the last-registered scanner. No active bug today (DDB and OS always run in separate processes), but the risk is present and the asymmetry with processors is a design smell.

---

## Goal

Make the pipeline carry the scanner instance alongside processor instances. After this change:

- `Pipeline.scanner` holds a `Scanner.Interface<TRecord, TShard>` instance.
- The runner reads `pipeline.scanner` directly — no `container.resolve` calls for scanners.
- The merge group map is keyed by the scanner instance (object identity), not a token.
- `PipelineBuilderFactory` resolves the scanner instance at build time, matching the processor pattern exactly.

---

## Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Factory injects all scanners via `[Scanner, { multiple: true }]` dependency, alongside the existing `[Processor, { multiple: true }]`. Finds the right instance by `s.constructor === implClass`. | Mirrors the processor fix exactly. No container in the factory; consistent injection model. |
| 2 | `Pipeline.scannerToken` renamed to `Pipeline.scanner`, typed as `Scanner.Interface<TRecord, TShard>`. | Token terminology is wrong once it's an instance. Removes the word "token" from the public surface entirely. |
| 3 | Merge group map key changes from `Abstraction<Scanner.Interface>` to `Scanner.Interface<unknown, unknown>` (object identity). | JS `Map` uses `===` for object keys. Two separate scanner singletons — one `DdbScannerImpl`, one `OsScannerImpl` — are distinct objects and hash correctly. No per-scanner unique abstraction needed. |
| 4 | `deriveMergeGroupId` uses `scanner.constructor.name` with `"Impl"` suffix stripped. | Readable log output ("DdbScanner" instead of "DdbScannerImpl"). "Impl" is a universal internal suffix with no user-visible meaning. |
| 5 | Runner drops both `container.resolve(scannerToken)` call sites and the `scannerToken` parameter on `runMergeGroup` / `runSingleShard`. Each pipeline carries its own scanner; `runSingleShard` reads from `pipelines[0].scanner` (all pipelines in a merge group share the same scanner instance). | Completes the "pipeline carries everything" invariant. Runner's core loop has no container lookups at all. |
| 6 | `container` stays injected on the runner — still needed for hook resolution (`beforeHookTokens`, `afterHookTokens`). Only scanner resolution is removed. | Hooks are still token-resolved; that's a separate concern. |

---

## End state (runner core loop — no container lookups)

```typescript
// register: key by scanner instance
const groupKey = pipeline.scanner;
const group = this.mergeGroups.get(groupKey);
// ...

// runMergeGroup: read scanner from group, not container
const scanner = pipelines[0].scanner; // all share same scanner in a merge group

// deriveMergeGroupId
return scanner.constructor.name.replace("Impl", "");
```

---

## Impact

**No behaviour change.** Scanner instances are singletons — the same object that `container.resolve(Scanner)` would have returned is now injected up front. The only observable difference is earlier resolution (construction time vs run time) and the merge group ID string format changing from `"Core-DdbScanner"` to `"DdbScanner"`.

---

## Implementation plan

1. **Factory** — add `[Scanner, { multiple: true }]` dep; resolve scanner instance by constructor identity; pass instance to `PipelineBuilder`.
2. **Pipeline + PipelineBuilder** — change scanner field type to instance; rename `scannerToken` → `scanner`.
3. **Runner** — merge group map key = scanner instance; `runMergeGroup` / `runSingleShard` receive scanner instance directly; `deriveMergeGroupId` uses `constructor.name`; drop both `container.resolve(scannerToken)` calls.
4. **Tests + AGENTS.md** — update `Pipeline.test.ts` / `PipelineBuilder.test.ts` (pass `new FakeScanner()` instead of abstraction token); update AGENTS.md.
