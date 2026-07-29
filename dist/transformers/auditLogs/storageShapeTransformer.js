import { createTransformer } from "../../transformers/createTransformer.js";
export const storageShapeTransformer = createTransformer("auditLogs/storageShape", ctx => {
  const { record } = ctx;
  if (!record.createdBy || !record.createdOn) {
    ctx.logger.warn(
      `auditLogs/storageShape: missing createdBy or createdOn — skipping record ${record.PK}/${record.SK}`
    );
    return;
  }
  const tenant = record.tenant;
  const id = record.id;
  const createdBy = record.createdBy;
  const createdOnISO = record.createdOn;
  const createdOnMs = new Date(createdOnISO).getTime();
  const expiresAtISO = record.expiresAt;
  const expiresAtTTL = Math.floor(new Date(expiresAtISO).getTime() / 1000);
  const app = record.app;
  const action = record.action;
  const message = record.message;
  const entity = record.entity;
  const entityId = record.entityId;
  const tags = record.tags;
  const content = record.content;
  ctx.replace({
    PK: `T#${tenant}#AUDIT_LOG`,
    SK: id,
    TYPE: "auditLog.log",
    GSI_TENANT: tenant,
    GSI1_PK: `T#${tenant}#AUDIT_LOG#APP#${app}`,
    GSI1_SK: createdOnMs,
    GSI2_PK: `T#${tenant}#AUDIT_LOG#APP#${app}#CREATEDBY#${createdBy.id}`,
    GSI2_SK: createdOnMs,
    GSI3_PK: `T#${tenant}#AUDIT_LOG#APP#${app}#ENTITY#${entity}`,
    GSI3_SK: createdOnMs,
    GSI4_PK: `T#${tenant}#AUDIT_LOG#ENTITY_ID#${entityId}`,
    GSI4_SK: createdOnMs,
    GSI5_PK: `T#${tenant}#AUDIT_LOG#APP#${app}#ENTITY#${entity}#ACTION#${action}#CREATEDBY#${createdBy.id}`,
    GSI5_SK: createdOnMs,
    GSI6_PK: `T#${tenant}#AUDIT_LOG#APP#${app}#ENTITY#${entity}#ACTION#${action}`,
    GSI6_SK: createdOnMs,
    GSI7_PK: `T#${tenant}#AUDIT_LOG#APP#${app}#ENTITY#${entity}#CREATEDBY#${createdBy.id}`,
    GSI7_SK: createdOnMs,
    GSI8_PK: `T#${tenant}#AUDIT_LOG#CREATEDBY#${createdBy.id}`,
    GSI8_SK: createdOnMs,
    GSI9_PK: `T#${tenant}#AUDIT_LOG#CREATED_ON`,
    GSI9_SK: createdOnMs,
    data: {
      id,
      tenant,
      createdBy,
      createdOn: createdOnISO,
      app,
      action,
      message,
      entity,
      entityId,
      tags,
      expiresAt: expiresAtISO,
      content
    },
    // Root-level expiresAt as Unix seconds — DynamoDB TTL reads this field
    // directly from the item root. data.expiresAt is the ISO equivalent for
    // application use, both derived from transfer time (Date.now() + 60 days).
    expiresAt: expiresAtTTL
  });
});
//# sourceMappingURL=storageShapeTransformer.js.map
