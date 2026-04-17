import type { MigrationPreset } from "~/domain/transform/Preset.ts";
import type { PipelineRunner } from "~/features/PipelineRunner/abstractions/PipelineRunner.ts";
import { PipelineBuilder } from "~/domain/transform/PipelineBuilder.ts";
import { isCmsModel, isCmsEntry } from "~/domain/transform/filters.ts";

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

// ============================================================================
// CMS-Only Migration Preset
// ============================================================================

export const preset: MigrationPreset = {
    name: "cms-only",
    description: "Migrate only CMS models and entries",
    configure(runner: PipelineRunner.Interface): void {
        // CMS Models pipeline
        const cmsModels = new PipelineBuilder()
            .filter(isCmsModel)
            .use(wrapInData)
            .use(addGsiTenant)
            .use(removeLocale)
            .use(transformModelGroup)
            .use(removeAttributes)
            .build();

        // CMS Entries pipeline
        const cmsEntries = new PipelineBuilder()
            .filter(isCmsEntry)
            .use(wrapInData)
            .use(addGsiTenant)
            .use(removeLocale)
            .use(fixCmePk)
            .use(fixBrokenStorageKeys)
            .use(transformRichText)
            .use(updateModelIds)
            .use(removeFolderRevision)
            .use(removeAttributes)
            .build();

        // Register pipelines
        runner.register(cmsModels).register(cmsEntries);
    }
};
