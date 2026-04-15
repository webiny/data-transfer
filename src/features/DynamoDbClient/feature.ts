import { createFeature } from "@/src/base/index.js";
import { DynamoDbClient } from "./DynamoDbClient.js";


export const  DynamoDbClientFeature = createFeature({
  name: "Core/DynamoDbClientFeature",
  register(container) {
    container.register(DynamoDbClient);
  }
});
