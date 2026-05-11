import { createTransferPreset } from "~/utils/createTransferPreset.ts";
import { DdbScanner } from "~/features/DdbScanner/index.ts";
import { S3Processor } from "~/features/S3Processor/index.ts";
import { isFmFile } from "~/domain/transform/filters.ts";
import { createFilter } from "~/domain/pipeline/index.js";
import { DdbProcessor } from "@/src/index.js";

export default createTransferPreset({
    name: "copy-files",
    description: "Copy all the S3 files loaded via DynamoDB regular table - pure copy.",
    configure({ runner, pipelineBuilderFactory: factory }): void {
        const everything = factory
            .create({
                name: "S3 Files",
                scanner: DdbScanner,
                processors: [DdbProcessor, S3Processor]
            })
            .filter(createFilter(isFmFile))
            .build();

        runner.register(everything);
    }
});
