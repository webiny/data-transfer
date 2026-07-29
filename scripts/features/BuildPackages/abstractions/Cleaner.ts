import { Abstraction } from "@webiny/di";

export interface ICleaner {
  clean(absDir: string): void;
}

export const Cleaner = new Abstraction<ICleaner>("Scripts/Build/Cleaner");

export namespace Cleaner {
  export type Interface = ICleaner;
}
