import { z } from "zod";
import type { RawOutputValues } from "../types.ts";

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

export type WebinyOutputs = z.infer<typeof webinyOutputSchema>;

function extractAccountId(arn: string | undefined): string | undefined {
    if (!arn) {
        return undefined;
    }
    const parts = arn.split(":");
    return parts.length >= 5 && parts[4] ? parts[4] : undefined;
}

export function normalizeOutputs(outputs: WebinyOutputs): RawOutputValues {
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
