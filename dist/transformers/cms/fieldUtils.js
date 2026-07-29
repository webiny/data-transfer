// ============================================================================
// Field Utility Functions
// ============================================================================
/**
 * Computes the correct storageId for a field based on its type and id.
 * Correct format: {type}@{id}
 *
 * @example
 * field = { type: "dynamicZone", id: "teaserRoutingCards" }
 * returns "dynamicZone@teaserRoutingCards"
 */
export function getCorrectStorageId(field) {
  return `${field.type}@${field.id}`;
}
/**
 * Checks if a field's storageId is corrupted (doesn't match expected format)
 */
export function isStorageIdCorrupt(field) {
  const expected = getCorrectStorageId(field);
  return field.storageId !== expected;
}
//# sourceMappingURL=fieldUtils.js.map
