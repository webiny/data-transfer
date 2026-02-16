import { Transformer } from "../../core/transformer.ts";
import { TransformContext } from "../../core/types.ts";

/**
 * Creates file metadata records in KeyValue format for file entries
 * and emits S3 copy commands to move files to new location
 */
export const createFileMetadata: Transformer = {
  name: "createFileMetadata",
  transform(ctx: TransformContext) {
    const { record } = ctx;

    if (record.data && typeof record.data === "object") {
      const data = record.data as Record<string, unknown>;

      if (record.TYPE !== "cms.entry.l") {
        return;
      }

      // Extract file information
      const values = (data.values || {}) as Record<string, unknown>;
      let fileId = (data.id || data.entryId) as string;
      const tenant = data.tenant || "root";
      const fileName = values["text@name"];

      if (!fileId || !fileName) {
        return;
      }

      // Extract metadata from file values
      const oldKey = values["text@key"] as string;
      const contentType = values["text@type"];
      const size = values["number@size"];

      // Strip revision from file ID (e.g., "id#0001" -> "id")
      fileId = fileId.replace(/#\d+$/, "");

      // Calculate new S3 key
      const newKey = `tenants/${tenant}/files/${oldKey}`;

      // Copy file to new S3 location if needed
      if (oldKey && oldKey !== newKey) {
        ctx.copyFile(oldKey, newKey);
      }

      // Create metadata record with NEW bucketKey
      const metadataRecord = {
        PK: `KV#global:FileManager/File/${fileId}/Metadata`,
        SK: "A",
        GSI_TENANT: "global",
        data: {
          key: `FileManager/File/${fileId}/Metadata`,
          scope: "global",
          value: {
            bucketKey: newKey, // Use the NEW S3 key
            contentType,
            id: fileId,
            size,
            tenant
          }
        },
        TYPE: "KeyValueStore",
        _ct: new Date().toISOString(),
        _et: "KeyValueStore",
        _md: new Date().toISOString()
      };

      ctx.putPrimaryRecord(metadataRecord);
    }
  }
};
