import type { MigrationPreset, MigrationConfig } from "@/src/core/types.js";
import { MigrationRunner } from "@/src/core/runner.ts";
import { DatabaseClient } from "@/src/database/interface.ts";
import { PipelineBuilder, isCmsModel, isCmsEntry, isFmFile } from "@/src/core/pipelines.ts";
import { Transformer } from "@/src/core/transformer.js";
import { TransformContext } from "@/src/core/types.js";

// Import transformers
import { wrapInData } from "@/src/transformers/global/wrap-in-data.ts";
import { addGsiTenant } from "@/src/transformers/global/add-gsi-tenant.ts";
import { removeLocale } from "@/src/transformers/global/remove-locale.ts";
import { removeAttributes } from "@/src/transformers/global/remove-attributes.ts";
import { fixCmePk } from "@/src/transformers/cms/fix-cme-pk.ts";
import { fixBrokenStorageKeys } from "@/src/transformers/cms/fix-broken-storage-keys.ts";
import { transformRichText } from "@/src/transformers/cms/transform-rich-text.ts";
import { updateModelIds } from "@/src/transformers/cms/update-model-ids.ts";
import { removeFolderRevision } from "@/src/transformers/cms/remove-folder-revision.ts";
import { transformModelGroup } from "@/src/transformers/cms/transform-model-group.ts";
import { FmFilePipeline } from "@/src/presets/v5-to-v6/FmFilePipeline.js";
import { CmsModelPipeline } from "@/src/presets/v5-to-v6/CmsModelPipeline.js";
import { CmsEntryPipeline } from "@/src/presets/v5-to-v6/CmsEntryPipeline.js";

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
        // Execute File Manager pipeline on both records
        const fmPipeline = new FmFilePipeline();

        await ctx.executePipeline(fmPipeline, fileRecords);
      }
    }
  }
};

const PARTNER_MODEL_ID = "partner";

export const preset: MigrationPreset = {
  name: "v5-cms-model-with-files",
  description: "Migrate specific model with referenced files from v5 to v6",
  configure(runner: MigrationRunner): void {
    const modelPipeline = new CmsModelPipeline()
      .filter(record => record.modelId === PARTNER_MODEL_ID)
      .build();

    const entriesPipeline = new CmsEntryPipeline()
      .filter(record => record.modelId === PARTNER_MODEL_ID)
      .use(copyPartnerFiles)
      .build();

    runner.register(modelPipeline).register(entriesPipeline);
  }
};
