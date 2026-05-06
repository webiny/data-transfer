import {
    createTransferPreset,
    createFilter,
    createDdbTransformer,
    DdbScanner,
    DdbProcessor,
    S3Processor
} from "~/index.ts";

// Matches raw v5 file records (before any wrapInData transformation).
const isFmFile = (r: Record<string, unknown>): boolean => {
    const modelId = (r.modelId || (r.data as Record<string, unknown> | undefined)?.modelId) as
        | string
        | undefined;
    return modelId === "fmFile" || modelId === "wbyFmFile";
};

// Emits an S3 copy command for each file record.
// Source and target key are the same (verbatim copy).
// Adapt if your target bucket uses a different key structure.
const copyFileToTarget = createDdbTransformer("copyFileToTarget", ctx => {
    const values = ctx.record.values as Record<string, unknown> | undefined;
    const key = values?.["text@key"] as string | undefined;
    if (key) {
        ctx.copyFile(key, key);
    }
});

export default createTransferPreset({
    name: "ddb",
    description: "Copy all DDB records verbatim, including S3 file objects.",
    configure({ runner, pipelineBuilderFactory: factory }) {
        // File records first — DDB record auto-put via DdbProcessor.onEnd,
        // S3 object copied via copyFileToTarget.
        // Must be registered BEFORE the catch-all (first-match-wins).
        const files = factory
            .create({
                name: "files",
                scanner: DdbScanner,
                processors: [DdbProcessor, S3Processor]
            })
            .filter(createFilter(isFmFile))
            .use(copyFileToTarget)
            .build();

        // All other records: verbatim DDB copy, no transformation.
        const everything = factory
            .create({ name: "everything", scanner: DdbScanner, processors: [DdbProcessor] })
            .build();

        runner.register(files, everything);
    }
});
