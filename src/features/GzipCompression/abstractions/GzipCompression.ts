import { createAbstraction } from "@/src/base/index.ts";

interface CompressedValue {
    compression: string;
    value: string;
}

interface IGzipCompression {
    compress<T>(data: T): Promise<CompressedValue>;
    canDecompress(data: unknown): boolean;
    decompress<T>(data: CompressedValue): Promise<T | null>;
}

// ============================================================================
// Abstraction
// ============================================================================

export const GzipCompression = createAbstraction<IGzipCompression>("Core/GzipCompression");

export namespace GzipCompression {
    export type Interface = IGzipCompression;
    export type Compressed = CompressedValue;
}
