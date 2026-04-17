import type { MigrationPreset } from "~/domain/transform/Preset.ts";
import type { PipelineRunner } from "~/features/PipelineRunner/abstractions/PipelineRunner.ts";
import { PipelineBuilder } from "~/domain/transform/PipelineBuilder.ts";

export const example: MigrationPreset = {
  name: "example",
  description: "Example complex preset",
  configure(runner: PipelineRunner.Interface): void {
    
    const regularPipeline = new PipelineBuilder({
      processor: RegularProcessor,
      scanner: RegularDynamoDbTableScanner
    })
      // after this point, the pipeline build knows that the record is of Regular type (not opensearch)
      // so only filters and transformations that are compatible with that type can be used, which prevents mistakes like using an opensearch-specific filter on a regular record
      .filter(
        someFilerWhichOnlyWorksOnDynamoDbRegularRecord
      )
      .use(someTransformation)
      .use(someOtherTransformation)
      .build();
    
    const s3Pipeline = new PipelineBuilder({
      processor: S3Processor,
      scanner: S3Scanner
    })
      .filter(
        filterFile
      )
      .use(someS3Transformation)
      .use(someOtherS3Transformation)
      .build();
    
    const osPipeline = new PipelineBuilder({
      processor: OSProcessor,
      scanner: OSTableScanner
    })
      .filter(
        // probably not required, but you get the point
        filterOsRecord
      )
      .use(someOsTransformation)
      .use(someOtherOsTransformation)
      .beforeExecuteCommands(
        DisableOsIndexesWhichAreGettingTouched
      )
      .afterExecuteCommands(
        ReenableOsIndexes
      )
      .build();
    
    runner
      .register(regularPipeline)
      .register(s3Pipeline)
  }
};

// Export as default for easier importing
export default v5ToV6Preset;
