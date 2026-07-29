import { createTransferPreset } from "~/utils/createTransferPreset.js";
import { OsScanner } from "~/features/OsScanner/index.js";
import { OsProcessor } from "~/features/OsProcessor/index.js";

export default createTransferPreset({
    name: "copy-os",
    description: "Copy all the data from one table to another + files - OpenSearch only.",
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
