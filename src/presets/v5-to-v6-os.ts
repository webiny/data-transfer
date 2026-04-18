import type { MigrationPreset } from "~/domain/transform/Preset.ts";
import type { PipelineRunner } from "~/features/PipelineRunner/abstractions/PipelineRunner.ts";
import { PipelineBuilder } from "~/domain/transform/PipelineBuilder.ts";
import { isCmsEntry } from "~/domain/transform/filters.ts";

// Import global transformers
import { wrapInData } from "../transformers/global/wrapInData.ts";
import { addGsiTenant } from "../transformers/global/addGsiTenant.ts";
import { removeLocale } from "../transformers/global/removeLocale.ts";
import { removeAttributes } from "../transformers/global/removeAttributes.ts";

// Import CMS transformers
import { fixCmePk } from "../transformers/cms/fix-cme-pk.ts";
import { fixBrokenStorageKeys } from "../transformers/cms/fix-broken-storage-keys.ts";
import { transformRichText } from "../transformers/cms/transform-rich-text.ts";
import { updateModelIds } from "../transformers/cms/update-model-ids.ts";
import { removeFolderRevision } from "../transformers/cms/remove-folder-revision.ts";

// ============================================================================
// Webiny v5 to v6 OS Migration Preset
// ============================================================================

/**
 * Preset for migrating CMS entries from the v5 OpenSearch DynamoDB table.
 * Only registers CMS entry pipeline — OS table contains CMS entries
 * (including FM files stored as CMS entries). Pages and other types
 * are skipped during decompression.
 *
 * Uses the same transformers as the DDB preset. The pipeline auto-puts
 * the transformed record as a PUT_RECORD command. The OS executor
 * (in process-os-segment) intercepts these commands, gzips the data,
 * and writes OS-shaped records to the target table.
 */
export const v5ToV6OsPreset: MigrationPreset = {
    name: "v5-to-v6-os",
    description: "Webiny v5 to v6 OpenSearch migration — CMS entries",
    configure(runner: PipelineRunner.Interface): void {
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

        runner.register(cmsEntries);
    }
};

export default v5ToV6OsPreset;
