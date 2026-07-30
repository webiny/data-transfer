import {
    createTransferPreset,
    createFilter,
    isFmFile,
    DdbScanner,
    DdbProcessor,
    S3Processor
} from "@webiny/data-transfer";

export default createTransferPreset({
    name: "copy-files",
    description: "Copy all S3 files (file manager records) from source to target — pure copy.",
    async configure({ runner, pipelineBuilderFactory: factory }) {
        const everything = await factory
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
