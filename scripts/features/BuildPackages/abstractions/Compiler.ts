import { Abstraction } from "@webiny/di";

export interface ICompiler {
    compile(packageRelDir: string): void;
}

export const Compiler = new Abstraction<ICompiler>("Scripts/Build/Compiler");

export namespace Compiler {
    export type Interface = ICompiler;
}
