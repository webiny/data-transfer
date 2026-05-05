import { createTransferPreset } from "~/utils/createTransferPreset.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { S3Processor } from "~/features/S3Processor/index.ts";

export default createTransferPreset({
    name: "copy-files",
    description: "Copy all the S3 files loaded via DynamoDB S3 files.",
    configure({ runner, pipelineBuilderFactory: factory }): void {
        const everything = factory
            .create({
                name: "S3 Files",
                scanner: DdbScanner,
                processors: [S3Processor]
            })
            .build();

        runner.register(everything);
    }
});
