import type { MigrationPreset } from "@/src/presets/types.js";
import { CmsModelPipeline, CmsEntryPipeline } from "@/src/pipelines.ts";
import { MigrationRunner } from "@/src/core/runner.ts";
import { Transformer } from "@/src/core/transformer.js";
import { TransformContext } from "@/src/core/types.js";
import { FmFilePipeline } from "@/src/pipelines.ts";

// ============================================================================
// Migrate specific model with referenced files
// ============================================================================
export const copyPartnerFiles: Transformer = {
  name: "copyPartnerFiles",
  async transform(ctx: TransformContext) {
    if (ctx.record.TYPE !== "cms.entry.l") {
      return;
    }

    // TODO: find file fields, and extract file ID from file URL
    const fileId = "";

    if (fileId) {
      // Query both CMS records (latest + published)
      const latestRecord = await ctx.queryRecord(`T#root#L#en-US#CMS#CME#CME#${fileId}`, "L");

      const publishedRecord = await ctx.queryRecord(
        `T#root#L#en-US#CMS#CME#CME#${fileId}`,
        "REV#0001"
      );

      const fileRecords = [latestRecord, publishedRecord].filter(Boolean) as Record<string, any>[];

      if (fileRecords.length > 0) {
        // Execute FmFilePipeline on both records
        const fmPipeline = new FmFilePipeline().build();

        await ctx.executePipeline(fmPipeline, fileRecords);
      }
    }
  }
};

const PARTNER_MODEL_ID = "partner";

export const preset: MigrationPreset = {
  name: "cms-model-with-files",
  description: "Migrate specific model with referenced files",
  configure(runner: MigrationRunner): void {
    const entriesPipeline = new CmsEntryPipeline()
      .filter(record => record.modelId === PARTNER_MODEL_ID)
      .use(copyPartnerFiles)
      .build();

    const modelPipeline = new CmsModelPipeline()
      .filter(record => record.modelId === PARTNER_MODEL_ID)
      .build();

    runner.register(modelPipeline).register(entriesPipeline);
  }
};
