import type { BaseRecord } from "../../../domain/transform/types/records.js";
import type { BaseTransformContext } from "./BaseTransformContext.ts";
interface DdbProcessorSlice {
  putRecord(record: Record<string, unknown>): void;
  querySourceRecord<T extends Record<string, unknown> = Record<string, unknown>>(
    pk: string,
    sk?: string
  ): Promise<T | null>;
  queryTargetRecord<T extends Record<string, unknown> = Record<string, unknown>>(
    pk: string,
    sk?: string
  ): Promise<T | null>;
}
interface S3ProcessorSlice {
  copyFile(sourceKey: string, targetKey: string): void;
  getFile(key: string): Promise<Buffer | null>;
}
interface OsProcessorSlice {
  putRecord(record: Record<string, unknown>): void;
  querySourceRecord<T extends Record<string, unknown> = Record<string, unknown>>(
    pk: string,
    sk?: string
  ): Promise<T | null>;
  queryTargetRecord<T extends Record<string, unknown> = Record<string, unknown>>(
    pk: string,
    sk?: string
  ): Promise<T | null>;
}
interface IDdbCoreTransformContext<TRecord = BaseRecord>
  extends BaseTransformContext.Interface<TRecord>, DdbProcessorSlice {}
export declare namespace DdbCoreTransformContext {
  type Interface<TRecord = BaseRecord> = IDdbCoreTransformContext<TRecord>;
}
interface IDdbTransformContext<TRecord = BaseRecord>
  extends BaseTransformContext.Interface<TRecord>, DdbProcessorSlice, S3ProcessorSlice {}
export declare namespace DdbTransformContext {
  type Interface<TRecord = BaseRecord> = IDdbTransformContext<TRecord>;
}
interface IOsTransformContext<TRecord = BaseRecord>
  extends BaseTransformContext.Interface<TRecord>, OsProcessorSlice {}
export declare namespace OsTransformContext {
  type Interface<TRecord = BaseRecord> = IOsTransformContext<TRecord>;
}
export {};
//# sourceMappingURL=contextAliases.d.ts.map
