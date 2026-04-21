import { createFeature } from "~/base/createFeature.ts";
import { JsonlSnapshotWriter } from "./JsonlSnapshotWriter.ts";

/**
 * Registers the SnapshotWriter abstraction. JsonlSnapshotWriter handles
 * both modes (enabled via `config.debug.snapshot` / disabled = no-op)
 * so this feature doesn't need to inspect the config itself.
 */
export const SnapshotWriterFeature = createFeature({
    name: "Core/SnapshotWriterFeature",
    register(container) {
        container.register(JsonlSnapshotWriter).inSingletonScope();
    }
});
