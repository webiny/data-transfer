import { createTransferPreset, OsScanner, OsProcessor } from "~/index.ts";

export default createTransferPreset({
    name: "os",
    description: "Copy all OpenSearch records verbatim.",
    configure({ runner, pipelineBuilderFactory: factory }) {
        const everything = factory
            .create({ name: "everything", scanner: OsScanner, processors: [OsProcessor] })
            .build();

        runner.register(everything);
    }
});
