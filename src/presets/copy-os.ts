import { createTransferPreset } from "~/utils/createTransferPreset.ts";
import { OsProcessor, OsScanner } from "@/src/index.js";

export default createTransferPreset({
    name: "copy-os",
    description: "Copy all the data from one table to another + files - OpenSearch only.",
    configure({ runner, pipelineBuilderFactory: factory }): void {
        const everything = factory
            .create({
                name: "OpenSearch DynamoDB Table Data",
                scanner: OsScanner,
                processors: [OsProcessor]
            })
            .build();

        runner.register(everything);
    }
});
