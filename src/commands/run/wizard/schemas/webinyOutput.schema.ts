import { z } from "zod";
import type { RawOutputValues } from "../types.ts";

export const webinyOutputSchema = z
    .object({
        region: z.string(),
        primaryDynamodbTableName: z.string(),
        fileManagerBucketId: z.string(),
        opensearchDynamodbTableName: z.string().optional(),
        elasticsearchDynamodbTableName: z.string().optional(),
        opensearchDomainEndpoint: z.string().optional(),
        elasticsearchDomainEndpoint: z.string().optional()
    })
    .passthrough();

export type WebinyOutputs = z.infer<typeof webinyOutputSchema>;

export function normalizeOutputs(outputs: WebinyOutputs): RawOutputValues {
    return {
        region: outputs.region,
        primaryDynamodbTableName: outputs.primaryDynamodbTableName,
        fileManagerBucketId: outputs.fileManagerBucketId,
        osTableName:
            outputs.opensearchDynamodbTableName ?? outputs.elasticsearchDynamodbTableName ?? "",
        osEndpoint:
            outputs.opensearchDomainEndpoint ?? outputs.elasticsearchDomainEndpoint ?? ""
    };
}
