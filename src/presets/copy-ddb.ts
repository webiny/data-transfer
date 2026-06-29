import { createTransferPreset } from "~/utils/createTransferPreset.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { DdbProcessor } from "~/features/DdbProcessor/index.ts";

export default createTransferPreset({
    name: "copy-ddb",
    description: "Copy all the data from one table to another - DynamoDB only.",
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
