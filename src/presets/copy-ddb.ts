import { createTransferPreset } from "~/utils/createTransferPreset.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { DdbProcessor } from "~/features/DdbProcessor/index.ts";
import { S3Processor } from "~/features/S3Processor/index.ts";

export default createTransferPreset({
    name: "copy-ddb",
    description: "Copy all the data from one table to another + files - DynamoDB only.",
    configure({ runner, pipelineBuilderFactory: factory }): void {
        const everything = factory
            .create({
                name: "Everything",
                scanner: DdbScanner,
                processors: [DdbProcessor, S3Processor]
            })
            .build();

        runner.register(everything);
    }
});
