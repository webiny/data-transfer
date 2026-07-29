import { z } from "zod";
export const webinyOutputSchema = z
  .object({
    region: z.string().min(1),
    primaryDynamodbTableName: z.string().min(1),
    primaryDynamodbTableArn: z.string().optional(),
    fileManagerBucketId: z.string().min(1),
    auditLogsDynamodbTableName: z.string().optional(),
    opensearchDynamodbTableName: z.string().optional(),
    elasticsearchDynamodbTableName: z.string().optional(),
    opensearchDomainEndpoint: z.string().optional(),
    elasticsearchDomainEndpoint: z.string().optional()
  })
  .passthrough();
function extractAccountId(arn) {
  if (!arn) {
    return undefined;
  }
  const parts = arn.split(":");
  return parts.length >= 5 && parts[4] ? parts[4] : undefined;
}
export function normalizeOutputs(outputs) {
  return {
    region: outputs.region,
    primaryDynamodbTableName: outputs.primaryDynamodbTableName,
    fileManagerBucketId: outputs.fileManagerBucketId,
    auditLogTableName: outputs.auditLogsDynamodbTableName,
    osTableName:
      outputs.opensearchDynamodbTableName ?? outputs.elasticsearchDynamodbTableName ?? "",
    osEndpoint: outputs.opensearchDomainEndpoint ?? outputs.elasticsearchDomainEndpoint ?? "",
    accountId: extractAccountId(outputs.primaryDynamodbTableArn)
  };
}
//# sourceMappingURL=webinyOutput.schema.js.map
