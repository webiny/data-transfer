import { createAbstraction } from "~/base/index.ts";
import type { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import type { BaseTransformContext } from "~/features/TransformContext/abstractions/BaseTransformContext.ts";

interface IS3ProcessorSlice {
    copyFile(sourceKey: string, targetKey: string): void;
    getFile(key: string): Promise<Buffer | null>;
}

interface IS3Processor extends Processor.Interface<
    BaseTransformContext.Interface<unknown>,
    IS3ProcessorSlice
> {}

export const S3Processor = createAbstraction<IS3Processor>("Core/S3Processor");

export namespace S3Processor {
    export type Interface = IS3Processor;
    export type Slice = IS3ProcessorSlice;
}
