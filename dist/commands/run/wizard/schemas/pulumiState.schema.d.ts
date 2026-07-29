import { z } from "zod";
declare const resourceSchema: z.ZodObject<
  {
    type: z.ZodString;
    outputs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  },
  z.core.$strip
>;
export type Resource = z.infer<typeof resourceSchema>;
export declare const pulumiStateSchema: z.ZodObject<
  {
    version: z.ZodLiteral<3>;
    checkpoint: z.ZodObject<
      {
        latest: z.ZodObject<
          {
            resources: z.ZodArray<
              z.ZodObject<
                {
                  type: z.ZodString;
                  outputs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                },
                z.core.$strip
              >
            >;
          },
          z.core.$strip
        >;
      },
      z.core.$strip
    >;
  },
  z.core.$strip
>;
export type PulumiState = z.infer<typeof pulumiStateSchema>;
export declare function extractStackOutputs(state: PulumiState): Record<string, unknown>;
export {};
//# sourceMappingURL=pulumiState.schema.d.ts.map
