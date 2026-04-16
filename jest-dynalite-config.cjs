const createTable = tableName => ({
  TableName: tableName,
  KeySchema: [
    { AttributeName: "PK", KeyType: "HASH" },
    { AttributeName: "SK", KeyType: "RANGE" }
  ],
  AttributeDefinitions: [
    { AttributeName: "PK", AttributeType: "S" },
    { AttributeName: "SK", AttributeType: "S" }
  ],
  ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 }
});

module.exports = {
  tables: [createTable("source-primary"), createTable("source-os"), createTable("target-os")],
  basePort: 8000
};
