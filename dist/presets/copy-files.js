import { createTransferPreset } from "../utils/createTransferPreset.js";
import { DdbScanner } from "../features/DdbScanner/index.js";
import { S3Processor } from "../features/S3Processor/index.js";
import { isFmFile } from "../domain/transform/filters.js";
import { createFilter } from "../domain/pipeline/index.js";
import { DdbProcessor } from "../features/DdbProcessor/index.js";
export default createTransferPreset({
  name: "copy-files",
  description: "Copy all the S3 files loaded via DynamoDB regular table - pure copy.",
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
//# sourceMappingURL=copy-files.js.map
