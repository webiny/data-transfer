import { z } from "zod";
const resourceSchema = z.object({
  type: z.string(),
  outputs: z.record(z.string(), z.unknown()).optional()
});
export const pulumiStateSchema = z.object({
  version: z.literal(3),
  checkpoint: z.object({
    latest: z.object({
      resources: z.array(resourceSchema)
    })
  })
});
export function extractStackOutputs(state) {
  const stackResource = state.checkpoint.latest.resources.find(
    r => r.type === "pulumi:pulumi:Stack"
  );
  if (!stackResource) {
    throw new Error(
      "No pulumi:pulumi:Stack resource found in state file. Is this a valid Pulumi state?"
    );
  }
  if (!stackResource.outputs) {
    throw new Error("Stack resource has no outputs. The state file may be incomplete.");
  }
  return stackResource.outputs;
}
//# sourceMappingURL=pulumiState.schema.js.map
