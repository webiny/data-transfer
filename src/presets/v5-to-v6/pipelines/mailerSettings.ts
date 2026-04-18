import type { BaseRecord } from "~/domain/transform/types/records.ts";
import { createDdbPipeline, createFilter } from "~/domain/pipeline/index.ts";
import { removeAttributes, wrapInData } from "~/transformers/global/index.ts";
import { migrateMailerSettings } from "~/transformers/mailer/index.ts";

interface MailerSettingsRecord extends BaseRecord {
    modelId?: string;
}

const isMailerSettings = (record: BaseRecord): boolean => {
    return record.SK === "L" && (record as MailerSettingsRecord).modelId === "mailerSettings";
};

export const mailerSettingsPipeline = createDdbPipeline("mailer-settings", builder => {
    builder
        .filter(createFilter<BaseRecord>(isMailerSettings))
        .use(wrapInData)
        .use(migrateMailerSettings)
        .use(removeAttributes);
});
