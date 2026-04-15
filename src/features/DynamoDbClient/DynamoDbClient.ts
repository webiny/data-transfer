import { DynamoDbClient as DynamoDbClientAbstraction } from "./abstractions/DynamoDbClient.js";


class DynamoDbClientImpl implements DynamoDbClientAbstraction.Interface {

}

export const DynamoDbClient = DynamoDbClientAbstraction.createImplementation({
  implementation: DynamoDbClientImpl,
  dependencies: [],
});
