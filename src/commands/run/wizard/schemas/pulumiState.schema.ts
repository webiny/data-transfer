import { z } from "zod";

const resourceSchema = z.object({
    type: z.string(),
    outputs: z.record(z.unknown()).optional()
});

export type Resource = z.infer<typeof resourceSchema>;

export const pulumiStateSchema = z.object({
    version: z.literal(3),
    checkpoint: z.object({
        latest: z.object({
            resources: z.array(resourceSchema)
        })
    })
});

export type PulumiState = z.infer<typeof pulumiStateSchema>;

export function extractStackOutputs(state: PulumiState): Record<string, unknown> {
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
