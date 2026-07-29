import { createTransferPreset } from "../utils/createTransferPreset.js";
import { DdbScanner } from "../features/DdbScanner/index.js";
import { DdbProcessor } from "../features/DdbProcessor/index.js";
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
//# sourceMappingURL=copy-ddb.js.map
