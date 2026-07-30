import { createTransferPreset, OsScanner, OsProcessor } from "@webiny/data-transfer";

export default createTransferPreset({
    name: "copy-os",
    description: "Copy all OpenSearch companion table records from source to target — pure copy.",
    async configure({ runner, pipelineBuilderFactory: factory }) {
        const everything = await factory
            .create({
                name: "OpenSearch DynamoDB Table Data",
                scanner: OsScanner,
                processors: [OsProcessor]
            })
            .build();

        runner.register(everything);
    }
});
