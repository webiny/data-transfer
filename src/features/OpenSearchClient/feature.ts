import { createFeature } from "@/src/base/index.ts";
import { OpenSearchClient } from "./OpenSearchClient.ts";
import { EnableRefreshHook } from "./hooks/EnableRefreshHook.ts";

export const OpenSearchClientFeature = createFeature({
    name: "Core/OpenSearchClientFeature",
    register(container) {
        container.register(OpenSearchClient).inSingletonScope();

        // Register after-transfer hook to re-enable refresh
        // Before-transfer is handled just-in-time by the OS executor
        container.register(EnableRefreshHook);
    }
});
