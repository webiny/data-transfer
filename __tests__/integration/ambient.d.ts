declare module "dynalite" {
    import type { Server } from "node:http";

    interface DynaliteOptions {
        path?: string;
        createTableMs?: number;
        deleteTableMs?: number;
        updateTableMs?: number;
        ssl?: boolean;
        maxItemSizeKb?: number;
    }

    function dynalite(options?: DynaliteOptions): Server;
    export = dynalite;
}
