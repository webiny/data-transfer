import { createTransformer } from "../../transformers/createTransformer.js";
/**
 * Transforms Security Groups to Roles
 * - Changes GROUP -> ROLE in keys and TYPE
 * - Changes GROUPS -> ROLES in GSI keys
 */
export const groupsToRoles = createTransformer("groupsToRoles", ctx => {
  const { record } = ctx;
  // Only process security.group records
  if (record.TYPE !== "security.group") {
    return;
  }
  // Update TYPE
  record.TYPE = "security.role";
  // Update _et if it exists
  if (record._et === "SecurityGroup") {
    record._et = "SecurityRole";
  }
  // Update keys: GROUP -> ROLE, GROUPS -> ROLES
  const keysToUpdate = ["PK", "SK", "GSI1_PK", "GSI1_SK", "GSI2_PK", "GSI2_SK"];
  for (const key of keysToUpdate) {
    if (typeof record[key] === "string") {
      let value = record[key];
      // Replace GROUPS -> ROLES (must come before GROUP -> ROLE)
      value = value.replace(/#GROUPS#/g, "#ROLES#");
      value = value.replace(/#GROUPS$/g, "#ROLES");
      value = value.replace(/^GROUPS#/, "ROLES#");
      // Replace GROUP -> ROLE
      value = value.replace(/#GROUP#/g, "#ROLE#");
      value = value.replace(/#GROUP$/g, "#ROLE");
      value = value.replace(/^GROUP#/, "ROLE#");
      record[key] = value;
    }
  }
});
//# sourceMappingURL=groupsToRoles.js.map
