import type { Abstraction, Constructor } from "@webiny/di";
import { createAbstraction } from "~/base/index.ts";
import type { Scanner } from "~/domain/pipeline/abstractions/Scanner.ts";
import type { Processor } from "~/domain/pipeline/abstractions/Processor.ts";
import type { Pipeline } from "~/domain/pipeline/Pipeline.ts";
import type { PipelineBuilder } from "~/domain/pipeline/PipelineBuilder.ts";

type ScannerImplBase = Constructor<Scanner.Interface<any, any>> & {
    __abstraction: Abstraction<unknown>;
};

type ProcessorImplBase = Constructor<Processor.Interface<any, any>> & {
    __abstraction: Abstraction<unknown>;
};

type ScannerRecord<S> =
    S extends Constructor<{ scan(shard: any): AsyncIterable<infer R> }> ? R : never;

type ScannerShard<S> = S extends Constructor<{ scan(shard: infer Sh): any }> ? Sh : never;

type ProcessorRecord<P> =
    P extends Constructor<{ createContext(record: infer R): any }> ? R : never;

type ProcessorContext<P> =
    P extends Constructor<{ createContext(record: any): infer C }> ? C : never;

// Bidirectional equality check: stricter than simple `extends` because
// OsRecord extends BaseRecord, so a one-directional check would let DDB
// scanner + OS processor through. We need exact record-type match.
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

export interface PipelineFactoryInput<TScanner, TProcessor> {
    name: string;
    scanner: TScanner;
    processor: TProcessor;
}

export interface RunOptions {
    /** Zero-based index of the shard this runner invocation should process. */
    segment: number;
    /** Total number of shards. Must match the scanner's reported shard count. */
    totalSegments: number;
}

interface IPipelineRunner {
    pipeline<TScanner extends ScannerImplBase, TProcessor extends ProcessorImplBase>(
        input: PipelineFactoryInput<
            TScanner,
            Exact<ProcessorRecord<TProcessor>, ScannerRecord<TScanner>> extends true
                ? TProcessor
                : never
        >
    ): PipelineBuilder<
        ScannerRecord<TScanner>,
        ProcessorContext<TProcessor> extends Processor.Context
            ? ProcessorContext<TProcessor>
            : Processor.Context,
        ScannerShard<TScanner>
    >;

    /**
     * Register one or more pipelines. Heterogeneous record/context types are
     * allowed (each pipeline runs with its own scanner+processor pair); the
     * parameter type is intentionally widened so concrete narrow pipelines
     * are accepted without casts.
     */
    register(...pipelines: Pipeline<any, any, any>[]): this;

    run(opts?: RunOptions): Promise<void>;

    getProcessors(): Processor.Interface<unknown, Processor.Context>[];
}

export const PipelineRunner = createAbstraction<IPipelineRunner>("Core/PipelineRunner");

export namespace PipelineRunner {
    export type Interface = IPipelineRunner;
    export type FactoryInput<TScanner, TProcessor> = PipelineFactoryInput<TScanner, TProcessor>;
    export type Run = RunOptions;
}
