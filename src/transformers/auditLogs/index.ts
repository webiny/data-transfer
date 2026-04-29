import { coreFieldsTransformer } from "./coreFieldsTransformer.ts";
import { dataFieldsTransformer } from "./dataFieldsTransformer.ts";
import { storageShapeTransformer } from "./storageShapeTransformer.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";
import type { BaseRecord } from "~/domain/transform/types/records.ts";
import type { Transformer } from "~/domain/pipeline/abstractions/Transformer.ts";

export const auditLogTransformers: Transformer.Interface<
    BaseTransformContext.Interface<BaseRecord>
>[] = [coreFieldsTransformer, dataFieldsTransformer, storageShapeTransformer];
