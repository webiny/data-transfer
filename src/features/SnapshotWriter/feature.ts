import { createFeature } from "~/base/createFeature.ts";
import { SnapshotWriter } from "./SnapshotWriter.ts"; // the createImplementation export

/**
 * Registers the SnapshotWriter abstraction. The single impl handles
 * both enabled and disabled modes — when `config.debug.snapshot` is
 * falsy, write() and close() are cheap no-ops.
 */
export const SnapshotWriterFeature = createFeature({
    name: "Core/SnapshotWriterFeature",
    register(container) {
        container.register(SnapshotWriter).inSingletonScope();
    }
});
