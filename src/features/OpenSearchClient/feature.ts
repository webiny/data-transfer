import { createFeature } from "@/src/base/index.ts";
import { OpenSearchClientImpl } from "./OpenSearchClient.ts";
import { OpenSearchClient } from "./abstractions/OpenSearchClient.ts";
import { OpenSearchClientConfig } from "./abstractions/OpenSearchClientConfig.ts";

export const OpenSearchClientFeature = createFeature({
  name: "Core/OpenSearchClientFeature",
  register(container) {
    const config = container.resolve(OpenSearchClientConfig);
    const client = new OpenSearchClientImpl(config);
    container.registerInstance(OpenSearchClient, client);
  }
});
