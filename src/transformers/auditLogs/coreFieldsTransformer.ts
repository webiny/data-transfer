import { mdbid } from "@webiny/utils/mdbid.js";
import { createTransformer } from "~/transformers/createTransformer.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

export const coreFieldsTransformer = createTransformer<BaseTransformContext.Interface<BaseRecord>>(
    "auditLogs/coreFields",
    ctx => {
        const { record } = ctx;
        record.id = mdbid();
        record.createdBy = record.revisionCreatedBy;
        record.createdOn = record.revisionCreatedOn;
        record.expiresAt = new Date(Date.now() + SIXTY_DAYS_MS).toISOString();
    }
);
