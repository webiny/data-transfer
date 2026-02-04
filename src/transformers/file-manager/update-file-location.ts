import { Transformer } from "../../core/transformer.ts";
import { TransformContext } from "../../core/types.ts";

/**
 * Updates file key to new S3 path format
 * Old: files/fileId-filename.jpg or fileId/filename.jpg
 * New: tenants/{tenantId}/files/{fileId}/{filename}
 */
export const updateFileLocation: Transformer = {
  name: "updateFileLocation",
  transform(ctx: TransformContext) {
    const { record } = ctx;

    // Only process CMS entries with modelId = wbyFmFile
    if (record.data && typeof record.data === "object") {
      const data = record.data as Record<string, unknown>;

      if (data.modelId !== "wbyFmFile") {
        return;
      }

      const values = (data.values || {}) as Record<string, unknown>;
      const tenant = data.tenant || "root";
      let fileId = (data.id || data.entryId) as string;
      const fileName = values["text@name"];

      if (!fileId || !fileName) {
        return;
      }

      // Strip revision from file ID (e.g., "id#0001" -> "id")
      fileId = fileId.replace(/#\d+$/, "");

      // Update the key in the record to new S3 path format (without revision)
      const newKey = `tenants/${tenant}/files/${fileId}/${fileName}`;
      values["text@key"] = newKey;
    }
  }
};
