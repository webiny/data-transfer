import { z } from "zod";
import type { RawOutputValues } from "../types.ts";
export declare const webinyOutputSchema: z.ZodObject<
  {
    region: z.ZodString;
    primaryDynamodbTableName: z.ZodString;
    primaryDynamodbTableArn: z.ZodOptional<z.ZodString>;
    fileManagerBucketId: z.ZodString;
    auditLogsDynamodbTableName: z.ZodOptional<z.ZodString>;
    opensearchDynamodbTableName: z.ZodOptional<z.ZodString>;
    elasticsearchDynamodbTableName: z.ZodOptional<z.ZodString>;
    opensearchDomainEndpoint: z.ZodOptional<z.ZodString>;
    elasticsearchDomainEndpoint: z.ZodOptional<z.ZodString>;
  },
  z.core.$loose
>;
export type WebinyOutputs = z.infer<typeof webinyOutputSchema>;
export declare function normalizeOutputs(outputs: WebinyOutputs): RawOutputValues;
//# sourceMappingURL=webinyOutput.schema.d.ts.map
