import { createTransferPreset, DdbScanner, DdbProcessor } from "@webiny/data-transfer";

export default createTransferPreset({
    name: "copy-ddb",
    description: "Copy all DynamoDB records from source to target — pure copy, no transformations.",
    async configure({ runner, pipelineBuilderFactory: factory }) {
        const everything = await factory
            .create({
                name: "Regular DynamoDB Table Data",
                scanner: DdbScanner,
                processors: [DdbProcessor]
            })
            .build();

        runner.register(everything);
    }
});
