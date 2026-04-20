import { describe, expectTypeOf, it } from "vitest";
import { createDdbContainer } from "../../containers/index.ts";
import { PipelineBuilderFactory } from "~/features/PipelineBuilderFactory/index.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { DdbProcessor } from "~/features/DdbProcessor/index.ts";
import { OsScanner } from "~/features/OsScanner/index.ts";
import { OsProcessor } from "~/features/OsProcessor/index.ts";
// The S3Processor index re-exports the abstraction token; the Impl class we
// need for factory.create({ processors: [...] }) lives in the impl file.
import { S3Processor } from "~/features/S3Processor/S3Processor.ts";

/**
 * Type-level fixture for PipelineBuilderFactory.create({ processors: [...] }).
 * The tests here don't assert runtime behavior — they exercise the TS
 * inference path that flows processor slices into the builder's transformer
 * context.
 *
 * The `@ts-expect-error` assertions verify the compile-time guard rails
 * documented in the slice-merging spec:
 *   1. Single-processor pipeline exposes the processor's slice on ctx.
 *   2. Multi-processor pipeline exposes the union of all slices.
 *   3. Transformers reaching for a helper missing from the processor list
 *      (e.g. `ctx.copyFile` without S3Processor) → property access fails.
 *   4. Slice-key collisions (DdbProcessor + OsProcessor share `putRecord`)
 *      → DisjointKeys<...> produces `never`, rejecting the assignment.
 */
describe("PipelineBuilderFactory.create() slice inference", () => {
    it("single-processor pipeline exposes the processor's slice on ctx", () => {
        const factory = createDdbContainer().resolve(PipelineBuilderFactory);
        const builder = factory.create({
            name: "ddb-only",
            scanner: DdbScanner,
            processors: [DdbProcessor]
        });
        expectTypeOf(builder.use).toBeFunction();
        builder.use(ctx => {
            // DdbProcessor contributes putRecord(...) via its slice.
            ctx.putRecord(ctx.record as Record<string, unknown>);
        });
    });

    it("multi-processor pipeline exposes the union of all slices on ctx", () => {
        const factory = createDdbContainer().resolve(PipelineBuilderFactory);
        const builder = factory.create({
            name: "ddb+s3",
            scanner: DdbScanner,
            processors: [DdbProcessor, S3Processor]
        });
        builder.use(ctx => {
            // Both slices are visible on ctx — putRecord from DdbProcessor
            // and copyFile from S3Processor.
            ctx.putRecord(ctx.record as Record<string, unknown>);
            ctx.copyFile("source-key", "target-key");
        });
    });

    it("missing processor → transformer using its helper fails to compile", () => {
        const factory = createDdbContainer().resolve(PipelineBuilderFactory);
        const builder = factory.create({
            name: "ddb-no-s3",
            scanner: DdbScanner,
            processors: [DdbProcessor]
        });
        builder.use(ctx => {
            // @ts-expect-error — copyFile belongs to S3Processor; not in processors[]
            ctx.copyFile("s", "t");
        });
    });

    it("two processors with overlapping slice keys → fails to compile", () => {
        const factory = createDdbContainer().resolve(PipelineBuilderFactory);
        factory.create({
            name: "ddb+os",
            scanner: DdbScanner,
            // @ts-expect-error — DdbProcessor + OsProcessor both contribute `putRecord`;
            // DisjointKeys<...> narrows processors to `never`.
            processors: [DdbProcessor, OsProcessor]
        });
    });

    it("empty processors array → fails to compile (NonEmptyArray rejects)", () => {
        const factory = createDdbContainer().resolve(PipelineBuilderFactory);
        factory.create({
            name: "none",
            scanner: DdbScanner,
            // @ts-expect-error — processors must be NonEmptyArray<Processor>
            processors: []
        });
    });

    it("mismatched scanner + processor record type (type-level probe)", () => {
        // NOTE: Under the current processor shape (all impls use
        // BaseTransformContext.Interface<unknown> as TBase), scanner/processor
        // record-type mismatch is NOT catchable at the type level — processors
        // are record-agnostic and accept any TRecord. This case is kept as a
        // placeholder: when processor impls tighten TBase to Base<BaseRecord>
        // / Base<OsRecord>, the commented assertion should start failing (and
        // the @ts-expect-error re-enabled).
        const factory = createDdbContainer().resolve(PipelineBuilderFactory);
        const _builder = factory.create({
            name: "os-scanner-ddb-processor",
            scanner: OsScanner,
            processors: [DdbProcessor]
        });
        void _builder;
    });
});
