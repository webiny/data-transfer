import {
    createTransferPreset,
    createFilter,
    isFmFile,
    copyFileToTarget,
    DdbScanner,
    DdbProcessor,
    S3Processor
} from "~/index.ts";

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
