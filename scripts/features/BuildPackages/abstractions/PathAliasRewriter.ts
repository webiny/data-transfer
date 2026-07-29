import { Abstraction } from "@webiny/di";

export interface IPathAliasRewriter {
    rewrite(distDir: string): void;
}

export const PathAliasRewriter = new Abstraction<IPathAliasRewriter>(
    "Scripts/Build/PathAliasRewriter"
);

export namespace PathAliasRewriter {
    export type Interface = IPathAliasRewriter;
}
